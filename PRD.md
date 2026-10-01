# Pearl Collections Fashion Shop: Product Requirements Document

**Version:** 1.2 (Paystack payment added)
**Project type:** E-commerce web application
**Primary goal:** A functional, elegant fashion storefront where customers can browse products, sign in with Google, add items to a cart, check out, and receive an order confirmation email.

## 1. What changed from v1.0

| # | Issue in v1.0 | Resolution in v1.1 |
|---|---|---|
| 1 | Tech table said React, architecture diagram said HTML/CSS/JS | Standardised on **React + Vite** |
| 2 | Wishlist was both a goal and a non-goal | **Moved to Phase 11 (post-MVP)** |
| 3 | Section numbering skipped from 28 to 30 | Renumbered |
| 4 | Risk of overselling the last item | Orders are created by one **database function** that checks and reduces stock in a single transaction |
| 5 | Totals could be tampered with in the browser | **Prices are always recomputed on the server** from database prices |
| 6 | Guests add to cart before login | Guest cart lives in localStorage and is **merged into the database cart after login** |
| 7 | Order numbers used the prefix FS- | Changed to **PC-** (Pearl Collections), e.g. PC-20261001-001 |
| 8 | Email failures needed to be retryable | Added an **email_logs** table |
| 9 | Separate users table | Supabase Auth manages logins; a **profiles** table holds extra fields |
| 10 | No legal pages | Added Privacy Policy, Terms, Delivery and Returns (also needed for Google OAuth verification) |
| 11 | Hosting undecided | **Vercel** (frontend) and **Supabase Edge Functions** (server code) |
| 12 | MVP had no online payment | **Paystack hosted checkout**; orders are created only after server-side payment verification |

## 2. Product overview

Pearl Collections is an online storefront for fashion products. The application provides:

- A modern, classy, fashion-focused storefront
- Product browsing, search, filtering and product details
- Shopping cart with size/colour variants
- Google sign-in
- Paystack checkout in Nigerian naira, with server-side payment verification before order creation
- Order confirmation email and receipt
- Customer order history
- Database persistence in Supabase
- A responsive experience on desktop and mobile

## 3. Technology stack

| Area | Technology |
|---|---|
| Frontend | React, Vite, React Router, CSS (variables-based design system) |
| Database | Supabase PostgreSQL |
| Authentication | Google OAuth via Google Cloud Console + Supabase Auth |
| Server code | Supabase Edge Functions |
| Email | Mailgun (called only from the server) |
| Image storage | Supabase Storage |
| Hosting | Vercel |
| Version control | Git and GitHub |

**Architecture:** Website (React) → Supabase Auth → Supabase PostgreSQL → Edge Function → Mailgun

## 4. Problem statement

Small fashion businesses need an easy online storefront. The purchasing journey should be simple:

Browse → View Product → Add to Cart → Sign in → Checkout → Place Order → Confirmation → Email → Receipt

Important customer and order information must persist after the browser is closed or refreshed.

## 5. Goals (Version 1)

1. Customers can browse fashion products.
2. Customers can view product details and choose a size/colour.
3. Customers can add to cart, change quantities and remove items.
4. Customers can sign in with Google.
5. Authenticated customers can check out.
6. Customers and orders are saved in the database.
7. A confirmation email is sent through Mailgun.
8. Customers can view previous orders.
9. The site is responsive and looks professional.
10. Customers can pay through Paystack and see an explicit order-success confirmation.

## 6. Non-goals for Version 1

Multiple vendors, reviews and ratings, discount codes, loyalty points, **wishlist (moved to Phase 11)**, live delivery tracking, complex inventory management, additional payment providers beyond Paystack, admin analytics, AI recommendations, other social logins, multi-currency checkout.

## 7. Target user

A customer who wants to browse fashion items, see product information, select sizes and variants, add items to a cart, place an order, receive confirmation and view past orders.

## 8. User journey

Homepage → Shop → Product Details → Select Size/Variant → Add to Cart → Cart → Checkout → Google Login → Delivery Information → Review Order → Place Order → Order Created → Confirmation Page → Confirmation Email and Receipt

## 9. Pages required

| Page | Contents |
|---|---|
| Home | Navbar, logo, hero, featured products, categories, promotional section, call to action, footer |
| Shop | Product grid, search, filters (category, size, price range, gender, availability) |
| Product details | Image gallery, name, price (₦), description, sizes, colours, availability, quantity selector, Add to Cart |
| Cart | Product, size, quantity, unit price, subtotal, remove, total, continue shopping, checkout |
| Checkout | Customer info, delivery info, order summary, Place Order |
| Order confirmation | Order number, message, View My Orders, Continue Shopping |
| My Account | Profile (name, email, Google photo) and orders list |
| Order details | Items, totals, delivery address, status |
| About, Contact | Brand story and contact details |
| Privacy Policy, Terms, Delivery and Returns | Required for trust and Google OAuth |
| 404 page | Friendly not-found page |

