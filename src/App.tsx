import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { ArrowDownRight, ArrowLeft, ArrowRight, Check, ChevronDown, CreditCard, LockKeyhole, Menu, Minus, Plus, Search, ShoppingBag, X } from 'lucide-react'
import { Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { DELIVERY_FEE } from './lib/config'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type Variant = {
  id: string
  size: string | null
  colour: string | null
  stock_quantity: number
}

type Product = {
  id: string
  name: string
  description: string
  price: number
  category: string
  gender: string
  image_url: string
  is_active: boolean
  product_variants: Variant[]
}

type CartLine = { product: Product; variant: Variant; quantity: number }

const sampleProducts: Product[] = [
  {
    id: 'sample-linen-set', name: 'The Linen Set', description: 'An easy, considered two-piece in breathable natural linen. Made for warm afternoons and plans that run late.', price: 68500, category: 'Clothing', gender: 'Women', image_url: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=900&q=85', is_active: true,
    product_variants: [{ id: 'sample-linen-s', size: 'S', colour: 'Oat', stock_quantity: 8 }, { id: 'sample-linen-m', size: 'M', colour: 'Oat', stock_quantity: 5 }, { id: 'sample-linen-l', size: 'L', colour: 'Oat', stock_quantity: 3 }],
  },
  {
    id: 'sample-sculpted-bag', name: 'Sculpted Shoulder Bag', description: 'A softly structured everyday bag with a generous interior and an adjustable strap.', price: 52000, category: 'Accessories', gender: 'Women', image_url: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=85', is_active: true,
    product_variants: [{ id: 'sample-bag-one', size: 'One size', colour: 'Espresso', stock_quantity: 9 }],
  },
  {
    id: 'sample-day-dress', name: 'Sunday Slip Dress', description: 'A fluid midi silhouette with delicate straps and a quietly luminous finish.', price: 74000, category: 'Clothing', gender: 'Women', image_url: 'https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=900&q=85', is_active: true,
    product_variants: [{ id: 'sample-dress-s', size: 'S', colour: 'Deep olive', stock_quantity: 3 }, { id: 'sample-dress-m', size: 'M', colour: 'Deep olive', stock_quantity: 6 }, { id: 'sample-dress-l', size: 'L', colour: 'Deep olive', stock_quantity: 4 }],
  },
  {
    id: 'sample-gold-earrings', name: 'Soft Form Earrings', description: 'Light-catching sculptural hoops, finished by hand for everyday wear.', price: 28500, category: 'Jewellery', gender: 'Women', image_url: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=900&q=85', is_active: true,
    product_variants: [{ id: 'sample-earrings-one', size: 'One size', colour: 'Gold', stock_quantity: 12 }],
  },
  {
    id: 'sample-knit-top', name: 'Fine Rib Knit', description: 'A soft, close-fitting knit designed to layer or stand on its own.', price: 39000, category: 'Clothing', gender: 'Women', image_url: 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=900&q=85', is_active: true,
    product_variants: [{ id: 'sample-knit-s', size: 'S', colour: 'Ivory', stock_quantity: 7 }, { id: 'sample-knit-m', size: 'M', colour: 'Ivory', stock_quantity: 7 }, { id: 'sample-knit-l', size: 'L', colour: 'Ivory', stock_quantity: 2 }],
  },
  {
    id: 'sample-woven-clutch', name: 'Woven Evening Clutch', description: 'A tactile woven clutch that takes the simplest look into the evening.', price: 46000, category: 'Accessories', gender: 'Women', image_url: 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=85', is_active: true,
    product_variants: [{ id: 'sample-clutch-one', size: 'One size', colour: 'Natural', stock_quantity: 5 }],
  },
]

const money = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount)
const cartStorageKey = 'pearl-collections-cart'
const pendingGuestCartKey = 'pearl-collections-pending-guest-cart'

async function getFunctionErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback
  const context = (error as Error & { context?: unknown }).context
  if (context instanceof Response) {
    const body = await context.clone().json().catch(() => null) as { error?: unknown } | null
    if (typeof body?.error === 'string') return body.error
  }
  return error.message || fallback
}

function readCart(): CartLine[] {
  try {
    const saved = localStorage.getItem(cartStorageKey)
    return saved ? JSON.parse(saved) as CartLine[] : []
  } catch {
    return []
  }
}

