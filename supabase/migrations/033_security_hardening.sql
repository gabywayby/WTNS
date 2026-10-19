-- Restrict receipt deletion to unreferenced receipts in the customer's folder.
drop policy if exists "Customers and admins delete payment receipts" on storage.objects;
create policy "Customers and admins delete payment receipts"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'payment-receipts'
  and (
    public.is_admin()
    or (
      (storage.foldername(name))[1] = (select auth.uid())::text
      and not exists (
        select 1 from public.orders o where o.receipt_path = name
      )
    )
  )
);

-- Require receipt uploads to live under the order owner's user ID folder.
alter table public.orders
  drop constraint if exists orders_receipt_path_owner_check;
alter table public.orders
  add constraint orders_receipt_path_owner_check
  check (receipt_path is null or receipt_path like user_id::text || '/%');

-- Cap each customer at three pending orders.
create or replace function public.wtns_limit_pending_orders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_count integer;
begin
  select count(*) into pending_count
  from public.orders
  where user_id = new.user_id and status = 'pending';

  if pending_count >= 3 then
    raise exception 'Too many pending orders';
  end if;

  return new;
end;
$$;

drop trigger if exists wtns_a_limit_pending_orders on public.orders;
create trigger wtns_a_limit_pending_orders
before insert on public.orders
for each row
execute function public.wtns_limit_pending_orders();

-- Restrict product photo uploads to supported image formats and 8 MB per file.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'],
    file_size_limit = 8388608
where id = 'product-photos';
