import { createClient } from 'npm:@supabase/supabase-js@2'

const siteOrigin = Deno.env.get('SITE_ORIGIN') ?? 'http://localhost:5173'
const corsHeaders = {
  'Access-Control-Allow-Origin': siteOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Delivery = {
  full_name: string
  phone: string
  address: string
  city: string
  state: string
  country: string
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders })
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
  if (!paystackSecret) return json({ error: 'Paystack is not configured. Add PAYSTACK_SECRET_KEY in Supabase Edge Function secrets.' }, 503)

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user?.email) return json({ error: 'Sign in with Google before starting payment.' }, 401)

  let delivery: Delivery
  let expectedTotal: number
  let items: Array<{ variant_id: string; quantity: number }>
  try {
    const body = await request.json()
    const source = body.delivery ?? {}
    expectedTotal = Number(body.expectedTotal)
    items = Array.isArray(body.items) ? body.items : []
    delivery = {
      full_name: String(source.full_name ?? '').trim(),
      phone: String(source.phone ?? '').trim(),
      address: String(source.address ?? '').trim(),
      city: String(source.city ?? '').trim(),
      state: String(source.state ?? '').trim(),
      country: String(source.country ?? '').trim(),
    }
  } catch {
    return json({ error: 'Valid delivery details are required.' }, 400)
  }
  if (Object.values(delivery).some(value => !value) || Object.values(delivery).some(value => value.length > 240)) {
    return json({ error: 'Complete all delivery details using valid lengths.' }, 400)
  }
  if (!Number.isSafeInteger(expectedTotal) || expectedTotal < 1) return json({ error: 'The checkout total is invalid. Refresh your bag and try again.' }, 400)
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: attempt, error: attemptError } = await admin.rpc('prepare_paystack_attempt', {
    p_user_id: user.id,
    p_items: items,
    p_delivery: delivery,
    p_expected_total: expectedTotal,
  })
  if (attemptError || !attempt) return json({ error: attemptError?.message ?? 'Could not start a payment attempt.' }, 409)

  const attemptId = String(attempt.attempt_id)
  const reference = String(attempt.reference)
  const amountKobo = Number(attempt.amount_kobo)
  if (!attemptId || !reference || !Number.isSafeInteger(amountKobo) || amountKobo < 100) {
    return json({ error: 'The checkout total is invalid. Your bag is still saved.' }, 400)
  }

  let providerResponse: Response
  try {
    providerResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${paystackSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        amount: amountKobo,
        currency: 'NGN',
        bearer: 'account',
        reference,
        callback_url: `${siteOrigin}/payment/callback`,
        metadata: { user_id: user.id, payment_attempt_id: attemptId },
      }),
    })
  } catch {
    await admin.from('payment_attempts').update({ status: 'failed', failure_reason: 'Paystack could not be reached.' }).eq('id', attemptId)
    return json({ error: 'Could not reach Paystack. Your bag has not been charged.' }, 502)
  }

  const providerResult = await providerResponse.json().catch(() => null)
  if (!providerResponse.ok || !providerResult?.status || !providerResult?.data?.authorization_url) {
    await admin.from('payment_attempts').update({ status: 'failed', failure_reason: 'Paystack initialization failed.' }).eq('id', attemptId)
    return json({ error: 'Paystack could not start the payment. Your bag has not been charged.' }, 502)
  }

  const { error: updateError } = await admin.from('payment_attempts').update({ status: 'initialized' }).eq('id', attemptId)
  if (updateError) {
    return json({ error: 'Could not save the payment attempt. Please try again; your bag has not been charged.' }, 500)
  }
  return json({ authorization_url: providerResult.data.authorization_url, reference })
})