## 10. Authentication

- "Continue with Google" button.
- Flow: Google Cloud Console → Google OAuth → Supabase Auth → user session.
- The app never stores Google passwords.
- A database trigger creates a profile (name, email, avatar) at first login.
- Checkout and My Orders are protected routes; users return to where they were after login.
- Note: while the Google app is in Testing mode only listed test users can sign in. It must be **published** before launch.

## 11. Checkout

**Customer information:** full name, email, phone number.
**Delivery information:** address, city, state, country.
**Order summary:** products, quantities, prices, subtotal, delivery fee (flat ₦5,000 in v1, kept in a config file), total.

The Place Order button is disabled while processing to prevent duplicate orders.

## 12. Payment

Version 1 uses Paystack hosted checkout. The browser never receives the Paystack secret key. The server calculates the payable amount from current database prices, initializes the transaction, verifies the returned reference, amount, currency and customer, and only then creates the order. Payment uses NGN and Paystack amounts are sent in kobo. If the cart changes after payment and the order cannot be committed, the server requests a refund and leaves the cart intact.

## 13. Order processing

When the customer starts Paystack checkout, the `initialize-paystack` Edge Function validates the authenticated cart and delivery information, calculates the amount from database prices, records a payment attempt, and initializes a Paystack transaction. On return, the `verify-paystack-payment` Edge Function verifies the transaction directly with Paystack. Only after verification does the database function (`place_paid_order`) perform these steps in one transaction:

1. Confirm the verified attempt belongs to the authenticated customer and the paid kobo amount matches the saved attempt.
2. Validate delivery information, cart contents and current stock.
3. Recompute prices and totals from database prices; reject a changed total.
4. Generate a unique order number and store the Paystack reference and paid status.
5. Create order-item records (preserving the price at purchase time).
6. Reduce stock and clear the customer's database cart.

Order creation is idempotent by payment reference. If a verified charge cannot be converted to an order due to changed cart or stock, the Edge Function attempts a refund; the cart is not cleared. After a successful order the app clears its local cart, calls `send-order-email`, and shows an explicit success page. The receipt is included in the email.

## 14. Email confirmation

Mailgun sends the email from a server-side Edge Function. The email contains: customer name, order number, order date, products, quantities, individual prices, subtotal, delivery fee, total and delivery address, styled in the Pearl Collections brand.

- The Mailgun API key is stored as an Edge Function secret, never in browser code.
- The function verifies the user's login and loads the order from the database rather than trusting the browser.
- Success or failure is recorded in `email_logs`. A failed email does **not** cancel the order and can be retried.
- During development use the Mailgun sandbox domain (authorised recipients only). Before launch, verify your own domain by adding the SPF and DKIM DNS records.

## 15. Database design (Supabase PostgreSQL)

| Table | Key fields |
|---|---|
| profiles | id (matches auth user), full_name, email, phone, avatar_url, created_at |
| products | id, name, description, price, category, gender, image_url, is_active, created_at, updated_at |
| product_variants | id, product_id, size, colour, stock_quantity |
| cart_items | id, user_id, product_id, variant_id, quantity |
| orders | id, user_id, order_number, subtotal, delivery_fee, total, status, delivery_address, city, state, country, phone, created_at |
| order_items | id, order_id, product_id, variant_id, product_name, quantity, unit_price, size, colour, subtotal |
| email_logs | id, order_id, status, error_message, attempted_at |

Notes: store money as whole numbers or `numeric`, never floating point. Order items keep the price at the time of purchase even if product prices change later.

**Order statuses:** Pending, Confirmed, Processing, Shipped, Delivered, Cancelled.

## 16. Security requirements

- Row Level Security is enabled on every table.
  - Products and variants: public read only.
  - Cart, orders, order items and profile: users can only access their own rows.
- Never expose the Supabase service-role key or Mailgun key in frontend code. Only the public anon key is used in the browser.
- Keep `.env` files out of GitHub.
- Validate checkout data on the client and on the server.
- Validate product availability on the server.
- Recompute prices on the server.

## 17. Responsive design and visual direction

Mobile-first. Important areas: navigation, product grid, product details, cart, checkout, confirmation.

**Design system**

