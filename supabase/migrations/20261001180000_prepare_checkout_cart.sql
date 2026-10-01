create or replace function public.prepare_paystack_attempt(
  p_user_id uuid,
  p_items jsonb,
  p_delivery jsonb,
  p_expected_total integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_variant_id uuid;
  v_product_id uuid;
  v_quantity integer;
  v_stock integer;
  v_price integer;
  v_subtotal bigint := 0;
  v_total integer;
  v_delivery_fee integer := 5000;
  v_reference text;
  v_attempt_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the payment function can prepare checkout';
  end if;
  if p_user_id is null then raise exception 'Customer is required'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your bag is empty';
  end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'Your bag has too many items'; end if;
  if p_expected_total is null or p_expected_total < 1 then raise exception 'Checkout total is invalid'; end if;
  if p_delivery is null or jsonb_typeof(p_delivery) <> 'object' then raise exception 'Delivery details are required'; end if;
  if nullif(trim(p_delivery ->> 'full_name'), '') is null
    or nullif(trim(p_delivery ->> 'phone'), '') is null
    or nullif(trim(p_delivery ->> 'address'), '') is null
    or nullif(trim(p_delivery ->> 'city'), '') is null
    or nullif(trim(p_delivery ->> 'state'), '') is null
    or nullif(trim(p_delivery ->> 'country'), '') is null then
    raise exception 'Complete all delivery details';
  end if;
  if jsonb_array_length(p_items) <> (
    select count(distinct item ->> 'variant_id')
    from jsonb_array_elements(p_items) as entries(item)
  ) then
    raise exception 'Your bag contains duplicate variants; refresh checkout and try again';
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Customer profile was not found'; end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
    order by value ->> 'variant_id'
  loop
    v_variant_id := (v_item ->> 'variant_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity < 1 then raise exception 'Item quantity must be positive'; end if;

    select pv.product_id, pv.stock_quantity, p.price
      into v_product_id, v_stock, v_price
    from public.product_variants pv
    join public.products p on p.id = pv.product_id and p.is_active
    where pv.id = v_variant_id
    for update of pv, p;

    if not found then raise exception 'An item in your bag is no longer available'; end if;
    if v_quantity > v_stock then raise exception 'An item in your bag no longer has enough stock'; end if;
    v_subtotal := v_subtotal + v_price::bigint * v_quantity;
  end loop;

  if v_subtotal > 2147483647 - v_delivery_fee then raise exception 'Checkout total exceeds the supported amount'; end if;
  v_total := v_subtotal::integer + v_delivery_fee;
  if v_total <> p_expected_total then raise exception 'Cart prices changed; review the updated checkout total'; end if;

  delete from public.cart_items where user_id = p_user_id;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_variant_id := (v_item ->> 'variant_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;
    select pv.product_id into v_product_id from public.product_variants pv where pv.id = v_variant_id;
    insert into public.cart_items (user_id, product_id, variant_id, quantity)
    values (p_user_id, v_product_id, v_variant_id, v_quantity);
  end loop;

  v_reference := 'PC-' || gen_random_uuid()::text;
  insert into public.payment_attempts (user_id, reference, amount_kobo, delivery, status)
  values (p_user_id, v_reference, v_total::bigint * 100, p_delivery, 'initializing')
  returning id into v_attempt_id;

  return jsonb_build_object(
    'attempt_id', v_attempt_id,
    'reference', v_reference,
    'amount_kobo', v_total::bigint * 100,
    'total', v_total
  );
end;
$$;

revoke all on function public.prepare_paystack_attempt(uuid, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.prepare_paystack_attempt(uuid, jsonb, jsonb, integer) to service_role;