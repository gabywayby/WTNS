-- Repair the two paid Standard S GoTyme orders shown with stock_deducted=false.
-- The admin inventory showed 9 remaining from an initial 10, but both paid
-- orders must consume one each. Run manually after migration 026.
do $$
declare
  standard_variant uuid;
  current_stock integer;
  repaired_orders integer;
begin
  select pv.id into standard_variant
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  where p.slug = 'child-of-god'
    and pv.name = 'Standard shirt';

  if standard_variant is null then
    raise exception 'Child Of God Standard shirt variant was not found';
  end if;

  select stock into current_stock
  from public.variant_stock
  where variant_id = standard_variant and size = 'S'
  for update;

  if current_stock is null or current_stock not in (8, 9) then
    raise exception 'Expected Child Of God Standard S stock to be 8 or 9, found %. Check inventory before repairing.', current_stock;
  end if;

  update public.variant_stock
  set stock = 8
  where variant_id = standard_variant and size = 'S';

  update public.orders
  set stock_deducted = true
  where id in (
    '986211ec-d285-4e44-ab2e-539c623c6f42',
    '1b9f312b-e811-417e-8e91-7c6c89870279'
  )
    and variant_id = standard_variant
    and size = 'S'
    and quantity = 1
    and payment_method = 'gotyme'
    and status = 'paid';

  get diagnostics repaired_orders = row_count;
  if repaired_orders <> 2 then
    raise exception 'Expected to repair 2 paid GoTyme orders, updated %. Check order records before retrying.', repaired_orders;
  end if;
end;
$$;

-- Ensure future status changes deduct on Paid and restore when reverted to
-- Pending or Cancelled. COD inventory already reserved at checkout is
-- protected by stock_deducted from a second deduction.
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

  if old.status is distinct from 'pending'
     and new.status = 'pending'
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
