-- Remove Child Of God gallery rows that point to deleted/missing objects.
-- Run manually in the Supabase SQL editor after migration 009.
delete from public.product_images pi
using public.products p
where p.id = pi.product_id
  and p.slug = 'child-of-god'
  and pi.url like 'https://qoxuyspmxyzommttivvs.supabase.co/storage/v1/object/public/product-photos/%'
  and not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'product-photos'
      and o.name = split_part(
        split_part(pi.url, '/product-photos/', 2),
        '?',
        1
      )
  );
