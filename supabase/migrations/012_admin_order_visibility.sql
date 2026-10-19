-- Ensure WTNS admins can list orders placed by every customer account.
-- Run manually in the Supabase SQL editor after migration 011.
grant select on public.orders to authenticated;

drop policy if exists "Admins read all customer orders" on public.orders;
create policy "Admins read all customer orders" on public.orders
  for select to authenticated
  using (public.is_admin());
