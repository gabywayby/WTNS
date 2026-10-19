import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cancelOldPendingOrders, deleteOrder, updateOrder } from "@/app/admin/actions";
import { ConfirmCancelPendingButton, ConfirmDeleteOrderButton } from "@/components/ConfirmOrderActions";

const statuses = ["pending", "paid", "shipped", "delivered", "completed", "cancelled"] as const;
const sizes = ["S", "M", "L", "XL"] as const;
const hoursUntil = (createdAt: string, holdHours: number) => Math.max(0, Math.ceil((new Date(createdAt).getTime() + holdHours * 60 * 60 * 1000 - Date.now()) / (60 * 60 * 1000)));

async function OrdersContent({
  placed,
  status,
  cancelled,
  days,
  saved,
  errorCode,
  limit,
}: {
  placed?: string;
  status?: string;
  cancelled?: string;
  days?: string;
  saved?: string;
  errorCode?: string;
  limit?: number;
}) {
  await connection();
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return <div className="section"><h1 className="page-title">ORDERS</h1><p>Sign-in is temporarily unavailable.</p></div>;
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Forders");
  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();

  if (admin) {
    try { await supabase.rpc("wtns_release_expired_orders"); } catch { /* best-effort cleanup */ }
    const orderLimit = limit ?? 100;
    let ordersQuery = supabase.from("orders").select("id,user_id,product_id,variant_id,size,quantity,total_php,full_name,phone,address,payment_reference,payment_method,receipt_path,is_preorder,stock_deducted,auto_cancelled,status,created_at,customer_email,variant_name,shipping_php", { count: "exact" }).order("created_at", { ascending: false });
    if (status && statuses.includes(status as (typeof statuses)[number])) ordersQuery = ordersQuery.eq("status", status);
    const [ordersResult, summaryPageResult, productsResult, settingsResult] = await Promise.all([
      ordersQuery.range(0, orderLimit - 1),
      supabase.from("orders").select("id,product_id,variant_id,size,quantity,total_php,payment_method,is_preorder,status,variant_name").order("created_at", { ascending: true }).order("id", { ascending: true }).range(0, 999),
      supabase.from("products").select("id,name,preorder_opens_at,preorder_closes_at"),
      supabase.from("store_settings").select("hold_hours").eq("singleton", true).maybeSingle(),
    ]);
    const holdHours = settingsResult.data?.hold_hours ?? 48;
    const allOrders = [...(summaryPageResult.data ?? [])];
    let summaryError = summaryPageResult.error;
    let summaryPageSize = summaryPageResult.data?.length ?? 0;
    while (summaryPageSize === 1000 && !summaryError) {
      const summaryOffset = allOrders.length;
      const nextSummaryPage = await supabase.from("orders").select("id,product_id,variant_id,size,quantity,total_php,payment_method,is_preorder,status,variant_name").order("created_at", { ascending: true }).order("id", { ascending: true }).range(summaryOffset, summaryOffset + 999);
      if (nextSummaryPage.error) { summaryError = nextSummaryPage.error; break; }
      const rows = nextSummaryPage.data ?? [];
      allOrders.push(...rows);
      summaryPageSize = rows.length;
    }
    const visibleOrders = ordersResult.data ?? [];
    const receiptLinks = new Map<string, string>();
    const receiptPaths = [...new Set(visibleOrders.map((order) => order.receipt_path).filter((path): path is string => !!path))];
    if (receiptPaths.length) {
      const { data: signedReceipts } = await supabase.storage.from("payment-receipts").createSignedUrls(receiptPaths, 3600);
      const signedByPath = new Map((signedReceipts ?? []).map((receipt) => [receipt.path, receipt.signedUrl]));
      for (const order of visibleOrders) {
        const signedUrl = order.receipt_path ? signedByPath.get(order.receipt_path) : undefined;
        if (signedUrl) receiptLinks.set(order.id, signedUrl);
      }
    }
    const productNames = new Map((productsResult.data ?? []).map((product) => [product.id, product.name]));
    const revenue = allOrders
      .filter((order) => order.payment_method === "cod"
        ? ["delivered", "completed"].includes(order.status)
        : ["paid", "shipped", "delivered", "completed"].includes(order.status))
      .reduce((sum, order) => sum + Number(order.total_php), 0);
    const sizeDemand = new Map<string, { productName: string; variantName: string | null; sizes: Record<string, number> }>();
    const countedOrders = new Map(allOrders
      .filter((order) => ["paid", "shipped", "delivered", "completed"].includes(order.status)
        || (order.payment_method === "cod" && order.status === "pending"))
      .map((order) => [order.id, order] as const)).values();
    for (const order of countedOrders) {
      if (!order.is_preorder) continue;
      const key = `${order.product_id}:${order.variant_id ?? order.variant_name ?? "base"}`;
      const demand: { productName: string; variantName: string | null; sizes: Record<string, number> } = sizeDemand.get(key) ?? {
        productName: productNames.get(order.product_id) ?? "WTNS item",
        variantName: order.variant_name,
        sizes: { S: 0, M: 0, L: 0, XL: 0 },
      };
      if (order.size in demand.sizes) demand.sizes[order.size] += Number(order.quantity);
      sizeDemand.set(key, demand);
    }
    const shirtsToDeliver = new Map<string, { productName: string; variantName: string | null; sizes: Record<string, number> }>();
    const visibleStatuses = new Map(visibleOrders.map((order) => [order.id, order.status]));
    for (const order of allOrders) {
      const currentStatus = visibleStatuses.get(order.id) ?? order.status;
      const needsDelivery = ["paid", "shipped"].includes(currentStatus)
        || (order.payment_method === "cod" && currentStatus === "pending");
      if (!needsDelivery) continue;
      const key = `${order.product_id}:${order.variant_id ?? order.variant_name ?? "base"}`;
      const demand: { productName: string; variantName: string | null; sizes: Record<string, number> } = shirtsToDeliver.get(key) ?? {
        productName: productNames.get(order.product_id) ?? "WTNS item",
        variantName: order.variant_name,
        sizes: { S: 0, M: 0, L: 0, XL: 0 },
      };
      if (order.size in demand.sizes) demand.sizes[order.size] += Number(order.quantity);
      shirtsToDeliver.set(key, demand);
    }
    const shirtsSold = new Map<string, { productName: string; variantName: string | null; sizes: Record<string, number> }>();
    for (const order of allOrders) {
      const currentStatus = visibleStatuses.get(order.id) ?? order.status;
      if (!["delivered", "completed"].includes(currentStatus)) continue;
      const key = `${order.product_id}:${order.variant_id ?? order.variant_name ?? "base"}`;
      const sold: { productName: string; variantName: string | null; sizes: Record<string, number> } = shirtsSold.get(key) ?? {
        productName: productNames.get(order.product_id) ?? "WTNS item",
        variantName: order.variant_name,
        sizes: { S: 0, M: 0, L: 0, XL: 0 },
      };
      if (order.size in sold.sizes) sold.sizes[order.size] += Number(order.quantity);
      shirtsSold.set(key, sold);
    }
    const actionError = errorCode === "cancel-days"
      ? "Enter a number of days from 1 to 3650."
      : errorCode === "cancel-orders"
        ? "Older pending orders could not be cancelled."
        : errorCode === "delete-order"
          ? "The order could not be deleted. Refresh and try again."
          : errorCode === "stock"
            ? "This order could not be marked Paid because there is not enough stock for its style and size. Check inventory and the approved size totals."
            : errorCode === "status-save"
              ? "The order status could not be saved. Refresh and try again."
        : null;

    return (
      <main className="admin-dashboard">
        <header className="admin-page-heading">
          <div><span className="eyebrow">WTNS / Store controls</span><h1>CUSTOMER ORDERS</h1></div>
          <p>Review customer orders, confirm payments, and total approved sizes for purchasing.</p>
        </header>
        {actionError && <p className="admin-alert" role="alert">{actionError}</p>}
        {saved && <p className="admin-success" role="status">Order status saved.</p>}
        {cancelled !== undefined && <p className="admin-success" role="status">Cancelled {cancelled} pending order(s) older than {days} day(s).</p>}

        <section className="admin-overview" aria-label="Order overview">
          {["pending", "paid", "shipped"].map((state) => <div className="admin-stat-card" key={state}><span>{state} orders</span><strong>{allOrders.filter((order) => order.status === state).length}</strong></div>)}
          <div className="admin-stat-card"><span>Collected revenue</span><strong>₱{revenue.toLocaleString("en-PH")}</strong></div>
        </section>

        <section className="admin-settings-grid admin-orders-tools" aria-label="Order tools">
          <article className="admin-panel">
            <span className="eyebrow">Order maintenance</span><h2>Clear old pending orders</h2>
            <p>Cancel pending orders that are older than the chosen number of days.</p>
            <form action={cancelOldPendingOrders} className="admin-inline-form">
              <label>Older than days<input name="days" type="number" min="1" max="3650" defaultValue="14" required /></label>
              <label className="admin-cancel-all-option"><input type="checkbox" name="include_preorders_cod" />Also cancel pre-orders and COD orders</label>
              <ConfirmCancelPendingButton action={cancelOldPendingOrders} />
            </form>
          </article>
        </section>

        <section className="admin-section-block admin-demand-section admin-demand-approved">
          <div className="admin-section-heading">
            <div><span className="eyebrow">Buying guide</span><h2>Approved size totals</h2></div>
            <p>Pre-order demand only. Regular orders are excluded, and approved totals stay available after the pre-order closes.</p>
          </div>
          {summaryError
            ? <p className="admin-alert" role="alert">Size totals could not load because the orders query failed. Confirm migration 026 is applied in Supabase. Details: {summaryError.message}</p>
            : productsResult.error
              ? <p className="admin-alert" role="alert">Size totals could not load because product details failed. Details: {productsResult.error.message}</p>
              : sizeDemand.size === 0 ? <p className="admin-empty">No approved pre-orders yet. Orders count here only when the database marked them as pre-orders and their status is approved.</p> : (
            <div className="admin-demand-groups">{[...sizeDemand.entries()].map(([key, demand]) => (
              <section className="admin-demand-group" key={key}>
                <h3>{demand.productName}{demand.variantName && <span> / {demand.variantName}</span>}</h3>
                <div className="admin-overview admin-demand-overview">{sizes.map((size) => (
                  <div className="admin-stat-card" key={size}><span>Size {size}</span><strong>{demand.sizes[size]}</strong></div>
                ))}</div>
              </section>
            ))}</div>
          )}
        </section>

        <section className="admin-section-block admin-demand-section admin-demand-delivery">
          <div className="admin-section-heading">
            <div><span className="eyebrow">Fulfillment</span><h2>Shirts to deliver</h2></div>
            <p>Shirts still to hand over. Orders leave this list when marked Delivered.</p>
          </div>
          {summaryError
            ? <p className="admin-alert" role="alert">Delivery totals could not load because the orders query failed. Details: {summaryError.message}</p>
            : productsResult.error
              ? <p className="admin-alert" role="alert">Delivery totals could not load because product details failed. Details: {productsResult.error.message}</p>
              : shirtsToDeliver.size === 0 ? <p className="admin-empty">You’re all caught up. There are no shirts waiting to be delivered.</p> : (
            <div className="admin-demand-groups">{[...shirtsToDeliver.entries()].map(([key, demand]) => (
              <section className="admin-demand-group" key={key}>
                <h3>{demand.productName}{demand.variantName && <span> / {demand.variantName}</span>}</h3>
                <div className="admin-overview admin-demand-overview">{sizes.map((size) => (
                  <div className="admin-stat-card" key={size}><span>Size {size}</span><strong>{demand.sizes[size]}</strong></div>
                ))}</div>
              </section>
            ))}</div>
          )}
        </section>

        <section className="admin-section-block admin-demand-section admin-demand-sold">
          <div className="admin-section-heading">
            <div><span className="eyebrow">Fulfillment</span><h2>Shirts sold</h2></div>
            <p>Total shirts already delivered to customers.</p>
          </div>
          {summaryError
            ? <p className="admin-alert" role="alert">Sold totals could not load because the orders query failed. Details: {summaryError.message}</p>
            : productsResult.error
              ? <p className="admin-alert" role="alert">Sold totals could not load because product details failed. Details: {productsResult.error.message}</p>
              : shirtsSold.size === 0 ? <p className="admin-empty">No shirts have been delivered yet.</p> : (
            <div className="admin-demand-groups">{[...shirtsSold.entries()].map(([key, sold]) => (
              <section className="admin-demand-group" key={key}>
                <h3>{sold.productName}{sold.variantName && <span> / {sold.variantName}</span>}</h3>
                <div className="admin-overview admin-demand-overview">{sizes.map((size) => (
                  <div className="admin-stat-card" key={size}><span>Size {size}</span><strong>{sold.sizes[size]}</strong></div>
                ))}</div>
              </section>
            ))}</div>
          )}
        </section>

        <section className="admin-section-block">
          <div className="admin-section-heading">
            <div><span className="eyebrow">Customer activity</span><h2>Orders</h2></div>
            <form method="get" className="admin-filter">
              <label>Status<select name="status" defaultValue={status ?? "all"}><option value="all">All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
              <button className="button button-outline">Filter</button>
            </form>
          </div>
          {ordersResult.error
            ? <p className="admin-alert">Orders could not be loaded: {ordersResult.error.message}</p>
            : visibleOrders.length === 0
              ? <p className="admin-empty">No customer orders match this filter.</p>
              : <div className="admin-table-wrap"><table className="admin-orders-table"><thead><tr><th>Customer</th><th>Shipping address</th><th>Item</th><th>Order type</th><th>Size / qty</th><th>Shipping</th><th>Total</th><th>Payment / reference</th><th>Date</th><th>Status</th></tr></thead>
                <tbody>{visibleOrders.map((order) => <tr key={order.id}>
                  <td>{order.full_name}<small>{order.customer_email}<br />{order.phone}</small></td>
                  <td>{order.address}</td>
                  <td>{productNames.get(order.product_id) ?? "WTNS item"}{order.variant_name && <small>{order.variant_name}</small>}</td>
                  <td><span className={`admin-order-type ${order.stock_deducted ? "is-regular" : "is-preorder"}`}>{order.stock_deducted ? "Stock held" : "Not held"}</span>{!order.stock_deducted && order.is_preorder && <small>Pre-order</small>}{order.status === "pending" && order.payment_method === "gotyme" && order.stock_deducted && !order.auto_cancelled && <small>Auto-cancels in {hoursUntil(order.created_at, holdHours)}h</small>}</td>
                  <td>{order.size} / {order.quantity}</td>
                  <td>₱{Number(order.shipping_php).toLocaleString("en-PH")}</td>
                  <td>₱{Number(order.total_php).toLocaleString("en-PH")}</td>
                  <td>{order.payment_method === "cod" ? "Cash on delivery" : "GoTyme"}{order.payment_reference && <small>{order.payment_reference}</small>}{receiptLinks.has(order.id) && <small><a href={receiptLinks.get(order.id)} target="_blank" rel="noreferrer">View receipt screenshot ↗</a></small>}</td>
                  <td>{new Date(order.created_at).toLocaleString("en-PH")}</td>
                  <td>{order.status === "cancelled" ? <div className="admin-status-actions"><span>{order.auto_cancelled ? "Auto-cancelled" : "cancelled"}</span><form action={deleteOrder}><input type="hidden" name="id" value={order.id} /><ConfirmDeleteOrderButton action={deleteOrder} status={order.status} /></form></div> : <form action={updateOrder} className="admin-status-form"><input type="hidden" name="id" value={order.id} /><select className={order.status === "delivered" ? "is-delivered" : undefined} name="status" defaultValue={order.status}>{statuses.map((item) => <option key={item} value={item}>{item === "pending" && order.payment_method === "cod" ? "COD" : item}</option>)}</select><div className="admin-status-actions"><button className="admin-save-link">Save</button><ConfirmDeleteOrderButton action={deleteOrder} status={order.status} /></div></form>}</td>
                </tr>)}</tbody></table></div>}
          {!ordersResult.error && (ordersResult.count ?? 0) > visibleOrders.length && <p className="muted">Showing {visibleOrders.length} of {ordersResult.count} orders · <Link href={`/orders?limit=${orderLimit + 100}${status && statuses.includes(status as (typeof statuses)[number]) ? `&status=${encodeURIComponent(status)}` : ""}`}>Show more</Link></p>}
        </section>
      </main>
    );
  }

  const [{ data: orders, error }, { data: products }, { data: settings }] = await Promise.all([
    supabase.from("orders").select("id,product_id,variant_name,size,quantity,total_php,shipping_php,payment_method,status,created_at,stock_deducted").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("products").select("id,name"),
    supabase.from("store_settings").select("hold_hours").eq("singleton", true).maybeSingle(),
  ]);
  const holdHours = settings?.hold_hours ?? 48;
  const productNames = new Map((products ?? []).map((product) => [product.id, product.name]));
  return <div className="section"><span className="eyebrow">WTNS / Account</span><h1 className="page-title">YOUR ORDERS</h1>{placed && <div className="notice" role="status">Your order has been received. GoTyme orders remain pending until confirmed; COD orders are marked COD.</div>}{error ? <p className="error">Orders could not be loaded right now.</p> : orders?.length ? <div className="table-wrap"><table><thead><tr><th>Product</th><th>Size</th><th>Qty</th><th>Shipping</th><th>Total</th><th>Status</th><th>Date</th></tr></thead><tbody>{orders.map((order) => { const heldUntil = new Date(new Date(order.created_at).getTime() + holdHours * 60 * 60 * 1000); const awaiting = order.payment_method === "gotyme" && order.status === "pending" && order.stock_deducted; const label = awaiting ? `Awaiting confirmation (held until ${heldUntil.toLocaleString("en-PH")})` : order.payment_method === "cod" && order.status === "pending" ? "COD" : order.status; return <tr key={order.id}><td>{productNames.get(order.product_id) ?? "WTNS item"}{order.variant_name && <><br/><span className="muted">{order.variant_name}</span></>}</td><td>{order.size}</td><td>{order.quantity}</td><td>₱{Number(order.shipping_php).toLocaleString("en-PH")}</td><td>₱{Number(order.total_php).toLocaleString("en-PH")}</td><td><span className={order.status === "delivered" ? "order-status-delivered" : undefined}>{label}</span></td><td>{new Date(order.created_at).toLocaleDateString("en-PH")}</td></tr>; })}</tbody></table></div> : <div className="empty-state">No orders yet.</div>}</div>;
}

export default function OrdersPage({ searchParams }: { searchParams: Promise<{ placed?: string; status?: string; cancelled?: string; days?: string; error?: string; saved?: string; limit?: string }> }) {
  return <Suspense fallback={<div className="section muted">Loading orders…</div>}><OrdersRoute searchParams={searchParams}/></Suspense>;
}

async function OrdersRoute({ searchParams }: { searchParams: Promise<{ placed?: string; status?: string; cancelled?: string; days?: string; error?: string; saved?: string; limit?: string }> }) {
  const params = await searchParams;
  const requestedLimit = Number(params.limit);
  const limit = Number.isSafeInteger(requestedLimit) && requestedLimit >= 100 ? requestedLimit : 100;
  return <OrdersContent placed={params.placed} status={params.status} cancelled={params.cancelled} days={params.days} saved={params.saved} errorCode={params.error} limit={limit} />;
}
