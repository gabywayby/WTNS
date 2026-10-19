-- Run manually after migration 023. Migration 019 treated all active
-- post-deadline orders as already deducted
-- because migration 018 deducted stock during checkout. Migration 020 changed
-- checkout so only COD reserves stock there. Return stock for still-pending
-- GoTyme orders that were marked deducted by the old behavior.
do $$
declare
  order_row record;
begin
  for order_row in
    select o.id, o.product_id, o.variant_id, o.size, o.quantity
    from public.orders o
    join public.products p on p.id = o.product_id
    where o.payment_method = 'gotyme'
      and o.status = 'pending'
      and o.stock_deducted = true
      and p.preorder_closes_at is not null
      and o.created_at >= p.preorder_closes_at
    order by o.created_at, o.id
    for update of o
  loop
    if order_row.variant_id is not null then
      update public.variant_stock
        set stock = stock + order_row.quantity
        where variant_id = order_row.variant_id and size = order_row.size;
    else
      update public.product_sizes
        set stock = stock + order_row.quantity
        where product_id = order_row.product_id and size = order_row.size;
    end if;
    update public.orders set stock_deducted = false where id = order_row.id;
  end loop;
end;
$$;

-- Reserve post-preorder inventory for GoTyme only when an admin marks the
-- order Paid. The guarded inventory update and stock_deducted flag prevent
-- duplicate deductions. COD orders remain reserved by migration 020.
create or replace function public.wtns_sync_order_stock_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  closes_at timestamptz;
  remaining_stock integer;
begin
  select preorder_closes_at into closes_at
    from public.products where id = old.product_id;

  if old.status is distinct from 'paid'
     and new.status = 'paid'
     and old.payment_method = 'gotyme'
     and closes_at is not null
     and old.created_at >= closes_at
     and not old.stock_deducted then
    if old.variant_id is not null then
      update public.variant_stock
        set stock = stock - old.quantity
        where variant_id = old.variant_id
          and size = old.size
          and stock >= old.quantity
        returning stock into remaining_stock;
      if remaining_stock is null then
        raise exception 'Not enough stock for this shirt style and size';
      end if;
    else
      update public.product_sizes
        set stock = stock - old.quantity
        where product_id = old.product_id
          and size = old.size
          and stock >= old.quantity
        returning stock into remaining_stock;
      if remaining_stock is null then
        raise exception 'Not enough stock for this size';
      end if;
    end if;
    new.stock_deducted := true;
  end if;

  if old.status is distinct from 'cancelled'
     and new.status = 'cancelled'
     and old.stock_deducted then
    if old.variant_id is not null then
      update public.variant_stock
        set stock = stock + old.quantity
        where variant_id = old.variant_id and size = old.size;
    else
      update public.product_sizes
        set stock = stock + old.quantity
        where product_id = old.product_id and size = old.size;
    end if;
    new.stock_deducted := false;
  end if;

  return new;
end;
$$;

drop trigger if exists wtns_sync_order_stock_status on public.orders;
create trigger wtns_sync_order_stock_status
before update of status on public.orders
for each row execute function public.wtns_sync_order_stock_status();
