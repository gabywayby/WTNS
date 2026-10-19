-- WTNS extras. Run manually in the Supabase SQL editor.
alter table public.orders add column if not exists customer_email text;

create or replace function public.wtns_order_before_insert()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare available_stock integer;
begin
  if new.user_id is null or new.user_id <> auth.uid() then
    raise exception 'You must be signed in to order';
  end if;
  new.customer_email := coalesce(new.customer_email, auth.jwt() ->> 'email');
  select stock into available_stock from public.product_sizes
    where product_id = new.product_id and size = new.size for update;
  if available_stock is null or available_stock < new.quantity then
    raise exception 'Not enough stock for this size';
  end if;
  update public.product_sizes set stock = stock - new.quantity
    where product_id = new.product_id and size = new.size;
  return new;
end;
$$;
drop trigger if exists wtns_order_before_insert on public.orders;
create trigger wtns_order_before_insert before insert on public.orders
for each row execute function public.wtns_order_before_insert();

create or replace function public.wtns_restore_cancelled_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.product_sizes set stock = stock + old.quantity
      where product_id = old.product_id and size = old.size;
  end if;
  return new;
end;
$$;
drop trigger if exists wtns_restore_cancelled_stock on public.orders;
create trigger wtns_restore_cancelled_stock after update of status on public.orders
for each row execute function public.wtns_restore_cancelled_stock();

insert into public.products (slug,name,description,price_php,status,preorder_opens_at,teaser_image_url)
values ('eye-witness','Eye Witness','A reminder to see clearly, stand firmly, and bear witness.',1200,'sold_out',null,'https://placehold.co/900x1100/191919/eeeeee?text=EYE+WITNESS'),
       ('child-of-god','Child Of God','Identity before everything. More details soon.',1200,'available','2027-01-01 00:00:00+08','https://placehold.co/900x1100/191919/eeeeee?text=CHILD+OF+GOD')
on conflict (slug) do nothing;

insert into public.product_images (product_id,url,sort_order)
select id,'https://placehold.co/900x1100/191919/eeeeee?text='||replace(slug,'-','+'),1 from public.products where slug in ('eye-witness','child-of-god')
on conflict do nothing;

insert into public.product_sizes (product_id,size,stock)
select p.id,s.size,s.stock from public.products p cross join (values ('S',0),('M',0),('L',0),('XL',0)) as s(size,stock)
where p.slug='eye-witness' on conflict (product_id,size) do nothing;
insert into public.product_sizes (product_id,size,stock)
select p.id,s.size,s.stock from public.products p cross join (values ('S',8),('M',12),('L',12),('XL',8)) as s(size,stock)
where p.slug='child-of-god' on conflict (product_id,size) do nothing;
