# Deployment

The PRD plans Vercel for the React frontend and Supabase for PostgreSQL, Auth, and Edge Functions. This document is a release checklist; exact dashboard steps and commands should be recorded when the projects are created.

## Environments

- Keep development and production Supabase projects and credentials separate.
- Configure preview deployments deliberately; do not point untrusted previews at production data.
- Use Vercel environment configuration for frontend-exposed values only, such as the Supabase project URL and publishable/anon key.
- Store service-role and Mailgun credentials only in Supabase Edge Function secrets or another server-side secret manager.

## Pre-deployment

- Confirm the production domain and final business decisions that affect checkout, delivery fee, branding, and product data.
- Review database migrations and apply them in the intended order.
- Verify RLS and order-function behavior using non-owner and anonymous test sessions.
- Configure Google OAuth authorized origins and Supabase redirect allowlists for the production domain.
- Configure the Mailgun sending domain, sender, SPF and DKIM DNS records, and production secrets.
- Confirm the Privacy Policy, Terms, and Delivery and Returns pages are published and reviewed by the business owner.
- Ensure production catalog data is intentional and no development seed data will be loaded.

## Release

1. Run the project test suite and production build from a clean checkout.
2. Apply reviewed Supabase migrations and deploy the Edge Function version matching the frontend.
3. Set Vercel production environment variables and deploy the frontend.
4. Verify sign-in, catalog reads, cart behavior, order placement, email sending, and order history on the production domain using an authorized test account.
5. Check that the browser bundle and repository contain no server secrets.

## Rollback Considerations

- Keep the previous frontend deployment available for rollback.
- Treat database changes as separately managed; avoid destructive schema changes without a tested migration and recovery plan.
- If email sending is degraded, preserve orders and use the documented retry procedure rather than asking customers to place orders again.
- Record deployment date, app revision, migration versions, and any operational issue in the project release log when one is established.