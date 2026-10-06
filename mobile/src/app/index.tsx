import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { makeRedirectUri } from 'expo-auth-session'
import * as QueryParams from 'expo-auth-session/build/QueryParams'
import * as WebBrowser from 'expo-web-browser'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabasePublicKey } from '../lib/supabase'
import { CartLine, formatNaira, Product, Variant } from '../lib/types'

WebBrowser.maybeCompleteAuthSession()

type Tab = 'Shop' | 'Bag' | 'Account'
type DeliveryDetails = { full_name: string; phone: string; address: string; city: string; state: string; country: string }
const redirectTo = makeRedirectUri({ scheme: 'pearlcollections', path: 'auth/callback' })

export default function HomeScreen() {
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState<Tab>('Shop')
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [cartReady, setCartReady] = useState(!supabase)
  const [working, setWorking] = useState(false)
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [category, setCategory] = useState('All')
  const [message, setMessage] = useState('')
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [emailNotice, setEmailNotice] = useState('')
  const [delivery, setDelivery] = useState<DeliveryDetails>({ full_name: '', phone: '', address: '', city: '', state: '', country: 'Nigeria' })
  const skipSave = useRef(false)
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve())
  const currentUserId = useRef<string | null>(null)

  const loadCart = useCallback(async (userId: string) => {
    if (!supabase) return
    const { data, error } = await supabase.from('cart_items')
      .select('quantity,products(id,name,description,price,category,gender,image_url,is_active),product_variants(id,size,colour,stock_quantity)')
      .eq('user_id', userId)
    if (error) throw error
    const lines = (data ?? []).flatMap(row => {
      const product = row.products as unknown as Omit<Product, 'product_variants'> | null
      const variant = row.product_variants as unknown as Variant | null
      return product && variant ? [{ product: { ...product, product_variants: [variant] }, variant, quantity: row.quantity }] : []
    })
    return lines
  }, [])

  useEffect(() => {
    if (!supabase) return
    let alive = true
    void Promise.all([
      supabase.from('products')
        .select('id,name,description,price,category,gender,image_url,is_active,product_variants(id,size,colour,stock_quantity)')
        .eq('is_active', true).order('created_at', { ascending: false }),
      supabase.auth.getSession(),
    ]).then(([productResult, sessionResult]) => {
      if (!alive) return
      if (productResult.data) setProducts(productResult.data as unknown as Product[])
      setSession(sessionResult.data.session)
      if (!sessionResult.data.session) setCartReady(true)
      setLoading(false)
    }).catch(() => {
      if (alive) { setMessage('Could not connect. Check your internet and Supabase settings.'); setLoading(false) }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      const nextUserId = nextSession?.user.id ?? null
      if (nextUserId !== currentUserId.current) {
        currentUserId.current = nextUserId
        setCartReady(Boolean(!nextUserId))
        if (!nextSession) setCart([])
      }
    })
    return () => { alive = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!supabase || !session?.user.id) return
    let alive = true
    void loadCart(session.user.id).then(lines => { if (alive && lines) { setCart(lines); setCartReady(true) } })
      .catch(() => { if (alive) setMessage('Your shared bag could not be loaded.') })
    const channel = supabase.channel(`mobile-cart-${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cart_items', filter: `user_id=eq.${session.user.id}` }, () => {
        void loadCart(session.user.id).then(lines => {
          if (!alive || !lines) return
          skipSave.current = true
          setCart(lines)
        }).catch(() => undefined)
      }).subscribe()
    return () => { alive = false; void supabase?.removeChannel(channel) }
  }, [session?.user.id, loadCart])

  useEffect(() => {
    const client = supabase
    if (!client || !session?.user.id || !cartReady) return
    if (skipSave.current) { skipSave.current = false; return }
    const payload = cart.map(line => ({ variant_id: line.variant.id, quantity: line.quantity }))
    saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
      const { error } = await client.rpc('save_cart', { p_items: payload })
      if (error) throw error
    }).catch(() => setMessage('Your bag could not be saved. Please try again.'))
  }, [cart, cartReady, session?.user.id])

  const categories = useMemo(() => ['All', ...new Set(products.map(p => p.category))], [products])
  const visibleProducts = products.filter(product => category === 'All' || product.category === category)
  const itemCount = cart.reduce((total, line) => total + line.quantity, 0)
  const subtotal = cart.reduce((total, line) => total + line.product.price * line.quantity, 0)

  const signIn = async () => {
    if (!supabase || !supabasePublicKey) { setMessage('Add the Supabase settings to mobile/.env to connect this app.'); return }
    setWorking(true)
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: { apikey: supabasePublicKey },
        },
      })
      if (error) throw error
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
      if (result.type === 'success') {
        const { params, errorCode } = QueryParams.getQueryParams(result.url)
        if (errorCode) throw new Error(errorCode)
        const accessToken = params.access_token
        const refreshToken = params.refresh_token
        if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') throw new Error('Google sign-in did not return a session.')
        const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (sessionError) throw sessionError
        setTab('Shop')
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Google sign-in failed.') }
    finally { setWorking(false) }
  }

  const submitOrderRequest = async () => {
    if (!supabase || !session) { setCheckoutError('Sign in before placing an order request.'); return }
    if (!cart.length || !cartReady) { setCheckoutError('Your bag is empty or still loading.'); return }
    if (Object.values(delivery).some(value => !value.trim())) { setCheckoutError('Please complete every delivery field.'); return }
    setCheckoutBusy(true)
    setCheckoutError('')
    setEmailNotice('')
    try {
      const { data, error } = await supabase.rpc('place_order', { p_delivery: delivery })
      if (error) throw error
      const result = data as { order_id?: string; order_number?: string } | null
      setOrderNumber(result?.order_number ?? '')
      setCart([])
      if (result?.order_id) {
        const { error: emailError } = await supabase.functions.invoke('send-order-email', { body: { orderId: result.order_id } })
        if (emailError) setEmailNotice('Your order is saved, but the confirmation email could not be sent. Please contact Pearl Collections to confirm it.')
      }
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'We could not place your order request. Your bag is still saved.')
    } finally {
      setCheckoutBusy(false)
    }
  }

  const add = (product: Product) => {
    if (!session) { setMessage('Sign in to use the same bag as the website.'); setTab('Account'); return }
    const variant = product.product_variants.find(v => v.id === selected[product.id]) ?? product.product_variants.find(v => v.stock_quantity > 0)
    if (!variant) { setMessage('This item is currently out of stock.'); return }
    setCart(current => {
      const line = current.find(item => item.variant.id === variant.id)
      if (!line) return [...current, { product, variant, quantity: 1 }]
      return current.map(item => item.variant.id === variant.id ? { ...item, quantity: Math.min(item.quantity + 1, variant.stock_quantity) } : item)
    })
    setMessage('Added to your shared bag.')
  }

  const changeQuantity = (variantId: string, change: number) => setCart(current => current.flatMap(line => {
    if (line.variant.id !== variantId) return [line]
    const quantity = Math.min(line.variant.stock_quantity, line.quantity + change)
    return quantity > 0 ? [{ ...line, quantity }] : []
  }))

  if (loading) return <View style={styles.center}><ActivityIndicator color="#a9553c" /><Text style={styles.muted}>Opening Pearl Collections…</Text></View>

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topline}><Text style={styles.brand}>PEARL<Text style={styles.brandSub}> COLLECTIONS</Text></Text><Text style={styles.toplineNote}>Thoughtfully chosen, always.</Text></View>
      {!!(message || (!supabase && 'Connect Supabase to load the collection and sign in.')) && <Pressable onPress={() => setMessage('')} style={styles.notice}><Text style={styles.noticeText}>{message || 'Connect Supabase to load the collection and sign in.'}  ×</Text></Pressable>}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 110 + insets.bottom }]}>
        {checkoutOpen ? orderNumber ? <>
          <Text style={styles.eyebrow}>ORDER REQUEST RECEIVED</Text>
          <Text style={styles.heading}>Thank you.{ '\n' }We’ll be in touch.</Text>
          <View style={styles.checkoutCard}><Text style={styles.checkoutTitle}>Your order number</Text><Text style={styles.orderNumber}>{orderNumber}</Text><Text style={styles.muted}>Your order is pending confirmation. No payment was taken. Pearl Collections will contact you about delivery and payment.</Text>{!!emailNotice && <Text style={styles.checkoutError}>{emailNotice}</Text>}</View>
          <Pressable onPress={() => { setCheckoutOpen(false); setTab('Shop') }} style={styles.primary}><Text style={styles.primaryText}>CONTINUE SHOPPING</Text></Pressable>
        </> : <>
          <Pressable onPress={() => { setCheckoutOpen(false); setTab('Bag') }}><Text style={styles.backLink}>←  Back to your bag</Text></Pressable>
          <Text style={styles.eyebrow}>THE FINAL DETAILS</Text><Text style={styles.heading}>Make it{ '\n' }yours.</Text>
          <View style={styles.checkoutCard}>
            <Text style={styles.checkoutTitle}>Your details</Text><Text style={styles.muted}>Signed in as {session?.user.email ?? 'your Pearl account'}</Text>
            <Text style={styles.inputLabel}>Full name</Text><TextInput value={delivery.full_name} onChangeText={value => setDelivery(current => ({ ...current, full_name: value }))} placeholder="Your name" style={styles.input} />
            <Text style={styles.inputLabel}>Phone number</Text><TextInput value={delivery.phone} onChangeText={value => setDelivery(current => ({ ...current, phone: value }))} placeholder="+234 800 000 0000" keyboardType="phone-pad" style={styles.input} />
            <Text style={styles.inputLabel}>Street address</Text><TextInput value={delivery.address} onChangeText={value => setDelivery(current => ({ ...current, address: value }))} placeholder="House number and street" style={styles.input} />
            <Text style={styles.inputLabel}>City</Text><TextInput value={delivery.city} onChangeText={value => setDelivery(current => ({ ...current, city: value }))} placeholder="City" style={styles.input} />
            <Text style={styles.inputLabel}>State</Text><TextInput value={delivery.state} onChangeText={value => setDelivery(current => ({ ...current, state: value }))} placeholder="State" style={styles.input} />
            <Text style={styles.inputLabel}>Country</Text><TextInput value={delivery.country} onChangeText={value => setDelivery(current => ({ ...current, country: value }))} placeholder="Country" style={styles.input} />
          </View>
          <View style={styles.checkoutCard}><Text style={styles.checkoutTitle}>Order summary</Text><View style={styles.summaryRow}><Text style={styles.muted}>Items ({itemCount})</Text><Text style={styles.price}>{formatNaira(subtotal)}</Text></View><View style={styles.summaryRow}><Text style={styles.muted}>Delivery</Text><Text style={styles.price}>{formatNaira(5000)}</Text></View><View style={styles.summaryRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalLabel}>{formatNaira(subtotal + 5000)}</Text></View><Text style={styles.muted}>Payment is not collected here. We’ll contact you to confirm your order.</Text></View>
          {!!checkoutError && <Text style={styles.checkoutError}>{checkoutError}</Text>}
          <Pressable disabled={checkoutBusy} onPress={() => void submitOrderRequest()} style={[styles.primary, checkoutBusy && styles.disabled]}><Text style={styles.primaryText}>{checkoutBusy ? 'SENDING ORDER REQUEST…' : 'PLACE ORDER REQUEST'}</Text></Pressable>
        </> : tab === 'Shop' && <>
          <Text style={styles.eyebrow}>THE PEARL EDIT</Text>
          <Text style={styles.heading}>Pieces to make{ '\n' }your own.</Text>
          <Text style={styles.intro}>Considered clothing and accessories, chosen for the moments that matter.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
            {categories.map(value => <Pressable key={value} onPress={() => setCategory(value)} style={[styles.category, category === value && styles.categoryActive]}><Text style={[styles.categoryText, category === value && styles.categoryTextActive]}>{value}</Text></Pressable>)}
          </ScrollView>
          <View style={styles.grid}>
            {visibleProducts.map(product => {
              const available = product.product_variants.filter(v => v.stock_quantity > 0)
              const chosen = available.find(v => v.id === selected[product.id]) ?? available[0]
              return <View key={product.id} style={styles.product}>
                <Image source={{ uri: product.image_url }} style={styles.productImage} resizeMode="cover" />
                <Text style={styles.productCategory}>{product.category}</Text>
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.price}>{formatNaira(product.price)}</Text>
                {available.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.variantRow}>{available.map(variant => <Pressable key={variant.id} onPress={() => setSelected(current => ({ ...current, [product.id]: variant.id }))} style={[styles.variant, chosen?.id === variant.id && styles.variantSelected]}><Text style={[styles.variantText, chosen?.id === variant.id && styles.variantTextSelected]}>{variant.size || variant.colour || 'One size'}</Text></Pressable>)}</ScrollView>}
                <Pressable onPress={() => add(product)} style={styles.addButton}><Text style={styles.addText}>ADD TO BAG  +</Text></Pressable>
              </View>
            })}
          </View>
          {products.length === 0 && <Text style={styles.muted}>Your collection will appear here when products are available.</Text>}
        </>}

        {tab === 'Bag' && !checkoutOpen && <>
          <Text style={styles.eyebrow}>YOUR SELECTION</Text><Text style={styles.heading}>Your bag.</Text>
          {!session ? <View style={styles.empty}><Text style={styles.emptyTitle}>Sign in to see your shared bag</Text><Text style={styles.muted}>Your website and mobile bag belong to the same account.</Text><Pressable onPress={() => setTab('Account')} style={styles.primary}><Text style={styles.primaryText}>SIGN IN</Text></Pressable></View> : cart.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>Your bag is waiting.</Text><Text style={styles.muted}>Add a piece from the collection and it will appear here.</Text><Pressable onPress={() => setTab('Shop')} style={styles.primary}><Text style={styles.primaryText}>EXPLORE THE COLLECTION</Text></Pressable></View> : <>
            {cart.map(line => <View key={line.variant.id} style={styles.cartLine}><Image source={{ uri: line.product.image_url }} style={styles.cartImage} /><View style={styles.cartDetails}><Text style={styles.productName}>{line.product.name}</Text><Text style={styles.muted}>{line.variant.size || line.variant.colour || 'One size'}</Text><Text style={styles.price}>{formatNaira(line.product.price)}</Text><View style={styles.quantity}><Pressable onPress={() => changeQuantity(line.variant.id, -1)}><Text style={styles.quantityButton}>−</Text></Pressable><Text style={styles.quantityNumber}>{line.quantity}</Text><Pressable onPress={() => changeQuantity(line.variant.id, 1)}><Text style={styles.quantityButton}>＋</Text></Pressable></View></View></View>)}
            <View style={styles.subtotal}><Text style={styles.subtotalLabel}>Subtotal</Text><Text style={styles.subtotalAmount}>{formatNaira(subtotal)}</Text></View>
            <Text style={styles.cartFootnote}>Delivery is calculated at checkout. Your bag syncs with the website.</Text>
            <Pressable onPress={() => { setCheckoutError(''); setOrderNumber(''); setCheckoutOpen(true) }} style={styles.primary}><Text style={styles.primaryText}>CONTINUE TO CHECKOUT</Text></Pressable>
          </>}
        </>}

        {tab === 'Account' && !checkoutOpen && <>
          <Text style={styles.eyebrow}>YOUR PEARL ACCOUNT</Text><Text style={styles.heading}>{session ? 'Welcome back.' : 'A more personal edit.'}</Text>
          {session ? <View style={styles.accountCard}><Text style={styles.accountName}>{session.user.user_metadata?.full_name ?? 'Pearl customer'}</Text><Text style={styles.muted}>{session.user.email}</Text><Text style={styles.cartFootnote}>Your bag is shared with the Pearl Collections website.</Text><Pressable onPress={() => void supabase?.auth.signOut()} style={styles.secondary}><Text style={styles.secondaryText}>SIGN OUT</Text></Pressable></View> : <View style={styles.accountCard}><Text style={styles.emptyTitle}>One account, one shared bag.</Text><Text style={styles.muted}>Sign in with the same Google account you use on the website.</Text><Pressable disabled={working} onPress={() => void signIn()} style={[styles.primary, working && styles.disabled]}><Text style={styles.primaryText}>{working ? 'CONNECTING…' : 'CONTINUE WITH GOOGLE'}</Text></Pressable><Text style={styles.tiny}>Your sign-in is handled securely by Supabase and Google.</Text></View>}
        </>}
      </ScrollView>
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {(['Shop', 'Bag', 'Account'] as Tab[]).map(value => <Pressable key={value} onPress={() => { setCheckoutOpen(false); setOrderNumber(''); setTab(value) }} style={styles.tab}><Text style={[styles.tabText, tab === value && styles.tabTextActive]}>{value === 'Bag' ? `Bag${itemCount ? ` · ${itemCount}` : ''}` : value}</Text><View style={[styles.tabLine, tab === value && styles.tabLineActive]} /></Pressable>)}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f4ef' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#f7f4ef' },
  topline: { paddingHorizontal: 22, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#d9d4cc', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: '#222321', fontFamily: 'serif', fontSize: 20, letterSpacing: 1 }, brandSub: { fontFamily: 'serif', fontSize: 8, letterSpacing: 1 }, toplineNote: { color: '#73736f', fontSize: 10 },
  content: { paddingHorizontal: 22, paddingTop: 28 }, eyebrow: { color: '#a9553c', fontSize: 10, letterSpacing: 1.8, marginBottom: 12 }, heading: { fontFamily: 'serif', color: '#252523', fontSize: 43, lineHeight: 48, marginBottom: 12 }, intro: { color: '#71716e', fontSize: 14, lineHeight: 22, marginBottom: 18 },
  categories: { gap: 8, paddingVertical: 8, paddingRight: 20, marginBottom: 12 }, category: { paddingVertical: 9, paddingHorizontal: 14, borderWidth: 1, borderColor: '#d9d4cc', borderRadius: 30 }, categoryActive: { backgroundColor: '#252523', borderColor: '#252523' }, categoryText: { color: '#585854', fontSize: 12 }, categoryTextActive: { color: '#fff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 25 }, product: { width: '48%', marginBottom: 2 }, productImage: { width: '100%', aspectRatio: 0.78, backgroundColor: '#e9e5dd', marginBottom: 10 }, productCategory: { color: '#a9553c', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }, productName: { color: '#292927', fontFamily: 'serif', fontSize: 17, lineHeight: 22 }, price: { color: '#282826', fontSize: 13, fontWeight: '600', marginTop: 5 }, variantRow: { marginTop: 9, maxHeight: 35 }, variant: { borderWidth: 1, borderColor: '#d5d0c8', paddingHorizontal: 9, paddingVertical: 6, marginRight: 6 }, variantSelected: { borderColor: '#292927', backgroundColor: '#eeebe5' }, variantText: { color: '#66645f', fontSize: 10 }, variantTextSelected: { color: '#292927' }, addButton: { borderWidth: 1, borderColor: '#292927', paddingVertical: 11, alignItems: 'center', marginTop: 10 }, addText: { color: '#292927', fontSize: 9, letterSpacing: 1, fontWeight: '600' },
  notice: { backgroundColor: '#efe5dd', paddingVertical: 10, paddingHorizontal: 22 }, noticeText: { color: '#8d4b37', fontSize: 12 }, muted: { color: '#777772', fontSize: 13, lineHeight: 20, marginTop: 8 }, empty: { paddingVertical: 30 }, emptyTitle: { color: '#2b2b29', fontFamily: 'serif', fontSize: 22, marginBottom: 8 }, primary: { backgroundColor: '#252523', paddingVertical: 15, alignItems: 'center', marginTop: 18 }, primaryText: { color: '#fff', letterSpacing: 1, fontWeight: '600', fontSize: 11 }, disabled: { opacity: 0.6 },
  cartLine: { flexDirection: 'row', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#d7d2ca', gap: 14 }, cartImage: { width: 94, height: 118, backgroundColor: '#e9e5dd' }, cartDetails: { flex: 1, paddingTop: 4 }, quantity: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 16, borderWidth: 1, borderColor: '#d6d1c9', paddingHorizontal: 10, paddingVertical: 5, marginTop: 9 }, quantityButton: { color: '#353531', fontSize: 16 }, quantityNumber: { color: '#353531', fontSize: 12 }, subtotal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 18, marginTop: 4 }, subtotalLabel: { color: '#60605b', fontSize: 13 }, subtotalAmount: { color: '#292927', fontWeight: '700', fontSize: 16 }, cartFootnote: { color: '#797973', fontSize: 12, lineHeight: 18, marginTop: 8 },
  backLink: { color: '#777772', fontSize: 13, marginBottom: 22 }, checkoutCard: { padding: 17, backgroundColor: '#efede7', marginTop: 14 }, checkoutTitle: { color: '#292927', fontFamily: 'serif', fontSize: 21, marginBottom: 5 }, inputLabel: { color: '#66645f', fontSize: 11, marginTop: 14, marginBottom: 6 }, input: { backgroundColor: '#faf9f6', borderWidth: 1, borderColor: '#d9d4cc', paddingHorizontal: 12, paddingVertical: 11, color: '#292927', fontSize: 14 }, summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }, totalLabel: { color: '#292927', fontSize: 15, fontWeight: '700' }, orderNumber: { color: '#a9553c', fontSize: 18, fontWeight: '700', marginTop: 7 }, checkoutError: { color: '#9b3627', fontSize: 12, lineHeight: 18, marginTop: 12 },
  accountCard: { padding: 19, backgroundColor: '#efede7', marginTop: 14 }, accountName: { color: '#292927', fontFamily: 'serif', fontSize: 22 }, tiny: { color: '#8a8983', fontSize: 10, lineHeight: 16, marginTop: 12 }, secondary: { borderWidth: 1, borderColor: '#292927', alignItems: 'center', paddingVertical: 13, marginTop: 20 }, secondaryText: { color: '#292927', letterSpacing: 1, fontSize: 11 },
  tabBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#f7f4ef', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#d9d4cc', flexDirection: 'row', justifyContent: 'space-around', paddingTop: 13 }, tab: { alignItems: 'center', minWidth: 72 }, tabText: { color: '#85847f', fontSize: 12, paddingBottom: 11 }, tabTextActive: { color: '#252523', fontWeight: '600' }, tabLine: { height: 2, width: 30 }, tabLineActive: { backgroundColor: '#a9553c' },
})
