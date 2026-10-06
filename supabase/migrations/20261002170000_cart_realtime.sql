-- Include the owning user_id in change events so Realtime filters can also
-- deliver cart removals to that user's other signed-in devices.
alter table public.cart_items replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'cart_items'
    ) then
    alter publication supabase_realtime add table public.cart_items;
  end if;
end;
$$;
