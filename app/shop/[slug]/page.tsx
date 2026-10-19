import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ChildOfGodProduct from "@/components/ChildOfGodProduct";
import Countdown from "@/components/Countdown";
import LoginButton from "@/components/LoginButton";
import { getProduct, isOrderable, isPreorderActive, isPreorderClosed, isPreorderEnded } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { SOCIALS } from "@/lib/config";

const peso = (amount: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(amount);

async function ProductContent({ slug }: { slug: string }) {
  const product = await getProduct(slug);
  if (!product) notFound();

  const preorderClosed = isPreorderClosed(product);
  const preorderActive = isPreorderActive(product);
  const preorderEnded = isPreorderEnded(product);
  const orderable = isOrderable(product);
  if (product.slug === "child-of-god") {
    let signedIn = false;
    let isAdmin = false;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      signedIn = !!user;
      if (user) isAdmin = !!(await supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle()).data;
    } catch { /* login route explains configuration if needed */ }
    return <div className="product-page"><div className="breadcrumbs"><Link href="/shop">Shop</Link> / {product.name}</div><ChildOfGodProduct product={product} variants={product.product_variants} signedIn={signedIn} isAdmin={isAdmin} preorderClosed={preorderClosed} preorderActive={preorderActive} preorderEnded={preorderEnded} orderable={orderable} instagramUrl={SOCIALS.instagram} /></div>;
  }

  let signedIn = false;
  let isAdmin = false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    signedIn = !!user;
    if (user) isAdmin = !!(await supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle()).data;
  } catch { /* login route explains configuration if needed */ }
  const images = preorderClosed && product.status !== "sold_out"
    ? (product.teaser_image_url ? [product.teaser_image_url] : [])
    : product.product_images.length
      ? product.product_images.map((photo) => photo.url)
      : product.teaser_image_url
        ? [product.teaser_image_url]
        : [];
  const minPrice = product.product_variants.length ? Math.min(...product.product_variants.map((variant) => variant.price_php)) : product.price_php;
  return <div className="product-page"><div className="breadcrumbs"><Link href="/shop">Shop</Link> / {product.name}</div><div className="detail-grid"><div className="gallery">{images.map((url, index) => <figure key={`${url}-${index}`}><Image src={url} alt={`${product.name} view ${index + 1}`} fill sizes="(max-width:760px) 100vw, 40vw" priority={index === 0} /></figure>)}</div><div className="detail-copy"><span className="eyebrow">WTNS / {product.status === "sold_out" ? "Archive" : preorderClosed ? "Upcoming release" : "Current release"}</span><h1>{product.name}</h1><div className="price">{product.product_variants.length ? `From ${peso(minPrice)}` : peso(product.price_php)}</div><p>{product.description}</p>{product.status === "sold_out" ? <span className="badge detail-status-badge">Sold Out</span> : preorderClosed ? <><div className="notice">Pre-orders have not opened yet.</div>{product.preorder_opens_at && <Countdown date={product.preorder_opens_at} />}</> : isAdmin ? <Link className="button button-outline" href="/orders">View customer orders</Link> : signedIn ? <Link className="button" href={`/checkout/${product.slug}`}>Choose style &amp; size</Link> : <LoginButton next={`/checkout/${product.slug}`} />}</div></div></div>;
}

export default function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  return <Suspense fallback={<div className="section muted">Loading release…</div>}><ProductRoute params={params} /></Suspense>;
}

async function ProductRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ProductContent slug={slug} />;
}