function App() {
  const [products, setProducts] = useState<Product[]>(sampleProducts)
  const [cart, setCart] = useState<CartLine[]>(readCart)
  const [user, setUser] = useState<User | null>(null)
  const [cartHydratedUserId, setCartHydratedUserId] = useState<string | null>(null)
  const [cartSyncing, setCartSyncing] = useState(false)
  const cartSaveQueue = useRef(Promise.resolve())
  const cartSaveVersion = useRef(0)
  const [cartOpen, setCartOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [authSetupOpen, setAuthSetupOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    localStorage.setItem(cartStorageKey, JSON.stringify(cart))
  }, [cart])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 3400)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    if (!supabase) return
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (active) setUser(data.session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCartHydratedUserId(null)
      setUser(session?.user ?? null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.from('products')
      .select('id,name,description,price,category,gender,image_url,is_active,product_variants(id,size,colour,stock_quantity)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (active && data?.length) setProducts(data as unknown as Product[])
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const client = supabase
    if (!client || !user) return
    let active = true
    setCartHydratedUserId(null)
    const loadAccountCart = async () => {
      const pendingGuestCart = localStorage.getItem(pendingGuestCartKey)
      if (pendingGuestCart) {
        try {
          const items = JSON.parse(pendingGuestCart) as Array<{ variant_id: string; quantity: number }>
          if (items.length) {
            const { error } = await client.rpc('merge_guest_cart', { p_items: items })
            if (error) setNotice('Some saved items could not be merged. Please review your bag.')
            else localStorage.removeItem(pendingGuestCartKey)
          } else {
            localStorage.removeItem(pendingGuestCartKey)
          }
        } catch {
          localStorage.removeItem(pendingGuestCartKey)
          setNotice('Some saved items could not be merged. Please review your bag.')
        }
      }

      const { data, error } = await client.from('cart_items')
        .select('quantity,products(id,name,description,price,category,gender,image_url,is_active),product_variants(id,size,colour,stock_quantity)')
        .eq('user_id', user.id)
      if (!active) return
      if (error || !data) {
        setNotice('Your saved bag could not be loaded. Please try again.')
        return
      }
      const lines = data.flatMap(row => {
        const product = row.products as unknown as Omit<Product, 'product_variants'> | null
        const variant = row.product_variants as unknown as Variant | null
        return product && variant ? [{ product: { ...product, product_variants: [variant] }, variant, quantity: row.quantity }] : []
      })
      setCart(lines)
      setCartHydratedUserId(user.id)
    }
    void loadAccountCart()
    return () => { active = false }
  }, [user?.id])

  useEffect(() => {
    const client = supabase
    if (!client || !user || cartHydratedUserId !== user.id) return
    const items = cart
      .filter(line => !line.product.id.startsWith('sample-') && !line.variant.id.startsWith('sample-'))
      .map(line => ({ variant_id: line.variant.id, quantity: line.quantity }))
    const saveVersion = ++cartSaveVersion.current
    setCartSyncing(true)
    cartSaveQueue.current = cartSaveQueue.current
      .catch(() => undefined)
      .then(async () => {
        if (saveVersion !== cartSaveVersion.current) return null
        try {
          const { error } = await client.rpc('save_cart', { p_items: items })
          return error
        } catch (error) {
          return error
        }
      })
      .then(error => {
        if (saveVersion !== cartSaveVersion.current) return
        setCartSyncing(false)
        if (error) setNotice('Your bag could not be saved. Please check availability and try again.')
      })
  }, [cart, user?.id, cartHydratedUserId])

  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0)
  const subtotal = cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0)

  function addToCart(product: Product, variant: Variant) {
    if (variant.stock_quantity < 1) {
      setNotice('This option is currently sold out.')
      return
    }
    setCart(current => {
      const existing = current.find(line => line.variant.id === variant.id)
      if (!existing) return [...current, { product, variant, quantity: 1 }]
      return current.map(line => line.variant.id === variant.id
        ? { ...line, quantity: Math.min(line.quantity + 1, variant.stock_quantity) }
        : line)
    })
    setNotice('Added to your bag.')
  }

  function changeQuantity(variantId: string, change: number) {
    setCart(current => current.flatMap(line => {
      if (line.variant.id !== variantId) return [line]
      const quantity = Math.min(line.variant.stock_quantity, line.quantity + change)
      return quantity > 0 ? [{ ...line, quantity }] : []
    }))
  }

  async function signInWithGoogle() {
    if (!supabase) {
      setAuthSetupOpen(true)
      return
    }
    if (!user) {
      const guestItems = cart
        .filter(line => !line.product.id.startsWith('sample-') && !line.variant.id.startsWith('sample-'))
        .map(line => ({ variant_id: line.variant.id, quantity: line.quantity }))
      if (guestItems.length) localStorage.setItem(pendingGuestCartKey, JSON.stringify(guestItems))
      else localStorage.removeItem(pendingGuestCartKey)
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${location.pathname === '/checkout' ? '/checkout' : '/'}` },
    })
    if (error) {
      localStorage.removeItem(pendingGuestCartKey)
      setNotice(error.message)
    }
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setCartHydratedUserId(null)
    setCartSyncing(false)
    localStorage.removeItem(cartStorageKey)
    setCart([])
    navigate('/')
  }

  function showNotice(message: string) {
    setNotice(message)
  }

  return (
    <div className="site-shell">
      <div className="announcement">Flat delivery, ₦5,000 <span>·</span> Thoughtfully chosen, always.</div>
      <header className="site-header">
        <button className="icon-button mobile-menu" aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'} title="Navigation" onClick={() => setMobileMenuOpen(open => !open)}>{mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}</button>
        <Link className="wordmark" to="/" aria-label="Pearl Collections home"><span>PEARL</span><small>COLLECTIONS</small></Link>
        <nav className={`main-nav${mobileMenuOpen ? ' mobile-open' : ''}`} aria-label="Main navigation">
          <Link to="/" onClick={() => setMobileMenuOpen(false)}>New arrivals</Link>
          <a href="/#collection" onClick={() => setMobileMenuOpen(false)}>Clothing</a>
          <a href="/#collection" onClick={() => setMobileMenuOpen(false)}>Accessories</a>
          <Link to="/about" onClick={() => setMobileMenuOpen(false)}>Our story</Link>
        </nav>
        <div className="header-actions">
          <Link to="/account" className="account-link">{user ? 'My account' : 'Sign in'}</Link>
          <button className="icon-button bag-trigger" aria-label={`Open shopping bag, ${itemCount} items`} title="Shopping bag" onClick={() => setCartOpen(true)}>
            <ShoppingBag size={19} /><span className="bag-count">{itemCount}</span>
          </button>
        </div>
      </header>

      <Routes>
        <Route path="/" element={<ShopPage products={products} addToCart={addToCart} />} />
        <Route path="/product/:productId" element={<ProductPage products={products} addToCart={addToCart} />} />
        <Route path="/checkout" element={<CheckoutPage cart={cart} subtotal={subtotal} user={user} cartSyncing={cartSyncing} onGoogleSignIn={signInWithGoogle} onQuantityChange={changeQuantity} onOrderComplete={showNotice} onClearCart={() => setCart([])} />} />
        <Route path="/payment/callback" element={<PaymentCallbackPage onOrderComplete={showNotice} onClearCart={() => setCart([])} />} />
        <Route path="/confirmation/:orderNumber" element={<OrderConfirmationPage />} />
        <Route path="/account" element={<AccountPage user={user} onGoogleSignIn={signInWithGoogle} onSignOut={signOut} />} />
        <Route path="/about" element={<InfoPage eyebrow="THE PEARL POINT OF VIEW" title="Clothes to live in." intro="Pearl Collections is a fashion shop for pieces that feel personal, considered, and ready to be worn again." sections={[{ title: 'A thoughtful edit', body: 'We bring together clothing and accessories with an eye for useful details, enduring shapes, and the small things that make getting dressed feel like your own.' }, { title: 'From Lagos, with care', body: 'Pearl Collections serves customers in Nigeria with a simple, considered way to discover a new favourite.' }]} />} />
        <Route path="/contact" element={<InfoPage eyebrow="WE ARE HERE TO HELP" title="Let’s talk." intro="For an order question or a general enquiry, please contact the Pearl Collections team." sections={[{ title: 'Customer care', body: 'The business contact email and support hours still need to be added by the shop owner before launch.' }, { title: 'Order questions', body: 'Have your order number ready so the team can help you more quickly.' }]} />} />
        <Route path="/privacy" element={<InfoPage eyebrow="PRIVACY POLICY" title="Your details, treated with care." intro="Draft policy. The shop owner must add the business legal identity and have this page reviewed before launch." sections={[{ title: 'Information used', body: 'The MVP uses account details from Google sign-in, delivery and contact details submitted at checkout, and order information needed to fulfill purchases and send receipts.' }, { title: 'Service providers', body: 'Supabase provides authentication and database services. Mailgun processes order confirmation emails. The business should document current retention, legal basis, and any additional providers before launch.' }, { title: 'Your choices', body: 'Add the business contact address and the process customers should use to request access, correction, or deletion of their information.' }]} draft />} />
        <Route path="/terms" element={<InfoPage eyebrow="TERMS OF SERVICE" title="A few clear things." intro="Draft terms. The shop owner must complete and approve these terms before accepting live orders." sections={[{ title: 'Orders', body: 'Orders are subject to product and variant availability. In the MVP, placing an order records the purchase request; online payment is not collected.' }, { title: 'Prices and delivery', body: 'Prices are displayed in Nigerian naira. The current MVP delivery fee is ₦5,000. Confirm final delivery coverage, timing, cancellation, and order acceptance rules before launch.' }, { title: 'Business details', body: 'Add the operating business name, registration details where applicable, customer contact, and governing terms after review.' }]} draft />} />
        <Route path="/delivery-returns" element={<InfoPage eyebrow="DELIVERY & RETURNS" title="The details matter." intro="Draft policy. Confirm delivery areas, timelines, and return rules with the shop owner before publishing." sections={[{ title: 'Delivery', body: 'The MVP currently applies a flat ₦5,000 delivery fee. Delivery coverage and estimated delivery times have not yet been supplied.' }, { title: 'Returns and exchanges', body: 'The return window, eligible items, condition requirements, and exchange or refund process must be confirmed and added before launch.' }]} draft />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>

      <footer className="site-footer" id="story">
        <div className="footer-brand"><Link className="wordmark wordmark-light" to="/"><span>PEARL</span><small>COLLECTIONS</small></Link><p>Pieces to keep close.<br />Made for the moments in between.</p></div>
        <div className="footer-links"><span>THE HOUSE</span><a href="/#collection">Shop the collection</a><Link to="/about">Our story</Link><Link to="/contact">Contact</Link><Link to="/account">Your account</Link></div>
        <div className="footer-legal"><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/delivery-returns">Delivery & returns</Link></div>
        <div className="footer-note">LAGOS, NIGERIA <span>© PEARL COLLECTIONS 2026</span></div>
      </footer>

      {cartOpen && <CartDrawer cart={cart} subtotal={subtotal} onClose={() => setCartOpen(false)} onQuantityChange={changeQuantity} />}
      {notice && <div className="toast" role="status"><Check size={16} />{notice}<button aria-label="Dismiss" onClick={() => setNotice('')}><X size={15} /></button></div>}
      {authSetupOpen && <AuthSetupDialog onClose={() => setAuthSetupOpen(false)} />}
    </div>
  )
}

function ShopPage({ products, addToCart }: { products: Product[]; addToCart: (product: Product, variant: Variant) => void }) {
  const [category, setCategory] = useState('All pieces')
  const [search, setSearch] = useState('')
  const [size, setSize] = useState('')
  const [gender, setGender] = useState('')
  const [priceBand, setPriceBand] = useState('')
  const [inStockOnly, setInStockOnly] = useState(false)
  const categories = ['All pieces', 'Clothing', 'Accessories', 'Jewellery']
  const sizes = [...new Set(products.flatMap(product => product.product_variants?.map(variant => variant.size).filter((value): value is string => Boolean(value)) ?? []))].sort()
  const genders = [...new Set(products.map(product => product.gender).filter(Boolean))].sort()
  const filtered = products.filter(product => {
    const query = search.trim().toLowerCase()
    const matchesCategory = category === 'All pieces' || product.category.toLowerCase() === category.toLowerCase()
    const matchesSearch = !query || `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(query)
    const matchesSize = !size || product.product_variants?.some(variant => variant.size === size)
    const matchesGender = !gender || product.gender === gender
    const matchesPrice = !priceBand || (priceBand === 'under50000' && product.price < 50000) || (priceBand === '50000to75000' && product.price >= 50000 && product.price <= 75000) || (priceBand === 'over75000' && product.price > 75000)
    const matchesStock = !inStockOnly || product.product_variants?.some(variant => variant.stock_quantity > 0)
    return matchesCategory && matchesSearch && matchesSize && matchesGender && matchesPrice && matchesStock
  })

  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> THE NEW SEASON / 01</div>
          <h1>Wear the<br /><em>moment.</em></h1>
          <p>Considered pieces for wherever the day takes you. A collection made to feel like your own.</p>
          <a className="text-link" href="#collection">Explore the collection <ArrowDownRight size={17} /></a>
          <div className="hero-index"><span>01</span><i /> 03</div>
        </div>
        <div className="hero-image-wrap">
          <img className="hero-image" src="https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=1500&q=90" alt="Model wearing a softly tailored cream look" />
          <div className="hero-image-caption"><span>THE EVERYDAY EDIT</span><span>01 / 03</span></div>
          <div className="image-stamp">A softer<br />point of view</div>
        </div>
        <div className="hero-side-label">DRESS LIKE YOU MEAN IT · PEARL COLLECTIONS</div>
      </section>

      <section className="service-strip" aria-label="Store services">
        <span>Designed for real life</span><i /><span>Made to be reworn</span><i /><span>Delivered with care</span>
      </section>

      <section className="collection-section" id="collection">
        <div className="section-heading">
          <div><div className="eyebrow"><span className="eyebrow-line" /> THE CURRENT COLLECTION</div><h2>Find your <em>favourite.</em></h2></div>
          <p>Quietly distinctive. Always in good company.</p>
        </div>
        <div className="collection-toolbar">
          <div className="category-tabs" role="tablist" aria-label="Filter by category">
            {categories.map(item => <button key={item} role="tab" aria-selected={category === item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}
          </div>
          <span className="product-count">{filtered.length} PIECES</span>
        </div>
        <div className="catalog-controls">
          <label className="search-control"><Search size={16} /><input type="search" aria-label="Search products" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a piece" /></label>
          <div className="filter-selects">
            <select aria-label="Filter by size" value={size} onChange={event => setSize(event.target.value)}><option value="">All sizes</option>{sizes.map(value => <option key={value}>{value}</option>)}</select>
            <select aria-label="Filter by gender" value={gender} onChange={event => setGender(event.target.value)}><option value="">All fits</option>{genders.map(value => <option key={value}>{value}</option>)}</select>
            <select aria-label="Filter by price" value={priceBand} onChange={event => setPriceBand(event.target.value)}><option value="">Any price</option><option value="under50000">Under ₦50,000</option><option value="50000to75000">₦50,000–₦75,000</option><option value="over75000">Over ₦75,000</option></select>
            <label className="stock-filter"><input type="checkbox" checked={inStockOnly} onChange={event => setInStockOnly(event.target.checked)} /> In stock</label>
          </div>
        </div>
        <div className="product-grid">
          {filtered.map((product, index) => <ProductCard key={product.id} product={product} index={index} addToCart={addToCart} />)}
          {filtered.length === 0 && <div className="empty-catalog">The next edit is on its way. Check back soon.</div>}
        </div>
      </section>

      <section className="quote-band">
        <div className="quote-mark">“</div><p>Style is less about having more<br />and more about knowing what stays.</p><span>THE PEARL POINT OF VIEW</span>
      </section>
    </main>
  )
}

