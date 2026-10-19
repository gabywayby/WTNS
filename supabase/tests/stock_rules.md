# Stock rules manual test

Use a product whose pre-order has ended and set Standard M stock to `2` in the admin inventory.

1. Place a COD order for size M, quantity 1. Confirm Standard M stock becomes `1`.
2. Place a GoTyme order for size M, quantity 1. Confirm Standard M stock becomes `0`.
3. Try a third order for size M. Confirm checkout fails with the out-of-stock message.
4. Cancel the GoTyme order in the admin orders page. Confirm Standard M stock returns to `1`.
5. Mark the COD order Delivered. Confirm Standard M stock stays at `1`.
6. Set the unpaid GoTyme hold duration to 1 hour in admin. In the SQL editor, backdate a pending, post-preorder, stock-deducted GoTyme order by two hours:

   ```sql
   update public.orders
   set created_at = now() - interval '2 hours'
   where id = '<pending GoTyme order UUID>'
     and payment_method = 'gotyme'
     and status = 'pending'
     and is_preorder = false
     and stock_deducted = true;
   ```

   Reload `/orders`. Confirm the order shows as auto-cancelled and its stock is returned.
