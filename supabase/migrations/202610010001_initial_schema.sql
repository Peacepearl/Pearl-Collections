create sequence if not exists public.order_number_seq;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price integer not null check (price >= 0),
  category text not null,
  gender text not null default 'Women',
  image_url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  size text,
  colour text,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  created_at timestamptz not null default now(),
  unique (id, product_id)
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null,
  variant_id uuid not null,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (user_id, variant_id),
  foreign key (variant_id, product_id) references public.product_variants (id, product_id) on delete cascade
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  customer_email text not null,
  order_number text not null unique,
  subtotal integer not null check (subtotal >= 0),
  delivery_fee integer not null check (delivery_fee >= 0),
  total integer not null check (total = subtotal + delivery_fee),
  status text not null default 'Pending' check (status in ('Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled')),
  full_name text not null,
  phone text not null,
  delivery_address text not null,
  city text not null,
  state text not null,
  country text not null,
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price >= 0),
  size text,
  colour text,
  subtotal integer not null check (subtotal = unit_price * quantity)
);

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  status text not null check (status in ('sent', 'failed')),
  error_message text,
  attempted_at timestamptz not null default now()
);

create index products_active_created_idx on public.products (is_active, created_at desc);
create index product_variants_product_idx on public.product_variants (product_id);
create index cart_items_user_idx on public.cart_items (user_id);
create index orders_user_created_idx on public.orders (user_id, created_at desc);
create index order_items_order_idx on public.order_items (order_id);
create index email_logs_order_attempted_idx on public.email_logs (order_id, attempted_at desc);

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.email_logs enable row level security;

create policy "Profiles are readable by their owner" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Profiles are editable by their owner" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Active products are public" on public.products
  for select to anon, authenticated using (is_active);
create policy "Active product variants are public" on public.product_variants
  for select to anon, authenticated using (
    exists (select 1 from public.products p where p.id = product_id and p.is_active)
  );

create policy "Cart items belong to their owner" on public.cart_items
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Orders are readable by their owner" on public.orders
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Order items are readable by their owner" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  );

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