function ProductCard({ product, index, addToCart }: { product: Product; index: number; addToCart: (product: Product, variant: Variant) => void }) {
  const firstAvailable = product.product_variants?.find(variant => variant.stock_quantity > 0)
  return (
    <article className="product-card" style={{ animationDelay: `${index * 70}ms` }}>
      <Link className="product-image-link" to={`/product/${product.id}`}>
        <img src={product.image_url} alt={product.name} loading="lazy" />
        <span className="product-tag">{product.category}</span>
        <span className="quick-view">View piece <ArrowRight size={14} /></span>
      </Link>
      <div className="product-meta"><div><Link to={`/product/${product.id}`} className="product-name">{product.name}</Link><span className="product-variant-note">{firstAvailable?.colour ?? 'Designed to wear often'}</span></div><span className="product-price">{money(product.price)}</span></div>
      <button className="add-piece" disabled={!firstAvailable} onClick={() => firstAvailable && addToCart(product, firstAvailable)}>{firstAvailable ? 'Add to bag' : 'Sold out'} <Plus size={15} /></button>
    </article>
  )
}

function ProductPage({ products, addToCart }: { products: Product[]; addToCart: (product: Product, variant: Variant) => void }) {
  const { productId } = useParams()
  const product = products.find(item => item.id === productId)
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null)
  const [added, setAdded] = useState(false)
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false)
  if (!product) return <NotFoundPage />
  const variants = product.product_variants ?? []
  const selected = selectedVariant ?? variants.find(variant => variant.stock_quantity > 0) ?? variants[0]

  return (
    <main className="product-detail page-width">
      <Link className="back-link" to="/"><ArrowLeft size={15} /> Back to the collection</Link>
      <div className="detail-layout">
        <div className="detail-image"><img src={product.image_url} alt={product.name} /></div>
        <div className="detail-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> {product.category.toUpperCase()} / PEARL EDIT</div>
          <h1>{product.name}</h1><strong className="detail-price">{money(product.price)}</strong>
          <p>{product.description}</p>
          <div className="detail-option"><div className="option-heading"><span>SIZE / OPTION</span><button type="button" onClick={() => setSizeGuideOpen(true)}>Size guide <ArrowRight size={13} /></button></div>
            <div className="size-options">{variants.map(variant => <button key={variant.id} className={selected?.id === variant.id ? 'selected' : ''} disabled={!variant.stock_quantity} onClick={() => setSelectedVariant(variant)}>{variant.size ?? 'One size'}</button>)}</div>
            {selected && <span className="stock-note">{selected.stock_quantity > 0 ? (selected.stock_quantity < 4 ? `Only ${selected.stock_quantity} left` : 'In stock, ready to make yours') : 'Currently sold out'}</span>}
          </div>
          <button className="button button-dark detail-add" disabled={!selected || !selected.stock_quantity} onClick={() => { if (selected) addToCart(product, selected); setAdded(true); window.setTimeout(() => setAdded(false), 1600) }}>{added ? 'Added to your bag' : 'Add to bag'} <ShoppingBag size={16} /></button>
          <div className="detail-promises"><span><Check size={15} /> Flat ₦5,000 delivery</span><span><Check size={15} /> Order confirmation by email</span></div>
        </div>
      </div>
      {sizeGuideOpen && <SizeGuideDialog onClose={() => setSizeGuideOpen(false)} />}
    </main>
  )
}

