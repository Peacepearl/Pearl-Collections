# Database and Security

Supabase PostgreSQL is the source of truth for customer profiles, product variants and stock, authenticated carts, payment attempts, and paid orders. Versioned Supabase migrations are authoritative for exact types, constraints, and policies.

## Planned Tables

| Table | Purpose and key data |
|---|---|
| `profiles` | Auth-linked profile: user ID, full name, email, phone, avatar URL, creation time. |
| `products` | Catalog product: name, description, price, category, gender, image, active flag, timestamps. |
| `product_variants` | Product option and inventory: product ID, size, colour, stock quantity. |
| `cart_items` | Authenticated user's selected product variant and quantity. |
| `orders` | Customer, unique order number, monetary totals, status, delivery details, Paystack reference and payment status. |
| `order_items` | Purchase-time product/variant details, quantity, unit price, and line subtotal. |
| `email_logs` | Email attempt status, associated order, error details, and attempt time. |
| `payment_attempts` | Authenticated customer, Paystack reference, expected kobo amount, delivery snapshot, status and linked order. Server-only access. |

Use foreign keys for relationships and checks for valid quantities and nonnegative monetary/stock values. Define uniqueness for order numbers and for cart rows according to the chosen variant/cart model. Decide how nullable sizes or colours are represented before finalizing constraints.

## Money and Order Snapshots

- Never use floating-point columns for money.
- Choose either whole minor units or PostgreSQL `numeric`, document units, and use the same representation in SQL, API responses, and UI formatting.
- Recompute order totals from current database prices at order time; never accept client totals as authoritative.
- Store product name, variant description, and unit price on each order item so historical receipts remain accurate after catalog changes.
- Keep the delivery fee in trusted configuration and persist the applied fee on the order.

## Cart Functions

- `merge_guest_cart(p_items)` validates guest items and merges them with existing account rows, clamping quantities to current stock.
- `save_cart(p_items)` replaces the authenticated user's cart after validating active variants, positive quantities, and stock. It locks the profile row so cart changes serialize with order placement.
- `prepare_paystack_attempt(p_user_id, p_items, p_delivery, p_expected_total)` is service-role-only. It validates the exact checkout snapshot against current products/stock, rejects a total mismatch, replaces stale saved cart rows with the visible checkout lines, computes the amount in kobo, and creates the payment attempt atomically.
- The browser has read access to its own cart but no direct write grants; use these functions for cart mutations.

## Paystack and Transactional Order Creation

`initialize-paystack` sends the visible cart snapshot and displayed total. `prepare_paystack_attempt` reconciles it with current catalog prices and stock, removing any stale rows that were not in checkout. It rejects the payment if the server-calculated total differs from the displayed total. The initializer then calls Paystack with a server-side secret and `bearer: account`, so the shop, not the customer, pays Paystack transaction fees. Paystack amounts use kobo (`NGN amount × 100`).

`verify-paystack-payment` checks transaction status, customer, reference, currency and exact amount directly with Paystack. It then calls `place_paid_order` using the Edge Function service role. The database function is not executable by browser roles and performs all of the following atomically:

1. Confirm the payment attempt belongs to the user and has not expired or been processed.
2. Load and validate the saved cart, active products, variants, quantities and stock.
3. Recompute the total and compare it to the verified Paystack kobo amount.
4. Generate a unique order number, store the payment reference and paid status, create item snapshots, and decrement inventory.
5. Clear the database cart only after all preceding operations succeed.

The unique payment reference makes order creation idempotent. If a captured payment cannot be committed because the cart or stock changed, the verifier attempts a Paystack refund. The client cart is cleared only after the verified order is returned successfully.

The function locks the authenticated user's profile while inspecting and consuming their cart. Cart synchronization, guest merge, and paid order placement use the same lock so a queued cart update cannot race an order.

## Email Status and Retry

The Edge Function writes attempt status to `email_logs` using its server-side service role. Do not grant customers direct access to that table. `get_order_email_status(p_order_number)` returns the order ID and latest email status only when the caller owns that order; the confirmation page uses it to preserve retry behavior after refresh.

## Row Level Security

- Enable RLS on every table exposed through the Supabase API.
- Products and variants: anonymous and authenticated users may read only active catalog data; writes are not public.
- Profiles, cart items, orders, and order items: users may read or change only rows belonging to their authenticated identity, with writes further limited to appropriate operations.
- Email logs: do not expose provider errors or logs to arbitrary users. Grant access only through an explicitly authorized server-side path.
- Review policies for joins and nested reads as well as direct table access. Test with anonymous, owner, and different-user sessions.

## Auth Profile Creation

Create a profile when a Supabase Auth user is first created. Treat provider name, email, and avatar as potentially missing or changeable; avoid making optional OAuth metadata a required database field.

## Migration Checklist

- Apply migrations to a clean development database.
- Verify constraints, indexes, triggers, and RLS policies are included in version control.
- Test that a failed order function leaves stock, order tables, and cart unchanged.
- Test unauthorized reads and writes with multiple users.
- Keep sample data out of production migrations or production seed runs.