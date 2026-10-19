-- WTNS order hardening, authoritative shipping, and payment-reference uniqueness.
-- Run after 001_schema.sql, 002_extras.sql, and 003_product_variants.sql.

alter table public.orders
  add column if not exists shipping_php integer not null default 0 check (shipping_php >= 0);

create table if not exists public.store_settings (
  singleton boolean primary key default true check (singleton),
  shipping_php integer not null default 0 check (shipping_php >= 0),
  updated_at timestamptz not null default now()
);
insert into public.store_settings (singleton, shipping_php)
values (true, 0)
on conflict (singleton) do nothing;

alter table public.store_settings enable row level security;
drop policy if exists "Public can read store settings" on public.store_settings;
create policy "Public can read store settings" on public.store_settings
  for select to anon, authenticated using (true);
drop policy if exists "Admins manage store settings" on public.store_settings;
create policy "Admins manage store settings" on public.store_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.store_settings to anon, authenticated;
grant insert, update, delete on public.store_settings to authenticated;

-- Keep uploaded gallery images publicly viewable and restrict uploads to WTNS admins.
update storage.buckets set public = true where id = 'product-photos';
drop policy if exists "Admins upload product photos" on storage.objects;
create policy "Admins upload product photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-photos' and public.is_admin());

create unique index if not exists orders_payment_reference_active_unique
  on public.orders (lower(payment_reference))
  where status <> 'cancelled';

create or replace function public.wtns_order_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  available_stock integer;
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
    if selected_name is null then raise exception 'Choose a valid shirt style'; end if;
    select stock into available_stock from public.variant_stock
      where variant_id = new.variant_id and size = new.size for update;
    if available_stock is null or available_stock < new.quantity then
      raise exception 'Not enough stock for this shirt style and size';
    end if;
    update public.variant_stock set stock = stock - new.quantity
      where variant_id = new.variant_id and size = new.size;
    new.variant_name := selected_name;
  else
    if new.variant_id is not null then raise exception 'Shirt style is not valid for this product'; end if;
    select stock into available_stock from public.product_sizes
      where product_id = new.product_id and size = new.size for update;
    if available_stock is null or available_stock < new.quantity then
      raise exception 'Not enough stock for this size';
    end if;
    update public.product_sizes set stock = stock - new.quantity
      where product_id = new.product_id and size = new.size;
    new.variant_name := null;
  end if;
  return new;
end;
$$;

create or replace function public.wtns_set_order_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare current_price integer;
begin
  if new.variant_id is not null then
    select price_php into current_price from public.product_variants
      where id = new.variant_id and product_id = new.product_id;
  else
    select price_php into current_price from public.products where id = new.product_id;
  end if;
  if current_price is null then raise exception 'Product or shirt style not found'; end if;
  new.total_php := current_price * new.quantity + new.shipping_php;
  return new;
end;
$$;