function CartDrawer({ cart, subtotal, onClose, onQuantityChange }: { cart: CartLine[]; subtotal: number; onClose: () => void; onQuantityChange: (id: string, change: number) => void }) {
  const navigate = useNavigate()
  return (
    <div className="drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="cart-drawer" aria-label="Shopping bag">
        <div className="drawer-heading"><div><span className="eyebrow">YOUR SELECTION</span><h2>Your bag <span>({cart.reduce((total, line) => total + line.quantity, 0)})</span></h2></div><button className="icon-button" aria-label="Close bag" onClick={onClose}><X size={20} /></button></div>
        <div className="drawer-lines">
          {cart.length ? cart.map(line => <CartItem key={line.variant.id} line={line} onQuantityChange={onQuantityChange} />) : <div className="drawer-empty"><ShoppingBag size={24} /><p>Your bag is taking a little breather.</p><button className="text-link" onClick={onClose}>Explore the collection <ArrowRight size={15} /></button></div>}
        </div>
        {cart.length > 0 && <div className="drawer-summary"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><small>Delivery is calculated at checkout.</small><button className="button button-dark" onClick={() => { onClose(); navigate('/checkout') }}>Continue to checkout <ArrowRight size={16} /></button></div>}
      </aside>
    </div>
  )
}

