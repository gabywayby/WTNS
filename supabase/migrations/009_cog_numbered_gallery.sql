-- Register the numbered Child Of God campaign photos in the product gallery.
-- Run manually in the Supabase SQL editor after migration 008.
-- These rows stay hidden by the product_images RLS policy until pre-orders open.
insert into public.product_images (product_id, url, sort_order)
select p.id,
       'https://qoxuyspmxyzommttivvs.supabase.co/storage/v1/object/public/product-photos/' || o.name,
       100 + substring(lower(o.name) from 'child-of-god-([0-9]+)[.]')::integer
from storage.objects o
join public.products p on p.slug = 'child-of-god'
where o.bucket_id = 'product-photos'
  and lower(o.name) ~ '^child-of-god-[0-9]+[.](jpg|jpeg|png|webp)$'
  and not exists (
    select 1
    from public.product_images pi
    where pi.product_id = p.id
      and lower(pi.url) like '%/' || lower(o.name)
  );
