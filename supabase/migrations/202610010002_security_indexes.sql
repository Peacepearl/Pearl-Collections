revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;

create index if not exists cart_items_variant_product_idx
  on public.cart_items (variant_id, product_id);
create index if not exists order_items_product_idx
  on public.order_items (product_id);
create index if not exists order_items_variant_idx
  on public.order_items (variant_id);