function CartItem({ line, onQuantityChange }: { line: CartLine; onQuantityChange: (id: string, change: number) => void }) {
  return <div className="cart-line"><img src={line.product.image_url} alt="" /><div className="cart-line-info"><Link to={`/product/${line.product.id}`}>{line.product.name}</Link><span>{line.variant.size} · {line.variant.colour}</span><strong>{money(line.product.price)}</strong><div className="quantity-control"><button aria-label="Decrease quantity" onClick={() => onQuantityChange(line.variant.id, -1)}><Minus size={13} /></button><span>{line.quantity}</span><button aria-label="Increase quantity" disabled={line.quantity >= line.variant.stock_quantity} onClick={() => onQuantityChange(line.variant.id, 1)}><Plus size={13} /></button></div></div><button className="remove-line" aria-label={`Remove ${line.product.name}`} onClick={() => onQuantityChange(line.variant.id, -line.quantity)}><X size={16} /></button></div>
}

type CheckoutProps = { cart: CartLine[]; subtotal: number; user: User | null; cartSyncing: boolean; onGoogleSignIn: () => void; onQuantityChange: (id: string, change: number) => void; onOrderComplete: (message: string) => void; onClearCart: () => void }

function CheckoutPage({ cart, subtotal, user, cartSyncing, onGoogleSignIn, onQuantityChange, onOrderComplete, onClearCart }: CheckoutProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const deliveryFee = cart.length ? DELIVERY_FEE : 0
  const total = subtotal + deliveryFee

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const delivery = {
      full_name: String(form.get('full_name') ?? '').trim(),
      phone: String(form.get('phone') ?? '').trim(),
      address: String(form.get('address') ?? '').trim(),
      city: String(form.get('city') ?? '').trim(),
      state: String(form.get('state') ?? '').trim(),
      country: String(form.get('country') ?? 'Nigeria').trim(),
    }
    if (Object.values(delivery).some(value => !value)) {
      setError('Please complete every delivery field.')
      return
    }
    if (!supabase) {
      const previewOrderNumber = `PC-PREVIEW-${Date.now().toString().slice(-8)}`
      localStorage.removeItem(cartStorageKey)
      onClearCart()
      onOrderComplete('Preview only: no order was saved or sent to Pearl.')
      navigate(`/confirmation/${previewOrderNumber}`, { state: { preview: true } })
      return
    }
    if (!user) {
      setError('Sign in with Google to place a real order.')
      return
    }
    if (cartSyncing) {
      setError('Your bag is still being saved. Please try again in a moment.')
      return
    }
    if (!cart.length || cart.some(line => line.product.id.startsWith('sample-'))) {
      setError('Add products from your connected catalog to place a real order.')
      return
    }
    setLoading(true)
    const { data, error: paymentError } = await supabase.functions.invoke('initialize-paystack', {
      body: {
        delivery,
        expectedTotal: total,
        items: cart.map(line => ({ variant_id: line.variant.id, quantity: line.quantity })),
      },
    })
    if (paymentError || !data) {
      setLoading(false)
      setError(paymentError ? await getFunctionErrorMessage(paymentError, 'We could not start payment. Your bag is still saved.') : 'We could not start payment. Your bag is still saved.')
      return
    }
    const payment = data as { authorization_url?: string }
    if (!payment.authorization_url) {
      setLoading(false)
      setError('Paystack did not return a payment link. Your bag is still saved.')
      return
    }
    window.location.assign(payment.authorization_url)
  }

  if (!cart.length) return <main className="checkout-empty page-width"><span className="eyebrow">NOTHING IN THE BAG</span><h1>A little room<br /><em>for something lovely.</em></h1><Link className="button button-dark" to="/">Return to the collection <ArrowRight size={16} /></Link></main>

  return (
    <main className="checkout-page page-width">
      <div className="checkout-title"><Link className="back-link" to="/"><ArrowLeft size={15} /> Continue shopping</Link><div className="eyebrow"><span className="eyebrow-line" /> THE FINAL DETAILS</div><h1>Make it <em>yours.</em></h1><p>A few details, and this edit is on its way to you.</p></div>
      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={placeOrder}>
          <section className="checkout-block">
            <div className="checkout-block-title"><span>01</span><div><h2>Your details</h2><p>Used for your order confirmation.</p></div></div>
            {user ? <div className="signed-in-note"><Check size={16} /> Signed in as {user.email}<button type="button" onClick={() => void supabase?.auth.signOut()}>Change</button></div> : <div className="oauth-panel"><div><strong>{isSupabaseConfigured ? 'First, a little introduction.' : 'Preview checkout is ready.'}</strong><p>{isSupabaseConfigured ? 'Sign in securely with Google to place your order and keep track of it.' : 'Google sign-in is not connected. You can preview checkout below; preview orders are not submitted or emailed.'}</p></div><button type="button" className="button button-outline" onClick={onGoogleSignIn}><GoogleMark /> {isSupabaseConfigured ? 'Continue with Google' : 'Google sign-in setup'}</button></div>}
            <label className="field-label">Full name<input name="full_name" required autoComplete="name" defaultValue={user?.user_metadata.full_name ?? user?.user_metadata.name ?? ''} placeholder="Your name" /></label>
            <label className="field-label">Email address<input type="email" name="email" required autoComplete="email" defaultValue={user?.email ?? ''} placeholder="you@example.com" readOnly={Boolean(user?.email)} /></label>
            <label className="field-label">Phone number<input type="tel" name="phone" required autoComplete="tel" placeholder="+234 800 000 0000" /></label>
          </section>
          <section className="checkout-block">
            <div className="checkout-block-title"><span>02</span><div><h2>Where should it go?</h2><p>We’ll deliver with care, wherever you are.</p></div></div>
            <label className="field-label">Street address<input name="address" required autoComplete="street-address" placeholder="House number and street" /></label>
            <div className="field-row"><label className="field-label">City<input name="city" required autoComplete="address-level2" placeholder="City" /></label><label className="field-label">State<input name="state" required autoComplete="address-level1" placeholder="State" /></label></div>
            <label className="field-label">Country<select name="country" defaultValue="Nigeria"><option>Nigeria</option><option>Ghana</option><option>South Africa</option><option>United Kingdom</option></select><ChevronDown className="select-chevron" size={15} /></label>
          </section>
          <section className="checkout-block payment-block">
            <div className="checkout-block-title"><span>03</span><div><h2>Payment method</h2><p>You’ll complete payment securely on Paystack.</p></div></div>
            <div className="payment-method-option" aria-label="Selected payment method: Paystack">
              <span className="payment-method-icon"><CreditCard size={18} /></span>
              <span className="payment-method-copy"><strong>Pay with Paystack</strong><small>Card, bank transfer, or USSD</small></span>
              <span className="payment-selected"><Check size={15} /></span>
            </div>
          </section>
          {error && <div className="form-error" role="alert">{error}</div>}
          {!isSupabaseConfigured && <div className="setup-note"><LockKeyhole size={16} /><span>Preview only: this confirmation is not saved to a database and no email will be sent. Connect Supabase for real orders.</span></div>}
          <button className="button button-dark place-order" disabled={loading || cartSyncing || (isSupabaseConfigured && !user)}>{loading ? 'Connecting to Paystack…' : cartSyncing ? 'Saving your bag…' : !isSupabaseConfigured ? <>Place preview order <ArrowRight size={16} /></> : <>Continue to Paystack <ArrowRight size={16} /></>}</button>
          <p className="secure-note"><LockKeyhole size={13} /> Your details are kept private and secure.</p>
        </form>
        <aside className="order-summary">
          <div className="summary-heading"><h2>Your edit</h2><span>{cart.reduce((sum, line) => sum + line.quantity, 0)} pieces</span></div>
          <div className="summary-lines">{cart.map(line => <CartItem key={line.variant.id} line={line} onQuantityChange={onQuantityChange} />)}</div>
          <div className="summary-totals"><div><span>Subtotal</span><span>{money(subtotal)}</span></div><div><span>Delivery</span><span>{money(deliveryFee)}</span></div><div className="summary-total"><strong>Total</strong><strong>{money(total)}</strong></div><p>All prices shown in Nigerian naira.</p></div>
          <div className="checkout-promise"><Check size={16} /><span>Order confirmation and receipt by email.</span></div>
        </aside>
      </div>
    </main>
  )
}

