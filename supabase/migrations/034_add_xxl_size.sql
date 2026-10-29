-- Add XXL as an available size without changing existing stock or order rules.
-- Start at zero; enter actual stock through the admin page.
insert into public.variant_stock (variant_id, size, stock)
select id, 'XXL', 0
from public.product_variants
on conflict (variant_id, size) do nothing;

insert into public.product_sizes (product_id, size, stock)
select p.id, 'XXL', 0
from public.products p
where not exists (
  select 1 from public.product_variants v where v.product_id = p.id
)
on conflict (product_id, size) do nothing;