- Palette: ivory `#FAF7F2`, charcoal `#1C1C1C`, warm grey `#8A8580`, pearl `#EDE8E0`, one accent (muted gold `#B08D57` or deep burgundy).
- Typography: elegant serif for headings (Cormorant Garamond or Playfair Display), clean sans for body (Inter or DM Sans).
- Spacing: multiples of 8px.
- Style: generous white space, thin borders, subtle shadows, small uppercase letter-spaced buttons, smooth 200–300ms transitions.
- Photography: consistent aspect ratio (3:4), compressed WebP, lazy loaded.
- Quality details: skeleton loaders, empty states, toasts, accessible focus states, alt text, favicon, page titles, meta descriptions.

## 18. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-001 | User can view homepage | Must |
| FR-002 | User can browse products | Must |
| FR-003 | User can search products | Should |
| FR-004 | User can filter products | Should |
| FR-005 | User can view product details | Must |
| FR-006 | User can select product variant | Must |
| FR-007 | User can add product to cart | Must |
| FR-008 | User can modify cart quantity | Must |
| FR-009 | User can remove cart item | Must |
| FR-010 | User can authenticate with Google | Must |
| FR-011 | User can access checkout | Must |
| FR-012 | User can submit delivery information | Must |
| FR-013 | Order is stored in database | Must |
| FR-014 | Order items are stored in database | Must |
| FR-015 | Cart is cleared after order | Must |
| FR-016 | Confirmation page is displayed | Must |
| FR-017 | Confirmation email is sent | Must |
| FR-018 | User can view previous orders | Should |
| FR-019 | Website is responsive | Must |
| FR-020 | Guest cart is merged into account cart after login | Should |
| FR-021 | Email failures are logged and retryable | Should |
| FR-022 | Legal pages are available | Must |
| FR-023 | Customer pays through Paystack and an order is created only after server verification | Must |

## 19. Non-functional requirements

**Performance:** fast loading, optimised images, minimal JavaScript, minimal database requests.
**Security:** protected authenticated data, secure authentication, protected API keys, database access policies.
**Usability:** clear navigation, clear error messages, loading states, success messages, works well on mobile.
**Accessibility:** good colour contrast, keyboard navigation, alt text.

## 20. Error handling

| Situation | Message |
|---|---|
| Product unavailable | "Sorry, this product is currently out of stock." |
| Invalid login | "We couldn't sign you in. Please try again." |
| Checkout failure | "We couldn't place your order. Please try again." |
| Email failure | Order is kept; failure is logged for retry |

## 21. Success criteria

The MVP is successful when a new customer can: visit the site, browse, open a product, select a size, add to cart, sign in with Google, enter delivery details, complete Paystack payment, see the verified order saved in Supabase, see an explicit order-success confirmation, receive the confirmation email, and see the order in My Orders. A failed or cancelled payment must leave the cart intact.

## 22. Development phases

| Phase | Focus | Key tasks |
|---|---|---|
| 0 | Setup | Install tools, create accounts, GitHub repo, Vite project, `.gitignore`, `.env` |
| 1 | Design foundations | Colours, fonts, spacing, CSS variables, logo |
| 2 | Pages and UI | Build all pages with sample data, responsive layout, mobile navigation |
| 3 | JavaScript | Product rendering, search, filters, cart context, quantity management |
| 4 | Supabase | Project, tables, RLS policies, `place_order` function, seed products, connect frontend |
| 5 | Authentication | Google Cloud project, consent screen, OAuth client, redirect URI, Supabase provider, login/logout, protected routes |
| 6 | Checkout and payment | Form validation, server-calculated Paystack initialization, payment verification, atomic order creation, cart clearing, confirmation |
| 7 | Mailgun | Sandbox, Edge Function, email template, logging, domain verification |
| 8 | My Account | Profile, order history, order details |
| 9 | Testing | Functional, UI, responsive, auth, cart, checkout, persistence, email, errors, security, Lighthouse |
| 10 | Deployment | Vercel, environment variables, production OAuth redirect, production email domain |
| 11 | Post-MVP | Wishlist, discount codes, additional payment providers, admin order page, status update emails |

## 23. Definition of done

A feature is complete when:

- It works as intended.
- It works on desktop and mobile.
- Data persists after refreshing the page.
- Appropriate error states exist.
- It has been manually tested.
- No sensitive credentials are exposed.
- Database security policies are configured where required.
- It does not break previously completed functionality.

## 24. Open decisions

- Final brand name styling and logo.
- Accent colour (gold or burgundy).
- Product categories and the first batch of products with photos.
- Delivery fee rule (flat vs by location).
- Sender domain for emails.
