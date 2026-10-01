-- Development catalog only. Do not run this seed against production.
insert into public.products (id, name, description, price, category, gender, image_url, is_active) values
  ('10000000-0000-4000-8000-000000000001', 'The Linen Set', 'An easy, considered two-piece in breathable natural linen. Made for warm afternoons and plans that run late.', 68500, 'Clothing', 'Women', 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=900&q=85', true),
  ('10000000-0000-4000-8000-000000000002', 'Sculpted Shoulder Bag', 'A softly structured everyday bag with a generous interior and an adjustable strap.', 52000, 'Accessories', 'Women', 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=85', true),
  ('10000000-0000-4000-8000-000000000003', 'Sunday Slip Dress', 'A fluid midi silhouette with delicate straps and a quietly luminous finish.', 74000, 'Clothing', 'Women', 'https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=900&q=85', true),
  ('10000000-0000-4000-8000-000000000004', 'Soft Form Earrings', 'Light-catching sculptural hoops, finished by hand for everyday wear.', 28500, 'Jewellery', 'Women', 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=900&q=85', true),
  ('10000000-0000-4000-8000-000000000005', 'Fine Rib Knit', 'A soft, close-fitting knit designed to layer or stand on its own.', 39000, 'Clothing', 'Women', 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=900&q=85', true),
  ('10000000-0000-4000-8000-000000000006', 'Woven Evening Clutch', 'A tactile woven clutch that takes the simplest look into the evening.', 46000, 'Accessories', 'Women', 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=85', true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  category = excluded.category,
  gender = excluded.gender,
  image_url = excluded.image_url,
  is_active = excluded.is_active;

insert into public.product_variants (id, product_id, size, colour, stock_quantity) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'S', 'Oat', 8),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'M', 'Oat', 5),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'L', 'Oat', 3),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'One size', 'Espresso', 9),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000003', 'S', 'Deep olive', 3),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000003', 'M', 'Deep olive', 6),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000003', 'L', 'Deep olive', 4),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000004', 'One size', 'Gold', 12),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000005', 'S', 'Ivory', 7),
  ('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000005', 'M', 'Ivory', 7),
  ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000005', 'L', 'Ivory', 2),
  ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000006', 'One size', 'Natural', 5)
on conflict (id) do update set
  stock_quantity = excluded.stock_quantity;