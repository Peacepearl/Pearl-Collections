alter table public.orders
  add column payment_method text not null default 'Unspecified',
  add column payment_reference text unique,
  add column payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'refunded'));

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reference text not null unique,
  amount_kobo bigint not null check (amount_kobo > 0),
  delivery jsonb not null,
  status text not null default 'initializing'
    check (status in ('initializing', 'initialized', 'paid', 'failed', 'refund_pending', 'refunded')),
  order_id uuid references public.orders (id) on delete set null,
  failure_reason text,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create index payment_attempts_user_created_idx on public.payment_attempts (user_id, created_at desc);
alter table public.payment_attempts enable row level security;

create or replace function public.place_paid_order(
  p_user_id uuid,
  p_reference text,
  p_paid_amount_kobo bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.payment_attempts%rowtype;
  v_cart record;
  v_order_id uuid;
  v_order_number text;
  v_subtotal integer := 0;
  v_delivery_fee integer := 5000;
  v_total integer;
  v_email text;
  v_full_name text;
  v_phone text;
  v_address text;
  v_city text;
  v_state text;
  v_country text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the verified payment function can create a paid order';
  end if;
  if p_user_id is null or nullif(trim(p_reference), '') is null then
    raise exception 'Payment reference and customer are required';
  end if;

  select * into v_attempt
  from public.payment_attempts
  where reference = p_reference
  for update;

  if not found or v_attempt.user_id <> p_user_id then
    raise exception 'Payment attempt was not found for this customer';
  end if;

  if v_attempt.status = 'paid' and v_attempt.order_id is not null then
    select o.id, o.order_number into v_order_id, v_order_number
    from public.orders o where o.id = v_attempt.order_id;
    return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'already_processed', true);
  end if;
  if v_attempt.status <> 'initialized' or v_attempt.created_at < now() - interval '1 day' then
    raise exception 'Payment attempt is not active';
  end if;
  if p_paid_amount_kobo <> v_attempt.amount_kobo then
    raise exception 'Verified Paystack amount does not match this payment attempt';
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  v_full_name := nullif(trim(v_attempt.delivery ->> 'full_name'), '');
  v_phone := nullif(trim(v_attempt.delivery ->> 'phone'), '');
  v_address := nullif(trim(v_attempt.delivery ->> 'address'), '');
  v_city := nullif(trim(v_attempt.delivery ->> 'city'), '');
  v_state := nullif(trim(v_attempt.delivery ->> 'state'), '');
  v_country := nullif(trim(v_attempt.delivery ->> 'country'), '');
  if v_full_name is null or v_phone is null or v_address is null or v_city is null or v_state is null or v_country is null then
    raise exception 'Complete all delivery details';
  end if;

  select u.email into v_email from auth.users u where u.id = p_user_id;
  if v_email is null then raise exception 'A valid customer email is required'; end if;

  for v_cart in
    select ci.variant_id, ci.product_id, ci.quantity, p.name, p.price, pv.size, pv.colour, pv.stock_quantity
    from public.cart_items ci
    join public.products p on p.id = ci.product_id and p.is_active
    join public.product_variants pv on pv.id = ci.variant_id and pv.product_id = ci.product_id
    where ci.user_id = p_user_id
    order by ci.variant_id
    for update of ci, pv
  loop
    if v_cart.quantity < 1 or v_cart.stock_quantity < v_cart.quantity then
      raise exception 'An item in your bag no longer has enough stock';
    end if;
    v_subtotal := v_subtotal + v_cart.price * v_cart.quantity;
  end loop;

  if v_subtotal = 0 then raise exception 'Your bag is empty or unavailable'; end if;
  v_total := v_subtotal + v_delivery_fee;
  if v_total::bigint * 100 <> v_attempt.amount_kobo then
    raise exception 'The cart total changed during payment';
  end if;

  v_order_id := gen_random_uuid();
  v_order_number := 'PC-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 6, '0');

  insert into public.orders (
    id, user_id, customer_email, order_number, subtotal, delivery_fee, total, status,
    full_name, phone, delivery_address, city, state, country,
    payment_method, payment_reference, payment_status
  ) values (
    v_order_id, p_user_id, v_email, v_order_number, v_subtotal, v_delivery_fee, v_total, 'Confirmed',
    v_full_name, v_phone, v_address, v_city, v_state, v_country,
    'Paystack', p_reference, 'paid'
  );

  for v_cart in
    select ci.variant_id, ci.product_id, ci.quantity, p.name, p.price, pv.size, pv.colour
    from public.cart_items ci
    join public.products p on p.id = ci.product_id and p.is_active
    join public.product_variants pv on pv.id = ci.variant_id and pv.product_id = ci.product_id
    where ci.user_id = p_user_id
    order by ci.variant_id
  loop
    update public.product_variants
      set stock_quantity = stock_quantity - v_cart.quantity
      where id = v_cart.variant_id and stock_quantity >= v_cart.quantity;
    if not found then raise exception 'An item in your bag no longer has enough stock'; end if;

    insert into public.order_items (order_id, product_id, variant_id, product_name, quantity, unit_price, size, colour, subtotal)
    values (v_order_id, v_cart.product_id, v_cart.variant_id, v_cart.name, v_cart.quantity, v_cart.price, v_cart.size, v_cart.colour, v_cart.price * v_cart.quantity);
  end loop;

  delete from public.cart_items where user_id = p_user_id;
  update public.payment_attempts set status = 'paid', order_id = v_order_id, verified_at = now()
  where id = v_attempt.id;

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'already_processed', false);
end;
$$;

revoke all on function public.place_order(jsonb) from public, anon, authenticated;
revoke all on function public.place_paid_order(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.place_paid_order(uuid, text, bigint) to service_role;