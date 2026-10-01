# Testing Plan

Use the PRD's success journey as the primary end-to-end acceptance test. Add automated tests as the app structure is established; until then, this checklist can guide manual verification. Test against development data and accounts, never real customer records.

## Catalog

- Home and Shop display active products and valid images.
- Search and category, size, price, gender, and availability filters work together.
- Product details show correct descriptions, variants, prices, and availability.
- Inactive, deleted, or unavailable products cannot be added to an order.

## Cart and Authentication

- Guest cart survives refresh and supports quantity changes and removal.
- Invalid quantities and unavailable variants are rejected or clearly resolved.
- Google sign-in, cancellation, sign-out, and session restoration behave correctly.
- Guest cart merge handles duplicate variants and current stock according to the chosen policy.
- Signed-in cart changes persist after refresh and the order button waits for cart synchronization.
- Protected routes return the user to the intended destination after sign-in.
- A user cannot read or modify another user's profile, cart, or orders.

## Checkout and Orders

- Required customer and delivery fields validate on client and trusted server/database paths.
- Displayed totals use the configured delivery fee and current catalog prices.
- Changing browser-submitted totals does not change the persisted order total.
- A price or stock change between cart and checkout is handled clearly.
- A failed order creates no partial data and does not clear the cart.
- Concurrent attempts to purchase the last unit do not oversell.
- Successful order items preserve purchase-time product and price information.
- Repeated clicks or network retries do not create unintended duplicate orders.
- Paystack receives the server-computed NGN amount in kobo; modified browser totals are ignored.
- The server reconciles the exact visible checkout lines; stale database cart rows do not increase the Paystack amount.
- Cancelled/failed payments leave both local and database carts intact.
- Successful verification creates one paid order, decrements stock, clears both carts, and shows the explicit success message.
- A repeated Paystack callback returns the same order without creating a duplicate or resending a successful receipt.
- If stock or totals change after payment, the order is not committed and the Edge Function requests a refund.

## Email

- Successful send contains the correct order number, items, quantities, totals, and delivery information.
- Provider failure is logged, does not remove the order, and can be retried without placing another order.
- Failed receipt status survives confirmation-page refresh and remains owner-only.
- The confirmation page distinguishes Mailgun API acceptance from verified inbox delivery and offers an owner-only resend with a one-minute cooldown.
- Unauthorized callers cannot request email for another customer's order.
- Provider credentials are absent from browser bundles, logs, and repository history.

## Responsive and Accessibility Checks

- Test Home, Shop, details, cart, checkout, confirmation, and account at narrow mobile and desktop widths.
- Verify keyboard navigation, visible focus, labels, error announcements, contrast, and useful image alt text.
- Check loading, empty, success, validation-error, network-error, and out-of-stock states.
- Check page titles, meta descriptions, image loading behavior, and not-found routing.

## Release Gate

- Clean install and production build succeed.
- Migrations apply to a clean database and RLS checks pass.
- OAuth redirect URLs and production environment values are verified.
- Mailgun domain and sender are verified for production.
- The complete PRD success journey passes on the deployed configuration.