function PaymentCallbackPage({ onOrderComplete, onClearCart }: { onOrderComplete: (message: string) => void; onClearCart: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const startedReference = useRef<string | null>(null)
  const callbacks = useRef({ onOrderComplete, onClearCart })
  callbacks.current = { onOrderComplete, onClearCart }
  const [error, setError] = useState('')
  const reference = new URLSearchParams(location.search).get('reference') ?? new URLSearchParams(location.search).get('trxref')

  useEffect(() => {
    if (!reference) {
      setError('We could not find the Paystack reference. Your bag is still saved.')
      return
    }
    if (startedReference.current === reference) return
    startedReference.current = reference

    const verifyPayment = async () => {
      if (!supabase) {
        setError('We could not verify this payment. Your bag is still saved.')
        return
      }
      const { data, error: verifyError } = await supabase.functions.invoke('verify-paystack-payment', { body: { reference } })
      if (verifyError || !data) {
        setError(verifyError ? await getFunctionErrorMessage(verifyError, 'Payment could not be confirmed. Your bag is still saved.') : 'Payment could not be confirmed. Your bag is still saved.')
        return
      }

      const order = data as { order_id: string; order_number: string }
      const { error: emailError } = await supabase.functions.invoke('send-order-email', { body: { orderId: order.order_id } })
      localStorage.removeItem(cartStorageKey)
      callbacks.current.onClearCart()
      callbacks.current.onOrderComplete('Payment confirmed. Your order has been placed successfully.')
      navigate(`/confirmation/${encodeURIComponent(order.order_number)}`, { replace: true, state: { emailSent: !emailError, orderId: order.order_id } })
    }

    void verifyPayment()
  }, [navigate, reference])

  return <main className="payment-status-page page-width"><div className="eyebrow"><span className="eyebrow-line" /> PAYSTACK CHECKOUT</div><h1>{error ? 'Payment not confirmed.' : 'Confirming your payment…'}</h1><p>{error || 'Please keep this page open while we verify your payment and save your order.'}</p>{error && <Link className="button button-dark" to="/checkout">Return to your bag <ArrowRight size={16} /></Link>}</main>
}

function ConfirmationPage() {
  const { orderNumber } = useParams()
  const location = useLocation()
  const state = location.state as { emailSent?: boolean; orderId?: string; preview?: boolean } | null
  const preview = Boolean(state?.preview || orderNumber?.startsWith('PC-PREVIEW-'))
  const [emailSent, setEmailSent] = useState(state?.emailSent)
  const [orderId, setOrderId] = useState(state?.orderId)
  const [orderConfirmed, setOrderConfirmed] = useState(Boolean(state?.orderId))
  const [statusLoading, setStatusLoading] = useState(!state?.orderId && !preview)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState('')

  useEffect(() => {
    const client = supabase
    if (preview || state?.orderId || !client || !orderNumber) {
      setStatusLoading(false)
      return
    }
    let active = true
    client.rpc('get_order_email_status', { p_order_number: decodeURIComponent(orderNumber) }).then(({ data, error }) => {
      if (!active) return
      setStatusLoading(false)
      if (error || !data) return
      const status = data as { order_id: string; email_status: string | null }
      setOrderId(status.order_id)
      setOrderConfirmed(true)
      setEmailSent(status.email_status === 'sent')
    })
    return () => { active = false }
  }, [orderNumber, preview, state?.orderId])

  async function retryEmail() {
    if (!supabase || !orderId) return
    setRetrying(true)
    setRetryError('')
    const { error } = await supabase.functions.invoke('send-order-email', { body: { orderId, forceResend: true } })
    setRetrying(false)
    if (error) setRetryError(await getFunctionErrorMessage(error, 'We could not send the receipt yet. Please try again later.'))
    else setEmailSent(true)
  }

  return <main className="confirmation-page page-width"><div className="confirmation-icon"><Check size={25} /></div><div className="eyebrow"><span className="eyebrow-line" /> {preview ? 'CHECKOUT PREVIEW' : statusLoading ? 'CHECKING ORDER' : orderConfirmed ? 'ORDER CONFIRMED' : 'ORDER NOT FOUND'}</div><h1>{preview ? <>Preview complete.<br /><em>No order was sent.</em></> : statusLoading ? <>Checking your<br /><em>order status.</em></> : orderConfirmed ? <>Order placed<br /><em>successfully.</em></> : <>We couldn’t verify<br /><em>this order.</em></>}</h1><p>{preview ? 'This was a local checkout preview only. Pearl Collections did not receive an order, and nothing was saved or emailed.' : statusLoading ? 'Please wait while we confirm your payment and order.' : orderConfirmed ? 'Your payment is confirmed and your order is saved. Thank you for choosing Pearl.' : 'No order was found for this reference. Your cart has not been changed. Return to checkout or check your account orders.'}</p>{(preview || orderConfirmed) && <div className="order-number"><span>{preview ? 'PREVIEW REFERENCE' : 'ORDER NUMBER'}</span><strong>{orderNumber}</strong></div>}{!preview && orderConfirmed && <><div className="email-confirmation">{statusLoading ? 'Checking your receipt status…' : emailSent === false ? 'Your order is confirmed. We could not send the receipt just now.' : emailSent === true ? 'A confirmation and receipt will arrive in your inbox shortly.' : 'Your order is confirmed. Receipt status is not available right now.'}</div>{emailSent === false && orderId && <div className="retry-email"><button className="button button-outline" disabled={retrying} onClick={() => void retryEmail()}>{retrying ? 'Sending…' : 'Try sending the receipt again'} <ArrowRight size={15} /></button>{retryError && <span role="alert">{retryError}</span>}</div>}</>}{!orderConfirmed && !preview && !statusLoading ? <Link className="button button-dark" to="/account">Check my orders <ArrowRight size={16} /></Link> : <Link className="button button-dark" to="/">Back to the collection <ArrowRight size={16} /></Link>}</main>
}

function OrderConfirmationPage() {
  const location = useLocation()
  const state = location.state as { emailSent?: boolean; orderId?: string; preview?: boolean } | null
  const orderNumber = decodeURIComponent(location.pathname.split('/').pop() ?? '')
  const preview = Boolean(state?.preview || orderNumber.startsWith('PC-PREVIEW-'))

  return <><ConfirmationPage />{!preview && orderNumber && <ReceiptDeliveryPanel orderNumber={orderNumber} orderId={state?.orderId} initialEmailSent={state?.emailSent} />}</>
}

function ReceiptDeliveryPanel({ orderNumber, orderId: initialOrderId, initialEmailSent }: { orderNumber: string; orderId?: string; initialEmailSent?: boolean }) {
  const [orderId, setOrderId] = useState(initialOrderId ?? null)
  const [status, setStatus] = useState<'loading' | 'accepted' | 'failed' | 'unknown'>(initialEmailSent === true ? 'accepted' : initialEmailSent === false ? 'failed' : 'loading')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (initialEmailSent !== undefined || !supabase) {
      if (initialEmailSent === undefined) setStatus('unknown')
      return
    }
    let active = true
    supabase.rpc('get_order_email_status', { p_order_number: orderNumber }).then(({ data, error }) => {
      if (!active) return
      if (error || !data) {
        setStatus('unknown')
        return
      }
      const result = data as { order_id: string; email_status: string | null }
      setOrderId(result.order_id)
      setStatus(result.email_status === 'sent' ? 'accepted' : 'failed')
    })
    return () => { active = false }
  }, [initialEmailSent, orderNumber])

  async function resendReceipt() {
    if (!supabase || !orderId || sending) return
    setSending(true)
    setMessage('')
    const { error } = await supabase.functions.invoke('send-order-email', { body: { orderId, forceResend: true } })
    setSending(false)
    if (error) setMessage(await getFunctionErrorMessage(error, 'Receipt resend failed. Please try again later.'))
    else {
      setStatus('accepted')
      setMessage('Mailgun accepted the receipt request. Check your inbox and spam folder.')
    }
  }

  if (status === 'loading' || status === 'failed') return null
  return <section className="receipt-delivery-note page-width"><div><strong>{status === 'accepted' ? 'Receipt accepted for delivery' : 'Receipt status unavailable'}</strong><p>{status === 'accepted' ? 'Mailgun accepted the message, but inbox delivery is not confirmed. Check spam or request another copy.' : 'You can request another copy of your order receipt.'}</p></div>{orderId && <button className="button button-outline" disabled={sending} onClick={() => void resendReceipt()}>{sending ? 'Requesting…' : 'Resend receipt'} <ArrowRight size={15} /></button>}{message && <span className="receipt-delivery-message" role="status">{message}</span>}</section>
}

