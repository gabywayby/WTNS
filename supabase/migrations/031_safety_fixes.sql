-- Return inventory when an admin permanently deletes an order that had
-- already consumed stock. stock_deducted prevents double restoration.
create or replace function public.wtns_restore_stock_before_order_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.stock_deducted then
    if old.variant_id is not null then
      update public.variant_stock
      set stock = stock + old.quantity
      where variant_id = old.variant_id and size = old.size;
    else
      update public.product_sizes
      set stock = stock + old.quantity
      where product_id = old.product_id and size = old.size;
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists wtns_restore_stock_before_order_delete on public.orders;
create trigger wtns_restore_stock_before_order_delete
before delete on public.orders
for each row execute function public.wtns_restore_stock_before_order_delete();
