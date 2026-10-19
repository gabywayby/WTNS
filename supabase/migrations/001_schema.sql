-- WTNS base schema for a new Supabase project.
-- Run this once in the Supabase SQL editor before 002_extras.sql.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  price_php integer not null check (price_php >= 0),
  status text not null default 'upcoming' check (status in ('upcoming','available','sold_out')),
  preorder_opens_at timestamptz,
  teaser_image_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  sort_order integer not null default 0
);

create table if not exists public.product_sizes (
  product_id uuid not null references public.products(id) on delete cascade,
  size text not null,
  stock integer not null default 0 check (stock >= 0),
  primary key (product_id, size)
);

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  product_id uuid not null references public.products(id),
  size text not null,
  quantity integer not null check (quantity between 1 and 5),
  total_php integer not null default 0 check (total_php >= 0),
  full_name text not null,
  phone text not null,
  address text not null,
  payment_reference text not null,
  status text not null default 'pending' check (status in ('pending','paid','shipped','completed','cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc);
create index if not exists orders_status_created_idx on public.orders(status, created_at desc);
create index if not exists product_images_product_sort_idx on public.product_images(product_id, sort_order);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

create or replace function public.wtns_set_order_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare current_price integer;
begin
  select price_php into current_price from public.products where id = new.product_id;
  if current_price is null then
    raise exception 'Product not found';
  end if;
  new.total_php := current_price * new.quantity;
  return new;
end;
$$;

drop trigger if exists wtns_set_order_total on public.orders;
create trigger wtns_set_order_total
before insert on public.orders
for each row execute function public.wtns_set_order_total();

alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_sizes enable row level security;
alter table public.admins enable row level security;
alter table public.orders enable row level security;

drop policy if exists "Public can read products" on public.products;
create policy "Public can read products" on public.products
for select to anon, authenticated using (true);
drop policy if exists "Admins manage products" on public.products;
create policy "Admins manage products" on public.products
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Released product photos are visible" on public.product_images;
create policy "Released product photos are visible" on public.product_images
for select to anon, authenticated using (
  public.is_admin() or exists (
    select 1 from public.products p where p.id = product_id
      and (p.status = 'sold_out' or p.preorder_opens_at is null or p.preorder_opens_at <= now())
  )
);
drop policy if exists "Admins manage product photos" on public.product_images;
create policy "Admins manage product photos" on public.product_images
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Public can read sizes" on public.product_sizes;
create policy "Public can read sizes" on public.product_sizes
for select to anon, authenticated using (true);
drop policy if exists "Admins manage sizes" on public.product_sizes;
create policy "Admins manage sizes" on public.product_sizes
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Users can read their admin membership" on public.admins;
create policy "Users can read their admin membership" on public.admins
for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
drop policy if exists "Admins manage admin memberships" on public.admins;
create policy "Admins manage admin memberships" on public.admins
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Users and admins read orders" on public.orders;
create policy "Users and admins read orders" on public.orders
for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
drop policy if exists "Users can place eligible orders" on public.orders;
create policy "Users can place eligible orders" on public.orders
for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.products p where p.id = product_id and p.status = 'available'
      and (p.preorder_opens_at is null or p.preorder_opens_at <= now())
  )
);
drop policy if exists "Admins update orders" on public.orders;
create policy "Admins update orders" on public.orders
for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Allow the site's anon/authenticated Supabase clients to reach these tables.
-- RLS policies above still control which rows can be read or changed.
grant usage on schema public to anon, authenticated;
grant select on public.products, public.product_images, public.product_sizes to anon, authenticated;
grant select on public.admins to authenticated;
grant select, insert, update on public.orders to authenticated;
grant insert, update, delete on public.products, public.product_images, public.product_sizes to authenticated;
grant insert, update, delete on public.admins to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