create or replace function public.merge_guest_cart(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_variant_id uuid;
  v_product_id uuid;
  v_stock integer;
  v_quantity integer;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;
  perform 1 from public.profiles where id = v_user_id for update;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Cart items must be an array';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_variant_id := (v_item ->> 'variant_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity < 1 then raise exception 'Quantity must be positive'; end if;

    select pv.product_id, pv.stock_quantity into v_product_id, v_stock
    from public.product_variants pv
    join public.products p on p.id = pv.product_id and p.is_active
    where pv.id = v_variant_id
    for update of pv;
    if not found or v_stock < 1 then raise exception 'A selected item is unavailable'; end if;

    insert into public.cart_items (user_id, product_id, variant_id, quantity)
    values (v_user_id, v_product_id, v_variant_id, least(v_quantity, v_stock))
    on conflict (user_id, variant_id) do update
      set quantity = least(public.cart_items.quantity + excluded.quantity, v_stock);
  end loop;
end;
$$;

create or replace function public.save_cart(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_variant_id uuid;
  v_product_id uuid;
  v_stock integer;
  v_quantity integer;
begin
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Cart items must be an array'; end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'Cart contains too many items'; end if;

  perform 1 from public.profiles where id = v_user_id for update;
  delete from public.cart_items where user_id = v_user_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_variant_id := (v_item ->> 'variant_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity < 1 then raise exception 'Quantity must be positive'; end if;

    select pv.product_id, pv.stock_quantity into v_product_id, v_stock
    from public.product_variants pv
    join public.products p on p.id = pv.product_id and p.is_active
    where pv.id = v_variant_id
    for update of pv;
    if not found or v_stock < v_quantity then raise exception 'A selected item is unavailable or has insufficient stock'; end if;

    insert into public.cart_items (user_id, product_id, variant_id, quantity)
    values (v_user_id, v_product_id, v_variant_id, v_quantity);
  end loop;
end;
$$;

create or replace function public.place_order(p_delivery jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_cart record;
  v_order_id uuid;
  v_order_number text;
  v_subtotal integer := 0;
  -- Keep in sync with src/lib/config.ts; the database value is authoritative.
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
  if v_user_id is null then raise exception 'Authentication is required'; end if;
  perform 1 from public.profiles where id = v_user_id for update;

  v_full_name := nullif(trim(p_delivery ->> 'full_name'), '');
  v_phone := nullif(trim(p_delivery ->> 'phone'), '');
  v_address := nullif(trim(p_delivery ->> 'address'), '');
  v_city := nullif(trim(p_delivery ->> 'city'), '');
  v_state := nullif(trim(p_delivery ->> 'state'), '');
  v_country := nullif(trim(p_delivery ->> 'country'), '');
  if v_full_name is null or v_phone is null or v_address is null or v_city is null or v_state is null or v_country is null then
    raise exception 'Complete all delivery details';
  end if;

  select u.email into v_email from auth.users u where u.id = v_user_id;
  if v_email is null then raise exception 'A valid customer email is required'; end if;

  for v_cart in
    select ci.variant_id, ci.product_id, ci.quantity, p.name, p.price, pv.size, pv.colour, pv.stock_quantity
    from public.cart_items ci
    join public.products p on p.id = ci.product_id and p.is_active
    join public.product_variants pv on pv.id = ci.variant_id and pv.product_id = ci.product_id
    where ci.user_id = v_user_id
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
  v_order_id := gen_random_uuid();
  v_order_number := 'PC-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 6, '0');

  insert into public.orders (id, user_id, customer_email, order_number, subtotal, delivery_fee, total, full_name, phone, delivery_address, city, state, country)
  values (v_order_id, v_user_id, v_email, v_order_number, v_subtotal, v_delivery_fee, v_total, v_full_name, v_phone, v_address, v_city, v_state, v_country);

  for v_cart in
    select ci.variant_id, ci.product_id, ci.quantity, p.name, p.price, pv.size, pv.colour
    from public.cart_items ci
    join public.products p on p.id = ci.product_id and p.is_active
    join public.product_variants pv on pv.id = ci.variant_id and pv.product_id = ci.product_id
    where ci.user_id = v_user_id
    order by ci.variant_id
  loop
    update public.product_variants
      set stock_quantity = stock_quantity - v_cart.quantity
      where id = v_cart.variant_id and stock_quantity >= v_cart.quantity;
    if not found then raise exception 'An item in your bag no longer has enough stock'; end if;

    insert into public.order_items (order_id, product_id, variant_id, product_name, quantity, unit_price, size, colour, subtotal)
    values (v_order_id, v_cart.product_id, v_cart.variant_id, v_cart.name, v_cart.quantity, v_cart.price, v_cart.size, v_cart.colour, v_cart.price * v_cart.quantity);
  end loop;

  delete from public.cart_items where user_id = v_user_id;
  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
end;
$$;

create or replace function public.get_order_email_status(p_order_number text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_email_status text;
begin
  if v_user_id is null then raise exception 'Authentication is required'; end if;

  select o.id, latest.status into v_order_id, v_email_status
  from public.orders o
  left join lateral (
    select el.status
    from public.email_logs el
    where el.order_id = o.id
    order by el.attempted_at desc, el.id desc
    limit 1
  ) latest on true
  where o.order_number = p_order_number and o.user_id = v_user_id;

  if not found then return null; end if;
  return jsonb_build_object('order_id', v_order_id, 'email_status', v_email_status);
end;
$$;

revoke all on function public.merge_guest_cart(jsonb) from public, anon;
grant execute on function public.merge_guest_cart(jsonb) to authenticated;
revoke all on function public.save_cart(jsonb) from public, anon;
grant execute on function public.save_cart(jsonb) to authenticated;
revoke all on function public.place_order(jsonb) from public, anon;
grant execute on function public.place_order(jsonb) to authenticated;
revoke all on function public.get_order_email_status(text) from public, anon;
grant execute on function public.get_order_email_status(text) to authenticated;

grant select on public.products, public.product_variants to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.cart_items to authenticated;
grant select on public.orders, public.order_items to authenticated;
grant insert on public.email_logs to service_role;