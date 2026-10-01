# Local Setup

This guide gets the current Vite app running and connects it to development services. Keep all credentials private and use a separate Supabase project for production.

## Prerequisites

- Node.js 20.19+ or 22.12+.
- npm.
- Git and a GitHub repository.
- A Supabase project for development.
- A Google Cloud OAuth client configured for Supabase Auth.
- A Mailgun sandbox domain for development email testing.

## Application

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`. On Windows PowerShell, use `Copy-Item .env.example .env.local`.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the development project's URL and publishable/anon key. These are the only Supabase values used in the browser.
4. Apply `supabase/migrations/202610010001_initial_schema.sql` to the development project using the Supabase SQL editor or Supabase CLI.
5. Run `supabase/seed.sql` only against a development database to add the sample catalog.
6. Start the app with `npm run dev`. If PowerShell blocks `npm`, use `npm.cmd`.

Without `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, the app allows a local checkout preview so the form can be tested. Preview confirmations are not stored in Supabase and no email is sent. Google sign-in is not simulated; it becomes available only after the OAuth steps below are complete.

## OAuth

1. In Google Cloud Console, create or select a project and configure the OAuth consent screen (branding, audience, and contact details).
2. Keep the app in Testing while developing and add the Google accounts allowed to sign in.
3. Create an OAuth client ID for a Web application. Add the Supabase Auth callback URL shown by the Supabase Google provider settings as an authorized redirect URI.
4. In Supabase Dashboard, enable Google under Auth providers and enter the Google client ID and client secret there. Do not put the secret in this app.
5. Add `http://localhost:5173` and `http://127.0.0.1:5173` to Supabase's allowed redirect URLs; include the production storefront URL at launch.
6. Test sign-in and sign-out. When starting from checkout, the app returns to `/checkout` after OAuth.
7. Before launch, publish the Google OAuth app and complete any verification requirements that apply to its requested scopes and audience.

## Email Function

- Deploy `supabase/functions/send-order-email` and configure `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_FROM_EMAIL`, and `SITE_ORIGIN` as Edge Function secrets.
- Configure the function's Supabase service-role key as a managed secret; never put it in `.env.local` or browser code. Supabase-hosted functions provide this value in their environment.
- Authorize test recipients in the Mailgun sandbox.
- Invoke the email function only after an order is created. Email failures must not invalidate the order.

## Paystack Payments

- Create a Paystack account and use a test secret key for development. Add it in Supabase Dashboard → Edge Functions → Secrets as `PAYSTACK_SECRET_KEY`. Never add this secret as a `VITE_` variable or commit it to `.env.local`.
- Paystack is initialized with the shop bearing provider transaction fees. Its displayed amount is reconciled to the server-validated checkout snapshot; stale saved cart items are removed before payment begins.
- Ensure `SITE_ORIGIN` is set to the exact local app origin (`http://127.0.0.1:5173`) and the Supabase Auth redirect allowlist contains the callback origins.
- Deploy `initialize-paystack` and `verify-paystack-payment` with JWT verification enabled.
- Paystack returns to `/payment/callback`; the app verifies the transaction server-side before creating the order.
- Switch from test to live keys only after completing a real low-value payment test and confirming order persistence, cart clearing, confirmation email, and refunds.

## Before Sharing a Development Environment

- Confirm RLS is enabled on every table accessible through the Supabase API.
- Use development products and test accounts only.
- Verify `.env.local` and all credential files are ignored by Git.
- Never use production customer or order data as seed data.