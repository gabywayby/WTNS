-- Reserve stock for all orders placed after the pre-order window closes.
alter table public.store_settings
  add column if not exists hold_hours integer not null default 48
  check (hold_hours between 1 and 720);

alter table public.orders
  add column if not exists auto_cancelled boolean not null default false;

-- Keep the existing validation and order defaults. Post-preorder stock is now
-- reserved at checkout for both GoTyme and COD orders.
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
  closes_at timestamptz;
  remaining_stock integer;
begin
  if new.user_id is null or new.user_id <> auth.uid() then
    raise exception 'You must be signed in to order';
  end if;

  select status, preorder_opens_at, preorder_closes_at
    into product_status, opens_at, closes_at
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

    if closes_at is not null and now() >= closes_at then
      update public.variant_stock
        set stock = stock - new.quantity
        where variant_id = new.variant_id and size = new.size and stock >= new.quantity
        returning stock into remaining_stock;
      if remaining_stock is null then raise exception 'Not enough stock for this shirt style and size'; end if;
      new.stock_deducted := true;
    end if;
    new.variant_name := selected_name;
  else
    if new.variant_id is not null then raise exception 'Shirt style is not valid for this product'; end if;

    if not exists (select 1 from public.product_sizes where product_id = new.product_id and size = new.size) then
      raise exception 'Choose a valid size';
    end if;

    if closes_at is not null and now() >= closes_at then
      update public.product_sizes
        set stock = stock - new.quantity
        where product_id = new.product_id and size = new.size and stock >= new.quantity
        returning stock into remaining_stock;
      if remaining_stock is null then raise exception 'Not enough stock for this size'; end if;
      new.stock_deducted := true;
    end if;
    new.variant_name := null;
  end if;
  return new;
end;
$$;

create or replace function public.wtns_release_expired_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  configured_hold_hours integer;
  cancelled_count integer;
begin
  select hold_hours into configured_hold_hours
  from public.store_settings
  where singleton = true;

  if configured_hold_hours is null then
    return 0;
  end if;

  update public.orders
  set status = 'cancelled', auto_cancelled = true
  where status = 'pending'
    and payment_method = 'gotyme'
    and is_preorder = false
    and stock_deducted = true
    and created_at < now() - make_interval(hours => configured_hold_hours);

  get diagnostics cancelled_count = row_count;
  return cancelled_count;
end;
$$;

revoke all on function public.wtns_release_expired_orders() from public;
grant execute on function public.wtns_release_expired_orders() to authenticated;

-- select cron.schedule('wtns-release-orders', '0 * * * *', 'select public.wtns_release_expired_orders()');
