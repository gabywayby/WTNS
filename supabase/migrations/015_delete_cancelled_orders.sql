-- Allow admins to permanently delete cancelled customer orders from /orders.
-- Run manually in the Supabase SQL editor after migration 014.
grant delete on public.orders to authenticated;

drop policy if exists "Admins delete cancelled orders" on public.orders;
create policy "Admins delete cancelled orders" on public.orders
  for delete to authenticated
  using (public.is_admin() and status = 'cancelled');