function AccountPage({ user, onGoogleSignIn, onSignOut }: { user: User | null; onGoogleSignIn: () => void; onSignOut: () => void }) {
  const [orders, setOrders] = useState<Array<{ id: string; order_number: string; total: number; status: string; created_at: string }>>([])
  const [sendingOrderId, setSendingOrderId] = useState<string | null>(null)
  const [receiptMessage, setReceiptMessage] = useState('')
  useEffect(() => {
    if (!supabase || !user) return
    supabase.from('orders').select('id,order_number,total,status,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).then(({ data }) => {
      if (data) setOrders(data)
    })
  }, [user?.id])

  async function resendOrderReceipt(orderId: string) {
    if (!supabase || sendingOrderId) return
    setSendingOrderId(orderId)
    setReceiptMessage('')
    const { error } = await supabase.functions.invoke('send-order-email', { body: { orderId, forceResend: true } })
    setSendingOrderId(null)
    setReceiptMessage(error
      ? await getFunctionErrorMessage(error, 'Receipt resend failed. Please try again later.')
      : 'Mailgun accepted the receipt request. Check your inbox and spam folder.')
  }

  return (
    <main className="account-page page-width">
      <div className="eyebrow"><span className="eyebrow-line" /> YOUR PEARL ACCOUNT</div>
      <h1>Welcome <em>back.</em></h1>
      {user ? <>
        <div className="account-profile">
          <div className="avatar">{(user.user_metadata.full_name ?? user.email ?? 'P').slice(0, 1).toUpperCase()}</div>
          <div><strong>{user.user_metadata.full_name ?? user.user_metadata.name ?? 'Pearl customer'}</strong><span>{user.email}</span></div>
          <button className="text-link" onClick={onSignOut}>Sign out <ArrowRight size={14} /></button>
        </div>
        <section className="account-orders">
          <div className="account-orders-heading"><h2>Your orders</h2><span>{orders.length} ORDERS</span></div>
          {orders.length ? orders.map(order => <div className="account-order" key={order.id}>
            <div>
              <strong>{order.order_number}</strong>
              <span>{new Date(order.created_at).toLocaleDateString('en-NG', { dateStyle: 'long' })}</span>
              <button className="text-link order-receipt-action" disabled={sendingOrderId !== null} onClick={() => void resendOrderReceipt(order.id)}>{sendingOrderId === order.id ? 'Requesting receipt…' : 'Resend receipt'}</button>
            </div>
            <span className="order-status">{order.status}</span>
            <strong>{money(order.total)}</strong>
          </div>) : <p className="account-empty">Your first Pearl piece is still out there. <Link to="/">Find it here <ArrowRight size={14} /></Link></p>}
          {receiptMessage && <p className="receipt-delivery-message" role="status">{receiptMessage}</p>}
        </section>
      </> : <div className="account-signin"><p>Sign in to find your orders and keep everything in one place.</p><button className="button button-dark" onClick={onGoogleSignIn}><GoogleMark /> Continue with Google</button></div>}
    </main>
  )
}

