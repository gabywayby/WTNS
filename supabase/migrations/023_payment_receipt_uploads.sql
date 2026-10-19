-- Store GoTyme receipt screenshots privately and keep existing reference
-- number orders valid while new orders use receipt_path instead.
alter table public.orders
  add column if not exists receipt_path text;

alter table public.orders
  drop constraint if exists orders_payment_reference_method_check;

alter table public.orders
  add constraint orders_payment_reference_method_check
  check (
    (payment_method = 'gotyme'
      and (
        (payment_reference is not null and btrim(payment_reference) <> '')
        or (receipt_path is not null and btrim(receipt_path) <> '')
      ))
    or (payment_method = 'cod' and payment_reference is null and receipt_path is null)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-receipts', 'payment-receipts', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Customers upload their own payment receipts" on storage.objects;
create policy "Customers upload their own payment receipts" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Customers and admins view payment receipts" on storage.objects;
create policy "Customers and admins view payment receipts" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );

drop policy if exists "Customers and admins delete payment receipts" on storage.objects;
create policy "Customers and admins delete payment receipts" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );
