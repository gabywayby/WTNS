-- Add structured image labels for shirt style and view. Run after migration 007.
alter table public.product_images
  add column if not exists shirt_style text,
  add column if not exists view text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'product_images_view_check'
      and conrelid = 'public.product_images'::regclass
  ) then
    alter table public.product_images
      add constraint product_images_view_check check (view is null or view in ('front', 'back'));
  end if;
end;
$$;

-- Backfill the legacy generic front/back names as views and the newer
-- standard/heavy names as both a view and the exact variant name in the DB.
update public.product_images pi
set view = case
      when lower(pi.url) ~ 'child-of-god-front([.]|-(standard|heavy)[.])' then 'front'
      when lower(pi.url) ~ 'child-of-god-back([.]|-(standard|heavy)[.])' then 'back'
      else pi.view
    end,
    shirt_style = case
      when lower(pi.url) ~ 'child-of-god-(front|back)-standard[.]' then (
        select pv.name from public.product_variants pv
        where pv.product_id = pi.product_id and lower(pv.name) like '%standard%'
        order by pv.name limit 1
      )
      when lower(pi.url) ~ 'child-of-god-(front|back)-heavy[.]' then (
        select pv.name from public.product_variants pv
        where pv.product_id = pi.product_id and lower(pv.name) like '%heavy%'
        order by pv.name limit 1
      )
      else pi.shirt_style
    end
from public.products p
where p.id = pi.product_id
  and p.slug = 'child-of-god'
  and lower(pi.url) ~ 'child-of-god-(front|back)(-(standard|heavy))?[.](jpg|jpeg|png|webp)([?].*)?$';

drop policy if exists "Released product photos are visible" on public.product_images;
create policy "Released product photos are visible" on public.product_images
for select to anon, authenticated using (
  public.is_admin() or exists (
    select 1 from public.products p where p.id = product_id
      and (
        p.status = 'sold_out'
        or p.preorder_opens_at is null
        or p.preorder_opens_at <= now()
        or (p.slug = 'child-of-god' and shirt_style is not null and view is not null)
      )
  )
);
