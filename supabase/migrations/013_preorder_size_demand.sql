-- Pre-orders should record customer demand without reserving current inventory.
-- Run manually in the Supabase SQL editor after migration 012.
create or replace function public.wtns_order_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  selected_name text;
  current_shipping integer;
begin
  if new.user_id is null or new.user_id <> auth.uid() then
    raise exception 'You must be signed in to order';
  end if;

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
    if selected_name is null then
      raise exception 'Choose a valid shirt style';
    end if;
    if not exists (
      select 1 from public.variant_stock
      where variant_id = new.variant_id and size = new.size
    ) then
      raise exception 'Choose a valid size';
    end if;
    new.variant_name := selected_name;
  else
    if new.variant_id is not null then
      raise exception 'Shirt style is not valid for this product';
    end if;
    if not exists (
      select 1 from public.product_sizes
      where product_id = new.product_id and size = new.size
    ) then
      raise exception 'Choose a valid size';
    end if;
    new.variant_name := null;
  end if;

  return new;
end;
$$;

-- Orders no longer decrement inventory, so cancellation must not restore it.
drop trigger if exists wtns_restore_cancelled_stock on public.orders;
