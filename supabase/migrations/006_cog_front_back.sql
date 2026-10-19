-- Make the named front/back photos available on the Child Of God product page
-- before pre-orders open, while keeping the rest of that gallery gated.
-- Run manually in the Supabase SQL editor after the existing migrations.

insert into public.product_images (product_id, url, sort_order)
select p.id,
       'https://qoxuyspmxyzommttivvs.supabase.co/storage/v1/object/public/product-photos/' || o.name,
       case when lower(o.name) like '%child-of-god-front.%' then 0 else 1 end
from storage.objects o
join public.products p on p.slug = 'child-of-god'
where o.bucket_id = 'product-photos'
  and lower(o.name) ~ '(^|/)child-of-god-(front|back)[.](jpg|jpeg|png|webp)$'
  and not exists (
    select 1 from public.product_images pi
    where pi.product_id = p.id
      and lower(pi.url) like '%' || lower(o.name)
  );

drop policy if exists "Released product photos are visible" on public.product_images;
create policy "Released product photos are visible" on public.product_images
for select to anon, authenticated using (
  public.is_admin() or exists (
    select 1 from public.products p where p.id = product_id
      and (
        p.status = 'sold_out'
        or p.preorder_opens_at is null
        or p.preorder_opens_at <= now()
        or (
          p.slug = 'child-of-god'
          and lower(url) ~ 'child-of-god-(front|back)[.](jpg|jpeg|png|webp)([?].*)?$'
        )
      )
  )
);
