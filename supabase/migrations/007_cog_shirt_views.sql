-- Register the four Child Of God variant photos and expose these views before
-- pre-orders open. The rest of the photo gallery stays gated until release.
-- Run manually in the Supabase SQL editor after migration 006.

insert into public.product_images (product_id, url, sort_order)
select p.id,
       'https://qoxuyspmxyzommttivvs.supabase.co/storage/v1/object/public/product-photos/' || o.name,
       case
         when lower(o.name) ~ 'child-of-god-front-standard[.]' then 0
         when lower(o.name) ~ 'child-of-god-back-standard[.]' then 1
         when lower(o.name) ~ 'child-of-god-front-heavy[.]' then 2
         else 3
       end
from storage.objects o
join public.products p on p.slug = 'child-of-god'
where o.bucket_id = 'product-photos'
  and lower(o.name) ~ '(^|/)child-of-god-(front|back)-(standard|heavy)[.](jpg|jpeg|png|webp)$'
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
          and lower(url) ~ 'child-of-god-(front|back)-(standard|heavy)[.](jpg|jpeg|png|webp)([?].*)?$'
        )
      )
  )
);