function SizeGuideDialog({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="info-modal size-guide-modal" role="dialog" aria-modal="true" aria-labelledby="size-guide-title" onKeyDown={event => { if (event.key === 'Escape') onClose() }}><div className="modal-heading"><div><span className="eyebrow">A HELPFUL STARTING POINT</span><h2 id="size-guide-title">Size & fit</h2></div><button className="icon-button" aria-label="Close size guide" autoFocus onClick={onClose}><X size={19} /></button></div><p className="size-guide-note">Use the available option labels as a guide. Measurements can vary by style, and product-specific measurements have not yet been supplied.</p><table className="size-guide-table"><thead><tr><th>Option</th><th>General label</th></tr></thead><tbody><tr><td>S</td><td>Small</td></tr><tr><td>M</td><td>Medium</td></tr><tr><td>L</td><td>Large</td></tr><tr><td>One size</td><td>Single option for this style</td></tr></tbody></table><button className="button button-dark modal-done" onClick={onClose}>Done <Check size={15} /></button></section></div>
}

function AuthSetupDialog({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="info-modal auth-setup-modal" role="dialog" aria-modal="true" aria-labelledby="auth-setup-title" onKeyDown={event => { if (event.key === 'Escape') onClose() }}><div className="modal-heading"><div><span className="eyebrow">GOOGLE SIGN-IN</span><h2 id="auth-setup-title">Connect your sign-in</h2></div><button className="icon-button" aria-label="Close setup details" autoFocus onClick={onClose}><X size={19} /></button></div><p>Google sign-in needs a Supabase project and a Google OAuth web client. No credentials are configured in this workspace yet.</p><ol><li>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code>, then restart Vite.</li><li>Enable Google under Supabase Auth providers.</li><li>In Google Cloud Console, create a Web OAuth client and add the Supabase callback URL shown in Supabase.</li><li>Paste the OAuth client ID and secret into Supabase Auth settings. Keep the secret out of this app.</li></ol><p className="modal-footnote">Until connected, you can use the local checkout preview. It does not create a real order or send email.</p><button className="button button-dark modal-done" onClick={onClose}>Got it <Check size={15} /></button></section></div>
}

function InfoPage({ eyebrow, title, intro, sections, draft = false }: { eyebrow: string; title: string; intro: string; sections: Array<{ title: string; body: string }>; draft?: boolean }) {
  return <main className="info-page page-width"><Link className="back-link" to="/"><ArrowLeft size={15} /> Back to the collection</Link><div className="eyebrow"><span className="eyebrow-line" /> {eyebrow}</div><h1>{title}</h1><p className="info-intro">{intro}</p>{draft && <div className="draft-notice">Draft page. Business-owner and legal review is required before launch.</div>}<div className="info-sections">{sections.map(section => <section key={section.title}><h2>{section.title}</h2><p>{section.body}</p></section>)}</div></main>
}

function NotFoundPage() {
  return <main className="not-found page-width"><div className="eyebrow"><span className="eyebrow-line" /> A LITTLE OFF THE MAP</div><h1>This page took<br /><em>a different turn.</em></h1><Link className="button button-dark" to="/">Back to the collection <ArrowRight size={16} /></Link></main>
}

function GoogleMark() {
  return <svg className="google-mark" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" transform="translate(0 4)"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.72 7.18l7.19 5.59c4.2-3.87 6.57-9.57 6.57-17.24Z"/><path fill="#FBBC05" d="M10.53 28.59a14.42 14.42 0 0 1 0-9.18l-7.98-6.19a23.94 23.94 0 0 0 0 21.56l7.98-6.19Z" transform="translate(0 2)"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.79l-7.19-5.59c-2.02 1.35-4.61 2.15-8.71 2.15-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>
}

export default App
