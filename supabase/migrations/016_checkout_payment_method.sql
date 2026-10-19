-- Record whether an order uses GoTyme or cash on delivery.
-- COD orders have no payment reference; run manually after migration 015.
alter table public.orders
  add column if not exists payment_method text not null default 'gotyme';

alter table public.orders
  alter column payment_reference drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_payment_method_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_payment_method_check
      check (payment_method in ('gotyme', 'cod'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_payment_reference_method_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_payment_reference_method_check
      check (
        (payment_method = 'gotyme' and payment_reference is not null and btrim(payment_reference) <> '')
        or (payment_method = 'cod' and payment_reference is null)
      );
  end if;
end;
$$;

-- Keep references unique for GoTyme while allowing any number of COD orders.
drop index if exists public.orders_payment_reference_active_unique;
create unique index orders_payment_reference_active_unique
  on public.orders (lower(payment_reference))
  where status <> 'cancelled' and payment_reference is not null;
