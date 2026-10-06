-- Enable the authenticated, no-online-payment order request flow used by the
-- mobile checkout. place_order validates the signed-in user, current cart,
-- product availability, stock, and delivery details before creating a
-- Pending order and clearing that user's shared cart.
alter table public.orders
  alter column payment_method set default 'Manual confirmation';

comment on column public.orders.payment_method is
  'Payment provider or manual confirmation method selected for this order.';

grant execute on function public.place_order(jsonb) to authenticated;
