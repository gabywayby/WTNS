-- Restore a previously deducted order's stock when its status returns to
-- Pending. Marking it Paid again deducts the units once more.
-- Run manually after migrations 023 and 024.
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

  -- A post-preorder order consumes stock when it becomes Paid. COD may
  -- already have reserved its stock at checkout; stock_deducted prevents a
  -- second deduction in that case.
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

  -- Returning any deducted order to Pending releases its inventory. This
  -- lets an admin correct a status and later mark the order Paid again.
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

  -- Cancellation also releases deducted stock exactly once.
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
