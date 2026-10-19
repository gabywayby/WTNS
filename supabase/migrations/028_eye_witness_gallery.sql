-- Register the existing Eye Witness photos from product-photos in its gallery.
-- Front and back appear first, followed by the numbered campaign photos.
-- Run manually in the Supabase SQL editor after migration 027.
do $$
declare
  matching_photos integer;
begin
  select count(*) into matching_photos
  from storage.objects
  where bucket_id = 'product-photos'
    and lower(name) ~ '^eye-witness-(01|02|03|04|back|front)[.](jpg|jpeg|png|webp)$';

  if matching_photos < 6 then
    raise exception 'Expected all six Eye Witness photos in product-photos, found %', matching_photos;
  end if;
end;
$$;

insert into public.product_images (product_id, url, sort_order)
select p.id,
       'https://qoxuyspmxyzommttivvs.supabase.co/storage/v1/object/public/product-photos/' || o.name,
       case lower(o.name)
         when 'eye-witness-front.jpg' then 0
         when 'eye-witness-back.jpg' then 1
         when 'eye-witness-01.jpg' then 2
         when 'eye-witness-02.jpg' then 3
         when 'eye-witness-03.jpg' then 4
         when 'eye-witness-04.jpg' then 5
       end
from storage.objects o
join public.products p on p.slug = 'eye-witness'
where o.bucket_id = 'product-photos'
  and lower(o.name) ~ '^eye-witness-(01|02|03|04|back|front)[.](jpg|jpeg|png|webp)$'
  and not exists (
    select 1
    from public.product_images pi
    where pi.product_id = p.id
      and lower(pi.url) like '%/' || lower(o.name)
  );
