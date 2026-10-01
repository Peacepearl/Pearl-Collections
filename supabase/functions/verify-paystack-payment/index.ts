import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('SITE_ORIGIN') ?? 'http://localhost:5173',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders })
}

async function refundPayment(secret: string, transactionId: number) {
  try {
    const response = await fetch('https://api.paystack.co/refund', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction: transactionId }),
    })
    const result = await response.json().catch(() => null)
    return response.ok && result?.status === true
  } catch {
    return false
  }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authorization = request.headers.get('Authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const paystackSecret = Deno.env.get('PAYSTACK_SECRET_KEY')
  if (!authorization || !supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Payment service is not configured' }, 500)
  if (!paystackSecret) return json({ error: 'Paystack is not configured.' }, 503)

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return json({ error: 'Sign in to confirm this payment.' }, 401)

  let reference: string
  try {
    reference = String((await request.json()).reference ?? '').trim()
    if (!/^PC-[0-9a-f-]{36}$/i.test(reference)) throw new Error('Invalid payment reference')
  } catch {
    return json({ error: 'A valid Paystack reference is required.' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: attempt, error: attemptError } = await admin.from('payment_attempts')
    .select('id,user_id,reference,amount_kobo,status,order_id')
    .eq('reference', reference)
    .eq('user_id', user.id)
    .single()
  if (attemptError || !attempt) return json({ error: 'This payment does not belong to your account.' }, 404)

  if (attempt.status === 'paid' && attempt.order_id) {
    const { data: existingOrder } = await admin.from('orders').select('id,order_number').eq('id', attempt.order_id).single()
    if (existingOrder) return json({ ...existingOrder, already_processed: true })
  }
  if (attempt.status !== 'initialized') return json({ error: 'This payment attempt is no longer active.' }, 409)

  let providerResponse: Response
  try {
    providerResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${paystackSecret}` },
    })
  } catch {
    return json({ error: 'Could not reach Paystack to verify payment. Please retry.' }, 502)
  }
  const providerResult = await providerResponse.json().catch(() => null)
  const payment = providerResult?.data
  if (!providerResponse.ok || !providerResult?.status || !payment) return json({ error: 'Paystack could not verify this transaction.' }, 502)
  if (payment.status !== 'success') {
    await admin.from('payment_attempts').update({ status: 'failed', failure_reason: 'Paystack transaction was not successful.' }).eq('id', attempt.id)
    return json({ error: 'Payment was not completed. Your bag is still saved.' }, 402)
  }

  const metadata = payment.metadata ?? {}
  const customerEmail = String(payment.customer?.email ?? '').toLowerCase()
  if (payment.reference !== reference || metadata.user_id !== user.id || metadata.payment_attempt_id !== attempt.id || customerEmail !== user.email?.toLowerCase()) {
    return json({ error: 'Paystack transaction details could not be matched to this account.' }, 400)
  }

  if (payment.currency !== 'NGN' || payment.amount !== Number(attempt.amount_kobo)) {
    const refunded = await refundPayment(paystackSecret, payment.id)
    await admin.from('payment_attempts').update({
      status: refunded ? 'refunded' : 'refund_pending',
      failure_reason: 'Verified Paystack amount or currency did not match the payment attempt.',
    }).eq('id', attempt.id)
    return json({ error: refunded ? 'Payment details did not match, so Paystack has been asked to refund this payment.' : 'Payment details did not match. The refund needs manual review; contact shop support.' }, 409)
  }

  const { data: order, error: orderError } = await admin.rpc('place_paid_order', {
    p_user_id: user.id,
    p_reference: reference,
    p_paid_amount_kobo: payment.amount,
  })
  if (orderError || !order) {
    const refunded = await refundPayment(paystackSecret, payment.id)
    await admin.from('payment_attempts').update({
      status: refunded ? 'refunded' : 'refund_pending',
      failure_reason: orderError?.message?.slice(0, 500) ?? 'Could not create order after successful payment.',
    }).eq('id', attempt.id)
    return json({ error: refunded ? 'Payment succeeded, but the cart changed. A refund has been requested; your bag is still saved.' : 'Payment succeeded, but the order needs support review. Your bag is still saved.' }, 409)
  }

  return json(order)
})