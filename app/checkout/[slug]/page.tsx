import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import "./checkout.css";
import CheckoutForm from "./CheckoutForm";
import LoginButton from "@/components/LoginButton";
import { getProduct, isOrderable, isPreorderEnded } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { getStoreSettings } from "@/lib/store-settings";

async function CheckoutContent({ slug, variantId, size }: { slug: string; variantId?: string; size?: string }) {
  const product = await getProduct(slug);
  if (!product) notFound();
  if (!isOrderable(product)) redirect(`/shop/${slug}`);
  const preorderEnded = isPreorderEnded(product);
  let storeSettings: { shippingFee: number; holdHours: number };
  try { storeSettings = await getStoreSettings(); } catch { return <div className="section"><h1 className="page-title">CHECKOUT UNAVAILABLE</h1><p className="error">Store settings could not be loaded. Please try again later.</p></div>; }
  let signedIn = false;
  let isAdmin = false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    signedIn = !!user;
    if (user) isAdmin = !!(await supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle()).data;
  } catch { /* show sign-in prompt */ }
  const next = `/checkout/${slug}?variant=${encodeURIComponent(variantId ?? "")}&size=${encodeURIComponent(size ?? "")}`;
  return (
    <div className="section">
      <div className="co">
        <Link className="co-back" href={`/shop/${slug}`}>← {product.name}</Link>
        <h1 className="co-title">Checkout</h1>
        {isAdmin ? (
          <div className="co-panel">
            <h2>Admin account</h2>
            <p>Admin accounts manage the store and cannot place customer orders.</p>
            <Link className="co-btn" href="/orders">View customer orders</Link>
          </div>
        ) : signedIn ? (
          <CheckoutForm slug={slug} productName={product.name} sizes={product.product_sizes} variants={product.product_variants} price={product.price_php} shipping={storeSettings.shippingFee} holdHours={storeSettings.holdHours} preorderEnded={preorderEnded} initialVariantId={variantId} initialSize={size} />
        ) : (
          <div className="co-panel">
            <h2>Sign in to order</h2>
            <p>We use Google sign-in so your orders are saved to your account and you can check their status any time.</p>
            <LoginButton next={next} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function CheckoutPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ variant?: string; size?: string }> }) {
  return <Suspense fallback={<div className="section muted">Loading checkout…</div>}><CheckoutRoute params={params} searchParams={searchParams}/></Suspense>;
}

async function CheckoutRoute({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ variant?: string; size?: string }> }) {
  const { slug } = await params;
  const { variant, size } = await searchParams;
  return <CheckoutContent slug={slug} variantId={variant} size={size}/>;
}
