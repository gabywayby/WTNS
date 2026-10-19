-- Set the Child Of God homepage teaser to the requested Storage image.
-- Run manually in the Supabase SQL editor after migration 010.
update public.products
set teaser_image_url = 'https://qoxuyspmxyzommttivvs.supabase.co/storage/v1/object/public/product-photos/child-of-god-03.jpg'
where slug = 'child-of-god';
