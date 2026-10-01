# Pearl Collections Implementation Guide

This guide turns the requirements in [PRD.md](PRD.md) into an implementation sequence for the MVP. The PRD remains the source of truth for product scope and acceptance criteria. Decisions listed there as open must be confirmed before the affected feature is finalized.

## 1. Implementation Principles

- Build the customer journey in vertical slices, keeping the storefront usable as each slice lands.
- Treat the browser as untrusted: validate identity, stock, prices, totals, and order inputs in trusted database or server-side code.
- Keep credentials in local environment variables or managed secrets. Commit only a placeholder `.env.example`.
- Use accessible semantic HTML, responsive layouts, and explicit loading, empty, success, and error states.
- Use Nigerian naira consistently. Store monetary values as integer minor units or PostgreSQL `numeric`, never floating point; document the chosen representation and apply it consistently.

## 2. Suggested Application Structure

Adapt this structure to the Vite project as it is created; avoid adding layers that the application does not need.

```text
src/
  app/                 # Router, providers, route guards
  components/          # Shared UI
  features/
    catalog/           # Product listing, search, filters, details
    cart/              # Guest and authenticated cart behavior
    checkout/          # Delivery form and order submission
    account/           # Profile, order history, order details
  lib/                 # Supabase client and shared utilities
  pages/               # Route-level pages
  styles/              # Global styles and design tokens
supabase/
  functions/           # Edge Functions
  migrations/          # Versioned schema, policies, functions
  seed.sql             # Development products only
docs/
```

Keep the database schema, RLS policies, and database functions in versioned migrations so development and production can be recreated consistently.

## 3. Build Sequence

### Milestone 0: Confirm decisions and bootstrap

- Resolve or explicitly defer the PRD's open decisions that affect the initial build: logo/name styling, accent colour, product categories and seed inventory, and delivery-fee rule.
- Create the React + Vite application, Git repository, `.gitignore`, formatting/linting setup, and a minimal deployment-ready build.
- Add `.env.example` with variable names only. Configure separate local and production Supabase projects where practical.
- Document supported Node.js version and local setup commands in `README.md`.

**Exit check:** A clean checkout can install dependencies and run the development server and production build without credentials committed to Git.

### Milestone 1: Design foundations and storefront shell

- Define CSS variables for approved colours, typography, spacing, borders, and focus states.
- Build shared navigation, footer, page layout, product card, buttons, form fields, and toast/alert patterns.
- Add responsive Home, Shop, Product Details, About, Contact, and 404 routes using temporary sample data.
- Implement product image sizing, descriptive alt text, page titles, and meta descriptions.

**Exit check:** Core browsing pages render at mobile and desktop sizes, with keyboard-visible focus and no broken images or overflowing content.

### Milestone 2: Catalog and cart

- Connect product and variant reads to Supabase. Public catalog access should expose only active products and available product information.
- Add search and the PRD filters: category, size, price range, gender, and availability.
- Implement variant selection and availability display on product details.
- Support guest cart persistence in localStorage, quantity edits, removal, and accurate display totals.
- On sign-in, merge the guest cart into the account cart using a documented duplicate-item and stock policy. Revalidate all cart items against current product and variant data.

**Exit check:** Search/filter, variant selection, cart updates, refresh persistence, empty states, and guest-to-account cart merge work without trusting stale browser prices or stock.

### Milestone 3: Supabase schema and security

- Add migrations for `profiles`, `products`, `product_variants`, `cart_items`, `orders`, `order_items`, and `email_logs` as described in the PRD.
- Add foreign keys, uniqueness rules, quantity and amount checks, indexes for common lookups, and timestamps where appropriate.
- Enable RLS on every exposed table. Write policies that limit profile, cart, order, and order-item access to their owner; keep public catalog reads restricted to active products and appropriate variants.
- Add the profile-creation trigger for new Auth users, handling missing optional provider fields.
- Seed non-production sample products separately from production data.

**Exit check:** Migrations apply to a fresh project, and tests or manual checks confirm anonymous and cross-user access is denied where required.

### Milestone 4: Google authentication and account

- Configure Google OAuth in Supabase and Google Cloud for local callback URLs first; add production URLs only during deployment.
- Implement sign-in, sign-out, session restoration, protected checkout/account routes, and return-to-original-route behavior.
- Display profile details and order history. Fetch order details only for the authenticated owner.
- Handle OAuth cancellation, denied access, expired sessions, and unavailable profile fields gracefully.

