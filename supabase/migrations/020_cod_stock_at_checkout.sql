-- COD orders placed after the pre-order window reserve stock at checkout.
-- GoTyme orders continue to deduct stock when an admin marks them Paid.
-- Apply any COD orders created under migration 019 before this migration.
do $$
declare
  order_row record;
  remaining_stock integer;
begin
  for order_row in
    select o.id, o.product_id, o.variant_id, o.size, o.quantity
    from public.orders o
    join public.products p on p.id = o.product_id
    where o.payment_method = 'cod'
      and o.status <> 'cancelled'
      and o.stock_deducted = false
      and p.preorder_closes_at is not null
      and o.created_at >= p.preorder_closes_at
    order by o.created_at, o.id
    for update of o
  loop
    if order_row.variant_id is not null then
      update public.variant_stock
        set stock = stock - order_row.quantity
        where variant_id = order_row.variant_id
          and size = order_row.size
          and stock >= order_row.quantity
        returning stock into remaining_stock;
    else
      update public.product_sizes
        set stock = stock - order_row.quantity
        where product_id = order_row.product_id
          and size = order_row.size
          and stock >= order_row.quantity
        returning stock into remaining_stock;
    end if;
    if remaining_stock is null then
      raise exception 'Cannot reserve stock for existing COD order %. Adjust inventory or resolve that order, then rerun migration 020.', order_row.id;
    end if;
    update public.orders set stock_deducted = true where id = order_row.id;
  end loop;
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

    if new.payment_method = 'cod' and closes_at is not null and now() >= closes_at then
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

    if new.payment_method = 'cod' and closes_at is not null and now() >= closes_at then
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
