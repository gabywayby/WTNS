-- Persist which orders were placed during the pre-order window so the
-- approved size totals remain available after the window closes or dates
-- are later edited. Run manually after migration 025.
alter table public.orders
  add column if not exists is_preorder boolean not null default false;

-- Backfill using the saved window and each order's created_at timestamp.
update public.orders o
set is_preorder =
  (p.preorder_opens_at is null or o.created_at >= p.preorder_opens_at)
  and (p.preorder_closes_at is null or o.created_at < p.preorder_closes_at)
from public.products p
where p.id = o.product_id;

create or replace function public.wtns_mark_order_preorder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  opens_at timestamptz;
  closes_at timestamptz;
begin
  select preorder_opens_at, preorder_closes_at
    into opens_at, closes_at
    from public.products
    where id = new.product_id;

  new.is_preorder :=
    (opens_at is null or now() >= opens_at)
    and (closes_at is null or now() < closes_at);
  return new;
end;
$$;

drop trigger if exists wtns_mark_order_preorder on public.orders;
create trigger wtns_mark_order_preorder
before insert on public.orders
for each row execute function public.wtns_mark_order_preorder();
