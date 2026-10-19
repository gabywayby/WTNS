-- Allow admins to mark an order delivered after shipment.
alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'paid', 'shipped', 'delivered', 'completed', 'cancelled'));
