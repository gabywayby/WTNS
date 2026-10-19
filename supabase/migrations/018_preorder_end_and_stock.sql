-- Add a Manila-time pre-order deadline. Before it ends, orders record demand
-- without reserving stock. After it ends, orders use available inventory.
alter table public.products
  add column if not exists preorder_closes_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_preorder_window_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_preorder_window_check
      check (preorder_closes_at is null or preorder_opens_at is null or preorder_closes_at > preorder_opens_at);
  end if;
end;
$$;

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
  preorder_mode boolean;
  available_stock integer;
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
  preorder_mode := closes_at is null or now() < closes_at;

  new.status := 'pending';
  new.customer_email := auth.jwt() ->> 'email';
  new.created_at := now();

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

    if preorder_mode then
      if not exists (select 1 from public.variant_stock where variant_id = new.variant_id and size = new.size) then
        raise exception 'Choose a valid size';
      end if;
    else
      update public.variant_stock
        set stock = stock - new.quantity
        where variant_id = new.variant_id and size = new.size and stock >= new.quantity
        returning stock into available_stock;
      if available_stock is null then raise exception 'Not enough stock for this shirt style and size'; end if;
    end if;
    new.variant_name := selected_name;
  else
    if new.variant_id is not null then raise exception 'Shirt style is not valid for this product'; end if;

    if preorder_mode then
      if not exists (select 1 from public.product_sizes where product_id = new.product_id and size = new.size) then
        raise exception 'Choose a valid size';
      end if;
    else
      update public.product_sizes
        set stock = stock - new.quantity
        where product_id = new.product_id and size = new.size and stock >= new.quantity
        returning stock into available_stock;
      if available_stock is null then raise exception 'Not enough stock for this size'; end if;
    end if;
    new.variant_name := null;
  end if;
  return new;
end;
$$;

-- Return inventory only when cancelling an order that was placed after the
-- pre-order window, when inventory deductions are active.
create or replace function public.wtns_restore_post_preorder_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  closes_at timestamptz;
begin
  if old.status is distinct from 'cancelled' and new.status = 'cancelled' then
    select preorder_closes_at into closes_at
      from public.products where id = old.product_id;
    if closes_at is not null and old.created_at >= closes_at then
      if old.variant_id is not null then
        update public.variant_stock
          set stock = stock + old.quantity
          where variant_id = old.variant_id and size = old.size;
      else
        update public.product_sizes
          set stock = stock + old.quantity
          where product_id = old.product_id and size = old.size;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists wtns_restore_cancelled_stock on public.orders;
create trigger wtns_restore_cancelled_stock
after update of status on public.orders
for each row execute function public.wtns_restore_post_preorder_stock();
