-- Allow admins to permanently delete any customer order from /orders.
-- Run manually in the Supabase SQL editor after migration 021.
grant delete on public.orders to authenticated;

drop policy if exists "Admins delete cancelled orders" on public.orders;
drop policy if exists "Admins delete customer orders" on public.orders;
create policy "Admins delete customer orders" on public.orders
  for delete to authenticated
  using (public.is_admin());
