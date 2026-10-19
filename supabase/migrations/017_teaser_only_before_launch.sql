-- Before the Child Of God pre-order opens, the public can see only its teaser.
-- All gallery images become visible once the product is available and the
-- opening time has passed. Sold out products remain visible as archive items.
drop policy if exists "Released product photos are visible" on public.product_images;
create policy "Released product photos are visible" on public.product_images
for select to anon, authenticated using (
  public.is_admin() or exists (
    select 1 from public.products p
    where p.id = product_id
      and (p.status = 'sold_out'
           or (p.status = 'available' and (p.preorder_opens_at is null or p.preorder_opens_at <= now())))
  )
);

-- Set child-of-god-11 as the teaser using the actual Storage extension, and
-- remove any gallery row for it so it is not repeated after launch.
do $$
declare f text;
begin
  select o.name into f from storage.objects o
  where o.bucket_id = 'product-photos' and lower(o.name) ~ '^child-of-god-11[.](jpg|jpeg|png|webp)$'
  limit 1;
  if f is null then raise exception 'child-of-god-11 was not found in the product-photos bucket'; end if;
  update public.products
    set teaser_image_url = 'https://qoxuyspmxyzommttivvs.supabase.co/storage/v1/object/public/product-photos/' || f
    where slug = 'child-of-god';
  delete from public.product_images pi using public.products p
    where p.slug = 'child-of-god' and pi.product_id = p.id
      and lower(pi.url) ~ 'child-of-god-11[.](jpg|jpeg|png|webp)([?].*)?$';
end $$;
