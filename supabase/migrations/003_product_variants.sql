-- WTNS shirt styles and style-specific stock/prices.
-- Run after 001_schema.sql and 002_extras.sql in the Supabase SQL editor.

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  price_php integer not null check (price_php >= 0),
  unique (product_id, name),
  unique (id, product_id)
);

create table if not exists public.variant_stock (
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  size text not null,
  stock integer not null default 0 check (stock >= 0),
  primary key (variant_id, size)
);

alter table public.orders add column if not exists variant_id uuid;
alter table public.orders add column if not exists variant_name text;
alter table public.orders drop constraint if exists orders_variant_id_fkey;
alter table public.orders add constraint orders_variant_id_fkey
  foreign key (variant_id) references public.product_variants(id);

alter table public.product_variants enable row level security;
alter table public.variant_stock enable row level security;
drop policy if exists "Public can read product variants" on public.product_variants;
create policy "Public can read product variants" on public.product_variants
for select to anon, authenticated using (true);
drop policy if exists "Admins manage product variants" on public.product_variants;
create policy "Admins manage product variants" on public.product_variants
for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Public can read variant stock" on public.variant_stock;
create policy "Public can read variant stock" on public.variant_stock
for select to anon, authenticated using (true);
drop policy if exists "Admins manage variant stock" on public.variant_stock;
create policy "Admins manage variant stock" on public.variant_stock
for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.product_variants, public.variant_stock to anon, authenticated;
grant insert, update, delete on public.product_variants, public.variant_stock to authenticated;

insert into public.product_variants (product_id, name, price_php)
select p.id, v.name, v.price_php
from public.products p
cross join (values ('Standard shirt', 499), ('Heavy oversized-cropped shirt', 649)) as v(name, price_php)
where p.slug = 'child-of-god'
on conflict (product_id, name) do update set price_php = excluded.price_php;

update public.products set price_php = 499 where slug = 'child-of-god';

-- Carry existing Child of God size counts into the Standard shirt option.
insert into public.variant_stock (variant_id, size, stock)
select v.id, ps.size, ps.stock
from public.product_variants v
join public.products p on p.id = v.product_id
join public.product_sizes ps on ps.product_id = p.id
where p.slug = 'child-of-god' and v.name = 'Standard shirt'
on conflict (variant_id, size) do nothing;

-- The new cut starts at zero stock until its actual quantities are entered.
insert into public.variant_stock (variant_id, size, stock)
select v.id, sizes.size, 0
from public.product_variants v
join public.products p on p.id = v.product_id
cross join (values ('S'), ('M'), ('L'), ('XL')) as sizes(size)
where p.slug = 'child-of-god' and v.name = 'Heavy oversized-cropped shirt'
on conflict (variant_id, size) do nothing;

create or replace function public.wtns_set_order_total()
returns trigger language plpgsql security definer set search_path = public as $$
declare current_price integer;
begin
  if new.variant_id is not null then
    select price_php into current_price from public.product_variants
      where id = new.variant_id and product_id = new.product_id;
  else
    select price_php into current_price from public.products where id = new.product_id;
  end if;
  if current_price is null then raise exception 'Product or shirt style not found'; end if;
  new.total_php := current_price * new.quantity;
  return new;
end;
$$;

create or replace function public.wtns_order_before_insert()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare available_stock integer; selected_name text;
begin
  if new.user_id is null or new.user_id <> auth.uid() then
    raise exception 'You must be signed in to order';
  end if;
  new.customer_email := coalesce(new.customer_email, auth.jwt() ->> 'email');
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

create or replace function public.wtns_restore_cancelled_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    if old.variant_id is not null then
      update public.variant_stock set stock = stock + old.quantity
        where variant_id = old.variant_id and size = old.size;
    else
      update public.product_sizes set stock = stock + old.quantity
        where product_id = old.product_id and size = old.size;
    end if;
  end if;
  return new;
end;
$$;
