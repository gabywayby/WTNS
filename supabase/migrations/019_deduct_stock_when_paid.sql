-- For regular orders placed after the pre-order closes, deduct stock only
-- when an admin confirms the order as paid. Pre-order demand never uses stock.
alter table public.orders
  add column if not exists stock_deducted boolean not null default false;

-- Migration 018 deducted stock at checkout. Record those existing deductions
-- so later cancellations can still return the stock exactly once.
update public.orders o
set stock_deducted = true
from public.products p
where p.id = o.product_id
  and p.preorder_closes_at is not null
  and o.created_at >= p.preorder_closes_at
  and o.status <> 'cancelled'
  and o.stock_deducted = false;

create or replace function public.wtns_order_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  selected_name text;
  current_shipping integer;
  product_status text;
  opens_at timestamptz;
begin
  if new.user_id is null or new.user_id <> auth.uid() then
    raise exception 'You must be signed in to order';
  end if;

  select status, preorder_opens_at
    into product_status, opens_at
    from public.products where id = new.product_id;
  if product_status is distinct from 'available'
     or (opens_at is not null and opens_at > now()) then
    raise exception 'Pre-orders are not open yet';
  end if;

  new.status := 'pending';
  new.customer_email := auth.jwt() ->> 'email';
  new.created_at := now();
  new.stock_deducted := false;

  select shipping_php into current_shipping
    from public.store_settings where singleton = true;
  if current_shipping is null then
    raise exception 'Store shipping settings are missing';
  end if;
  new.shipping_php := current_shipping;

  if exists (select 1 from public.product_variants where product_id = new.product_id) then
    select name into selected_name from public.product_variants
      where id = new.variant_id and product_id = new.product_id;
    if selected_name is null then raise exception 'Choose a valid shirt style'; end if;
    if not exists (select 1 from public.variant_stock where variant_id = new.variant_id and size = new.size) then
      raise exception 'Choose a valid size';
    end if;
    new.variant_name := selected_name;
  else
    if new.variant_id is not null then raise exception 'Shirt style is not valid for this product'; end if;
    if not exists (select 1 from public.product_sizes where product_id = new.product_id and size = new.size) then
      raise exception 'Choose a valid size';
    end if;
    new.variant_name := null;
  end if;
  return new;
end;
$$;

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

  -- A customer order created after the deadline consumes inventory only
  -- when the admin saves it as paid. The guarded UPDATE is atomic, so two
  -- admins cannot confirm the final item twice.
  if old.status is distinct from 'paid'
     and new.status = 'paid'
     and closes_at is not null
     and old.created_at >= closes_at
     and not old.stock_deducted then
    if old.variant_id is not null then
      update public.variant_stock
        set stock = stock - old.quantity
        where variant_id = old.variant_id and size = old.size and stock >= old.quantity
        returning stock into remaining_stock;
      if remaining_stock is null then
        raise exception 'Not enough stock for this shirt style and size';
      end if;
    else
      update public.product_sizes
        set stock = stock - old.quantity
        where product_id = old.product_id and size = old.size and stock >= old.quantity
        returning stock into remaining_stock;
      if remaining_stock is null then
        raise exception 'Not enough stock for this size';
      end if;
    end if;
    new.stock_deducted := true;
  end if;

  -- Return stock once if a post-deadline order that already consumed it is
  -- cancelled. This also works when the order was previously shipped.
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

drop trigger if exists wtns_restore_cancelled_stock on public.orders;
drop trigger if exists wtns_sync_order_stock_status on public.orders;
create trigger wtns_sync_order_stock_status
before update of status on public.orders
for each row execute function public.wtns_sync_order_stock_status();
