-- Use Eye Witness photo 01 as its public teaser and lead gallery image.
-- Remove the starter placeholder row left by migration 002.
-- Run manually after migration 028.
do $$
declare
  teaser_file text;
begin
  select name into teaser_file
  from storage.objects
  where bucket_id = 'product-photos'
    and lower(name) ~ '^eye-witness-01[.](jpg|jpeg|png|webp)$'
  limit 1;

  if teaser_file is null then
    raise exception 'eye-witness-01 was not found in the product-photos bucket';
  end if;

  update public.products
  set teaser_image_url = 'https://qoxuyspmxyzommttivvs.supabase.co/storage/v1/object/public/product-photos/' || teaser_file
  where slug = 'eye-witness';

  delete from public.product_images pi
  using public.products p
  where p.id = pi.product_id
    and p.slug = 'eye-witness'
    and pi.url like 'https://placehold.co/%';

  update public.product_images pi
  set sort_order = case
    when lower(o.name) ~ '^eye-witness-01[.]' then 0
    when lower(o.name) ~ '^eye-witness-front[.]' then 1
    when lower(o.name) ~ '^eye-witness-back[.]' then 2
    when lower(o.name) ~ '^eye-witness-02[.]' then 3
    when lower(o.name) ~ '^eye-witness-03[.]' then 4
    when lower(o.name) ~ '^eye-witness-04[.]' then 5
    else pi.sort_order
  end
  from storage.objects o
  where pi.product_id = (select id from public.products where slug = 'eye-witness')
    and o.bucket_id = 'product-photos'
    and pi.url = 'https://qoxuyspmxyzommttivvs.supabase.co/storage/v1/object/public/product-photos/' || o.name
    and lower(o.name) ~ '^eye-witness-(01|02|03|04|front|back)[.](jpg|jpeg|png|webp)$';
end;
$$;
