import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('SITE_ORIGIN') ?? 'http://localhost:5173',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })

  const authorization = request.headers.get('Authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const mailgunApiKey = Deno.env.get('MAILGUN_API_KEY')
  const mailgunDomain = Deno.env.get('MAILGUN_DOMAIN')
  const fromEmail = Deno.env.get('MAILGUN_FROM_EMAIL')

  if (!authorization || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return Response.json({ error: 'Email service is not configured' }, { status: 500, headers: corsHeaders })
  }

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Authentication required' }, { status: 401, headers: corsHeaders })

  let orderId: string
  let forceResend = false
  try {
    const body = await request.json()
    orderId = String(body.orderId ?? '')
    forceResend = body.forceResend === true
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new Error('Invalid order ID')
  } catch {
    return Response.json({ error: 'A valid order ID is required' }, { status: 400, headers: corsHeaders })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: order, error: orderError } = await userClient.from('orders')
    .select('id,order_number,customer_email,full_name,subtotal,delivery_fee,total,delivery_address,city,state,country,created_at,order_items(product_name,quantity,unit_price,size,colour,subtotal)')
    .eq('id', orderId)
    .eq('user_id', user.id)
    .single()

  if (orderError || !order) return Response.json({ error: 'Order not found' }, { status: 404, headers: corsHeaders })
  const resendWindowStart = new Date(Date.now() - 60_000).toISOString()
  if (forceResend) {
    const { data: recentAttempt } = await admin.from('email_logs')
      .select('id')
      .eq('order_id', order.id)
      .gte('attempted_at', resendWindowStart)
      .limit(1)
      .maybeSingle()
    if (recentAttempt) {
      return Response.json({ error: 'Please wait one minute before requesting another receipt.' }, { status: 429, headers: corsHeaders })
    }
  } else {
    const { data: priorSuccess } = await admin.from('email_logs')
      .select('id')
      .eq('order_id', order.id)
      .eq('status', 'sent')
      .limit(1)
      .maybeSingle()
    if (priorSuccess) return Response.json({ accepted: true, alreadyAccepted: true }, { headers: corsHeaders })
  }

  if (!mailgunApiKey || !mailgunDomain || !fromEmail) {
    await admin.from('email_logs').insert({ order_id: order.id, status: 'failed', error_message: 'Mailgun is not configured' })
    return Response.json({ error: 'Mailgun is not configured' }, { status: 503, headers: corsHeaders })
  }

  const formatMoney = (amount: number) => `₦${new Intl.NumberFormat('en-NG').format(amount)}`
  const itemRows = order.order_items.map(item => `<tr><td>${escapeHtml(item.product_name)}${item.size ? ` · ${escapeHtml(item.size)}` : ''}${item.colour ? ` · ${escapeHtml(item.colour)}` : ''} × ${item.quantity}</td><td>${formatMoney(item.subtotal)}</td></tr>`).join('')
  const fullAddress = [order.delivery_address, order.city, order.state, order.country].map(escapeHtml).join(', ')
  const html = `<div style="font-family:Arial,sans-serif;color:#242523;max-width:620px;margin:auto"><p style="letter-spacing:3px;font-size:12px">PEARL COLLECTIONS</p><h1 style="font-family:Georgia,serif;font-weight:400">Your order is in good hands.</h1><p>Hello ${escapeHtml(order.full_name)}, thank you for choosing Pearl.</p><p>Order <strong>${escapeHtml(order.order_number)}</strong></p><table style="width:100%;border-collapse:collapse" cellpadding="10"><tbody>${itemRows}</tbody><tfoot><tr><td>Subtotal</td><td>${formatMoney(order.subtotal)}</td></tr><tr><td>Delivery</td><td>${formatMoney(order.delivery_fee)}</td></tr><tr><th align="left">Total</th><th align="left">${formatMoney(order.total)}</th></tr></tfoot></table><p><strong>Delivering to</strong><br>${fullAddress}</p><p>With care,<br>Pearl Collections</p></div>`
  const text = `Pearl Collections order ${order.order_number}\nHello ${order.full_name}, thank you for choosing Pearl.\n\n${order.order_items.map(item => `${item.product_name} x ${item.quantity}: ${formatMoney(item.subtotal)}`).join('\n')}\nSubtotal: ${formatMoney(order.subtotal)}\nDelivery: ${formatMoney(order.delivery_fee)}\nTotal: ${formatMoney(order.total)}\n\nDelivering to: ${fullAddress}`

  const form = new FormData()
  form.set('from', fromEmail)
  form.set('to', order.customer_email)
  form.set('subject', `Pearl Collections order ${order.order_number}`)
  form.set('html', html)
  form.set('text', text)

  const response = await fetch(`https://api.mailgun.net/v3/${encodeURIComponent(mailgunDomain)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`api:${mailgunApiKey}`)}` },
    body: form,
  })

  if (!response.ok) {
    const providerMessage = (await response.text()).slice(0, 1000)
    await admin.from('email_logs').insert({ order_id: order.id, status: 'failed', error_message: `Mailgun ${response.status}: ${providerMessage}` })
    return Response.json({ error: 'Email delivery failed' }, { status: 502, headers: corsHeaders })
  }

  await admin.from('email_logs').insert({ order_id: order.id, status: 'sent' })
  return Response.json({ accepted: true }, { headers: corsHeaders })
})