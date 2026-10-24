"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Countdown from "@/components/Countdown";
import type { Product, ProductVariant } from "@/lib/data";
import { PREORDER_INFO } from "@/lib/config";

type Props = {
  product: Product;
  variants: ProductVariant[];
  signedIn: boolean;
  isAdmin: boolean;
  preorderClosed: boolean;
  preorderActive: boolean;
  preorderEnded: boolean;
  orderable: boolean;
  instagramUrl: string;
};

const peso = (amount: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(amount);
const sizeOrder = ["S", "M", "L", "XL"];
const sizeRank = (size: string) => { const index = sizeOrder.indexOf(size); return index < 0 ? sizeOrder.length : index; };

function manilaDate(date: string | null) {
  if (!date) return "Date to be announced";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(new Date(date));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("month")} ${part("day")}, ${part("year")} · ${part("hour")}:${part("minute")} ${part("dayPeriod")} Manila`;
}

export default function ChildOfGodProduct({ product, variants, signedIn, isAdmin, preorderClosed, preorderActive, preorderEnded, orderable, instagramUrl }: Props) {
  const router = useRouter();
  const orderedVariants = [...variants].sort((a, b) => Number(!/standard/i.test(a.name)) - Number(!/standard/i.test(b.name)));
  const [variantId, setVariantId] = useState(orderedVariants[0]?.id ?? "");
  const [view, setView] = useState<"front" | "back">("front");
  const [size, setSize] = useState("");
  const teaserOnly = preorderClosed && !isAdmin && product.status !== "sold_out";
  const variant = orderedVariants.find((item) => item.id === variantId) ?? orderedVariants[0];
  const sizes = [...(variant?.variant_stock ?? [])].sort((a, b) => sizeRank(a.size) - sizeRank(b.size));
  const photos = product.product_images.filter((photo) => photo.shirt_style === variant?.name && photo.view);
  const orderedPhotos = (["front", "back"] as const).flatMap((side) => photos.filter((photo) => photo.view === side));
  const mainPhoto = photos.find((photo) => photo.view === view) ?? orderedPhotos[0];
  const displayedView = mainPhoto?.view ?? view;
  const teaserPhoto = product.product_images.find((photo) => photo.url === product.teaser_image_url);
  const modelPhoto = mainPhoto ?? teaserPhoto;
  const modelImageName = (modelPhoto?.url ?? product.teaser_image_url ?? "").toLowerCase();
  const modelStyle = modelPhoto?.shirt_style ?? (/heavy/i.test(modelImageName) ? "heavy" : variant?.name ?? "");
  const modelView = modelPhoto?.view ?? (/back/i.test(modelImageName) ? "back" : displayedView);
  const modelDetails = /standard/i.test(modelStyle)
    ? modelView === "front" ? { name: "Mada", height: "5′5″", size: "Small" } : { name: "Keanna", height: "5′7″", size: "Small" }
    : { name: "Pepe", height: "5′8″", size: "Large" };
  const galleryPhotos = product.product_images;
  const orderHref = `/checkout/${product.slug}?variant=${encodeURIComponent(variant?.id ?? "")}&size=${encodeURIComponent(size)}`;
  const orderUrl = signedIn ? orderHref : `/login?next=${encodeURIComponent(orderHref)}`;
  const availableSizes = sizes.map((item) => item.size);
  const dropStatus = preorderClosed && product.status !== "sold_out"
    ? <section className="cog-drop-status" aria-label="Pre-order opening time"><span className="eyebrow">Pre-orders open</span><p>{manilaDate(product.preorder_opens_at)}</p>{product.preorder_opens_at && <div className="cog-countdown"><Countdown date={product.preorder_opens_at} /></div>}</section>
    : preorderActive && product.preorder_closes_at
      ? <section className="cog-drop-status" aria-label="Pre-order closing time"><span className="eyebrow">Pre-orders close</span><p>{manilaDate(product.preorder_closes_at)}</p><div className="cog-countdown"><Countdown date={product.preorder_closes_at} /></div></section>
      : null;

  const heading = <>
    <span className="eyebrow">WTNS / {product.status === "sold_out" ? "Archive" : preorderClosed ? "Upcoming release" : "Current release"}</span>
    <h1>{product.name}</h1>
    {!teaserOnly && <><div className="cog-price">{variant ? peso(variant.price_php) : peso(product.price_php)}</div>{variant && <p className="cog-selected-style">{variant.name}</p>}</>}
    {product.status === "sold_out" && <span className="badge">Sold Out</span>}
  </>;
  return <>
    <div className="cog-product-layout">
      <header className="cog-mobile-intro">{heading}{dropStatus}</header>
      <section className="cog-gallery-column" aria-label={`${variant?.name ?? product.name} photos`}>
        {!teaserOnly && orderedVariants.length > 1 && <div className="cog-style-toggle" role="group" aria-label="Choose shirt style">
          {orderedVariants.map((item) => <button type="button" key={item.id} aria-pressed={variantId === item.id} className={variantId === item.id ? "is-active" : ""} onClick={() => { setVariantId(item.id); setView("front"); setSize(""); }}>{item.name}</button>)}
        </div>}
        <div className="cog-main-photo">
          {teaserOnly ? product.teaser_image_url ? <><Image src={product.teaser_image_url} alt={`${product.name} sneak peek`} fill sizes="(max-width:760px) 100vw, 40vw" priority />{!preorderClosed && <div className="cog-model-label" aria-label={`Model ${modelDetails.name}, height ${modelDetails.height}, wearing size ${modelDetails.size}`}><span>Model</span><strong>{modelDetails.name}</strong><span>Height {modelDetails.height}</span><span>Wearing size {modelDetails.size}</span></div>}</> : <div className="cog-photo-empty">Photos coming soon</div> : mainPhoto ? <><Image src={mainPhoto.url} alt={`${product.name} ${variant?.name ?? ""} ${displayedView}`} fill sizes="(max-width:760px) 100vw, 40vw" priority /><span className="photo-view-label">{displayedView}</span>{!preorderClosed && <div className="cog-model-label" aria-label={`Model ${modelDetails.name}, height ${modelDetails.height}, wearing size ${modelDetails.size}`}><span>Model</span><strong>{modelDetails.name}</strong><span>Height {modelDetails.height}</span><span>Wearing size {modelDetails.size}</span></div>}</> : <div className="cog-photo-empty">Photos coming soon</div>}
        </div>
        {!teaserOnly && orderedPhotos.length > 0 && <div className="cog-thumbnails" aria-label="Choose photo view">{orderedPhotos.map((photo) => <button type="button" key={photo.id} aria-label={`Show ${photo.view} photo`} aria-pressed={photo.id === mainPhoto?.id} onClick={() => setView(photo.view as "front" | "back")}><Image src={photo.url} alt={`${variant?.name ?? "Shirt"} ${photo.view}`} fill sizes="(max-width:760px) 46vw, 20vw" /><span className="photo-view-label">{photo.view}</span></button>)}</div>}
      </section>
      <aside className="cog-info-panel">
        <header className="cog-desktop-intro">{heading}</header>
        <div className="cog-info-body">
          <p className="cog-description">{product.description}</p>
          {teaserOnly && <ul className="cog-teaser-styles">{orderedVariants.map((item) => <li key={item.id}>{item.name} <span>{peso(item.price_php)}</span></li>)}</ul>}
          {dropStatus}
          {product.status === "sold_out" ? <button className="button" disabled>Sold Out</button> : preorderClosed ? <a className="button button-outline cog-follow" href={instagramUrl} target="_blank" rel="noreferrer">Follow for the drop</a> : isAdmin ? <div className="notice">Admin accounts manage customer orders from the Orders page.</div> : <>
            <div className="cog-size-picker" id="cog-size-picker"><span className="label">Select size</span><div className="cog-size-options">{availableSizes.map((sizeOption) => { const stock = sizes.find((item) => item.size === sizeOption)?.stock ?? 0; const outOfStock = preorderEnded && stock < 1; return <button type="button" key={sizeOption} aria-pressed={size === sizeOption} className={size === sizeOption ? "is-active" : ""} disabled={outOfStock} onClick={() => setSize(sizeOption)}>{sizeOption}{outOfStock && <small>Out</small>}</button>; })}</div><p className="cog-size-note">{preorderEnded ? "Only in-stock sizes can be ordered. Stock is deducted when the order is marked Paid." : "During the pre-order window, sizes are not limited by current stock."}</p></div>
            <button type="button" className="button cog-order-button" disabled={!orderable || !size} onClick={() => router.push(orderUrl)}>{preorderEnded ? "Order now" : "Pre-order now"}</button>
          </>}
          <div className="cog-accordions">
            <details><summary>Fit</summary><div className="cog-detail-copy"><p>Choose from these two shirt fits:</p><ul>{orderedVariants.map((item) => <li key={item.id}>{item.name}</li>)}</ul></div></details>
            <details><summary>Material</summary><div className="cog-brand-callout"><Image className="cog-brand-image" src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-photos/fruit-of-the-loom.png?v=4`} alt="Fruit of the Loom" width={180} height={72} unoptimized /><p>Made with original Fruit of the Loom® shirts.</p></div></details>
            <details><summary>Shipping</summary><p>Shipping is available within the Philippines only. The shipping fee is shown at checkout.</p></details>
            <details><summary>Payment</summary><div className="cog-payment-info"><p>Choose Cash on Delivery (COD) or GoTyme QR.</p></div></details>
            {!!PREORDER_INFO.trim() && <details><summary>Pre-order info</summary><p>{PREORDER_INFO}</p></details>}
          </div>
        </div>
      </aside>
    </div>
    {galleryPhotos.length > 0 && <section className="cog-campaign-gallery"><span className="eyebrow">Full gallery</span><div className="cog-campaign-grid">{galleryPhotos.map((photo, index) => <figure key={photo.id}><Image src={photo.url} alt={`${product.name}${photo.shirt_style ? ` — ${photo.shirt_style}` : ""}${photo.view ? ` ${photo.view}` : ` photo ${index + 1}`}`} fill sizes="(max-width:760px) 100vw, (max-width:1100px) 33vw, 20vw" />{(photo.shirt_style || photo.view) && <figcaption className="photo-view-label">{[photo.shirt_style, photo.view].filter(Boolean).join(" · ")}</figcaption>}</figure>)}</div></section>}
  </>;
}
