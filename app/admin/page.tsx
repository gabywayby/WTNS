import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatManilaDateTimeLocal } from "@/lib/time";
import {
  updateProduct,
  updateHoldHours,
  updateShippingFee,
  uploadProductPhotos,
} from "./actions";

const sizes = ["S", "M", "L", "XL", "XXL"] as const;

function AdminError({ code }: { code?: string }) {
  if (!code) return null;
  const messages: Record<string, string> = {
    "stock-save": "Stock could not be saved. Check the counts and try again.",
    "stock-conflict": "Stock changed since you opened this page. Reload and try again.",
    "product-save": "Product details could not be saved. Try again.",
    "photos-save": "Photo upload failed. Check the bucket and image size limits.",
    "shipping-save": "Shipping fee could not be saved. Try again.",
    "hold-hours-save": "Hold duration could not be saved. Enter a whole number from 1 to 720 hours.",
  };
  return <p className="admin-alert" role="alert">{messages[code] ?? "The requested change could not be completed."}</p>;
}

async function AdminContent({
  errorCode,
  success,
}: {
  errorCode?: string;
  success?: string;
}) {
  await connection();
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return <main className="admin-dashboard"><h1 className="page-title">ADMIN</h1><p>Admin access is unavailable until Supabase is configured.</p></main>;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!admin) redirect("/");

  const [settingsResult, productsResult] = await Promise.all([
    supabase.from("store_settings").select("shipping_php,hold_hours").eq("singleton", true).maybeSingle(),
    supabase.from("products").select("id,name,slug,price_php,status,preorder_opens_at,preorder_closes_at,teaser_image_url,product_sizes(size,stock),product_variants(id,name,price_php,variant_stock(size,stock))").order("created_at"),
  ]);

  const products = productsResult.data ?? [];

  return (
    <main className="admin-dashboard">
      <header className="admin-page-heading">
        <div><span className="eyebrow">WTNS / Store controls</span><h1>ADMIN</h1></div>
        <p>Manage releases, inventory, photos, and shipping.</p>
      </header>
      <AdminError code={errorCode} />
      {success === "hold-hours-saved" && <p className="admin-success" role="status">GoTyme hold duration saved.</p>}
      <section className="admin-settings-grid" aria-label="Store settings">
        <article className="admin-panel">
          <span className="eyebrow">Store settings</span><h2>Shipping fee</h2>
          <p>Set the fee added to each order.</p>
          <form action={updateShippingFee} className="admin-inline-form">
            <label>Fee in PHP<input name="shipping_php" type="number" min="0" step="1" required defaultValue={settingsResult.data?.shipping_php ?? 0} /></label>
            <button className="button button-outline">Save fee</button>
          </form>
        </article>
        <article className="admin-panel">
          <span className="eyebrow">Store settings</span><h2>Unpaid GoTyme orders</h2>
          <p>Automatically cancel post-preorder GoTyme orders that remain unpaid after this many hours.</p>
          <form action={updateHoldHours} className="admin-inline-form">
            <label>Hold unpaid GoTyme orders for (hours)<input name="hold_hours" type="number" min="1" max="720" step="1" required defaultValue={settingsResult.data?.hold_hours ?? 48} /></label>
            <button className="button button-outline">Save duration</button>
          </form>
        </article>
      </section>

      <section className="admin-section-block">
        <div className="admin-section-heading"><div><span className="eyebrow">Inventory &amp; content</span><h2>Products</h2></div><p>Set release details and enter each size count directly.</p></div>
        {products.map((product) => {
          const variants = product.product_variants ?? [];
          const productSizes = product.product_sizes ?? [];
          return (
            <details className="admin-product-card" key={product.id} open={product.slug === "child-of-god"}>
              <summary><span><strong>{product.name}</strong><small>/{product.slug}</small></span><span className="admin-product-summary-meta">{product.status.replace("_", " ")} · {variants.length ? `${variants.length} shirt styles` : "Standard stock"}</span></summary>
              <div className="admin-product-content">
                <form action={updateProduct} className="admin-product-form">
                  <input type="hidden" name="id" value={product.id} />
                  <div className="admin-product-fields">
                    {variants.length === 0 && <label>Price (PHP)<input name="price_php" type="number" min="0" step="1" defaultValue={product.price_php} required /></label>}
                    <label>Release status<select name="status" defaultValue={product.status}>{["upcoming", "available", "sold_out"].map((state) => <option key={state}>{state}</option>)}</select></label>
                    <label>Pre-order opens (Manila time)<input name="preorder_opens_at" type="datetime-local" defaultValue={formatManilaDateTimeLocal(product.preorder_opens_at)} /></label>
                    <label>Pre-order ends (Manila time)<input name="preorder_closes_at" type="datetime-local" defaultValue={formatManilaDateTimeLocal(product.preorder_closes_at)} /></label>
                    <label className="admin-field-wide">Teaser image URL<input name="teaser_image_url" type="text" defaultValue={product.teaser_image_url ?? ""} placeholder="https://…/product-photos/image.jpg" /></label>
                  </div>
                  {variants.length > 0 ? (
                    <div className="admin-stock-styles">
                      <h3>Stock for sale after pre-order</h3>
                      <p>Set each style’s price and enter its available sizes.</p>
                      {variants.map((variant) => <fieldset className="admin-stock-style" key={variant.id}>
                        <legend>{variant.name}</legend>
                        <label className="admin-variant-price">Price (PHP)<input name={`variant_price_${variant.id}`} type="number" min="0" step="1" defaultValue={variant.price_php} required /></label>
                        <div className="admin-overview admin-demand-overview admin-stock-sizes">{sizes.map((size) => {
                          const stock = variant.variant_stock?.find((row) => row.size === size)?.stock ?? 0;
                          const fieldName = `variant_stock_${variant.id}_${size}`;
                          return <label className="admin-stat-card" key={size}><span>Size {size}</span><input name={fieldName} type="number" min="0" step="1" defaultValue={stock} /><input type="hidden" name={`orig_${fieldName}`} value={stock} /></label>;
                        })}</div>
                      </fieldset>)}
                      <p>Pre-orders placed before the end date never reduce stock. Enter the stock you have available for sales after the pre-order.</p>
                    </div>
                  ) : (
                    <div className="admin-stock-styles">
                      <h3>Stock for sale after pre-order</h3><div className="admin-overview admin-demand-overview admin-stock-sizes">{sizes.map((size) => {
                        const stock = productSizes.find((row) => row.size === size)?.stock ?? 0;
                        const fieldName = `product_stock_${size}`;
                        return <label className="admin-stat-card" key={size}><span>Size {size}</span><input name={fieldName} type="number" min="0" step="1" defaultValue={stock} /><input type="hidden" name={`orig_${fieldName}`} value={stock} /></label>;
                      })}</div>
                      <p>Pre-orders placed before the end date never reduce stock. Enter the stock you have available for sales after the pre-order.</p>
                    </div>
                  )}
                  {product.status === "available" && !product.preorder_closes_at && <p className="admin-alert" role="note">No pre-order end date is set, so stock is not deducted.</p>}
                  <button className="button">Save product &amp; stock</button>
                </form>

                <form action={uploadProductPhotos} className="admin-photo-upload">
                  <div><span className="eyebrow">Product photos</span><h3>Upload images</h3></div>
                  <input type="hidden" name="product_id" value={product.id} />
                  <label>Choose photos<input type="file" name="photos" accept="image/*" multiple required /></label>
                  {variants.length > 0 && <label>Shirt style<select name="shirt_style" defaultValue=""><option value="">Campaign gallery</option>{variants.map((variant) => <option key={variant.id} value={variant.name}>{variant.name}</option>)}</select></label>}
                  <label>Photo view<select name="view" defaultValue=""><option value="">Campaign gallery / no view</option><option value="front">Front</option><option value="back">Back</option></select></label>
                  <button className="button button-outline">Upload photos</button>
                </form>
              </div>
            </details>
          );
        })}
      </section>
    </main>
  );
}

export default function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  return <Suspense fallback={<div className="section muted">Loading admin…</div>}><AdminRoute searchParams={searchParams} /></Suspense>;
}

async function AdminRoute({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; success?: string; cancelled?: string; days?: string }> }) {
  const { error, success } = await searchParams;
  return <AdminContent errorCode={error} success={success} />;
}