**Exit check:** A user can sign in and out, refresh without losing a valid session, and cannot access another user's account or orders.

### Milestone 5: Checkout and atomic order creation

- Build and validate the customer and delivery form. Keep delivery fee configuration in one trusted location and display it clearly in the order summary.
- Use `initialize-paystack` to compute the current cart total from Supabase and start Paystack checkout; store the expected amount and delivery snapshot in a payment attempt.
- Verify Paystack status, NGN currency, amount, reference, and customer server-side before calling the service-role-only `place_paid_order` database function.
- Create the paid order, preserve item snapshots, decrement stock, and clear the database cart atomically. Only clear the local cart after verified order creation; request a refund if stock or totals changed after payment.
- Generate a unique order number using the `PC-YYYYMMDD-NNN` presentation format, backed by a uniqueness guarantee that remains correct under concurrent requests.
- Prevent accidental duplicate submissions in the UI, while ensuring database behavior remains correct if a request is retried.
- Return only the order information needed by the client. Never accept client-supplied totals as authoritative.

**Exit check:** Successful orders preserve purchase-time item names, variants, and prices; insufficient stock or invalid data leaves no partial order and does not incorrectly clear the cart.

### Milestone 6: Confirmation email and order pages

- Create the `send-order-email` Supabase Edge Function. Authenticate the caller, verify ownership, and load the order from the database before generating the email.
- Store the Mailgun API key as an Edge Function secret. Do not include it in frontend variables or client bundles.
- Record each delivery attempt in `email_logs`. Email failure must not roll back or hide a successfully created order; provide a controlled retry path.
- Build the confirmation page, receipt email, My Orders list, and Order Details page from persisted order data.

**Exit check:** An order remains visible if Mailgun fails, failed attempts are inspectable and retryable, and the email content agrees with the stored order.

### Milestone 7: Legal pages and launch readiness

- Publish the Privacy Policy, Terms, and Delivery and Returns pages required by the PRD and OAuth review. Have the business owner review the legal content before launch.
- Verify production Supabase URL and publishable key, OAuth redirect and authorized origins, Vercel environment variables, Mailgun domain, SPF/DKIM records, and allowed email recipients.
- Confirm production data is not seeded with sample products and that no service-role or Mailgun secrets appear in browser assets or Git history.
- Run the complete test checklist, accessibility checks, responsive checks, and a production build before release.

**Exit check:** The MVP success journey in the PRD works against production configuration, legal pages are available, and all launch-critical secrets and redirects are verified.

## 4. Security and Data Rules

- Use the Supabase publishable/anon key in the browser only with RLS correctly enabled. Never expose the service-role key.
- Derive the customer identity from the verified Supabase session in database/server-side operations, not from a submitted user ID.
- Recalculate price, subtotal, delivery fee, and total using trusted data at order time.
- Validate variant ownership, product activity, quantity bounds, and stock on the server/database path.
- Use transactional stock checks and updates to prevent overselling under concurrent orders.
- Restrict Edge Function CORS to the required origins and validate inputs even when the caller is authenticated.
- Avoid logging access tokens, API keys, or unnecessary personal and delivery information.

## 5. Verification Checklist

- Catalog: active products, search, all filters, variants, unavailable products, and image failures.
- Cart: guest persistence, quantity boundaries, remove, empty state, stale item handling, and login merge.
- Authentication: successful login, cancellation, logout, session refresh, protected routes, and return path.
- Checkout: required fields, invalid fields, duplicate clicks, changed price, changed stock, and concurrent last-item orders.
- Orders: transactional creation, unique order number, purchase-time prices, cart clearing, owner-only reads, and order history.
- Email: successful send, sandbox rejection, provider failure, log creation, retry, and order remains intact.
- UX quality: keyboard operation, visible focus, contrast, alt text, mobile layout, loading/error/empty/success states.
- Release: clean production build, correct environment variables, OAuth redirects, RLS review, no committed secrets, and verified Mailgun domain.

## 6. Post-MVP Boundary

Do not add wishlist, discount codes, additional payment providers, admin order management, status-update emails, or advanced inventory features to the MVP unless the PRD is revised. Keep interfaces extensible enough to add those later, but avoid implementing speculative flows now.