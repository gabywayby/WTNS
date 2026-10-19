-- Customer checkout is reserved for non-admin accounts.
-- Run manually in the Supabase SQL editor after migration 013.
drop policy if exists "Users can place eligible orders" on public.orders;
create policy "Users can place eligible orders" on public.orders
  for insert to authenticated
  with check (
    not public.is_admin()
    and user_id = (select auth.uid())
    and exists (
      select 1 from public.products p
      where p.id = product_id
        and p.status = 'available'
        and (p.preorder_opens_at is null or p.preorder_opens_at <= now())
    )
  );
