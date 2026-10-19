import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import Countdown from "@/components/Countdown";
import HeroPointer from "@/components/HeroPointer";
import HeroSlideshow from "@/components/HeroSlideshow";
import LoginErrorBanner from "@/components/LoginErrorBanner";
import ProductCard from "@/components/ProductCard";
import { getProducts, isPreorderActive, isPreorderClosed } from "@/lib/data";
import { horizon } from "@/app/fonts";
function Loading() { return <div className="section muted">Loading WTNS collection…</div>; }
const heroImage = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-photos/child-of-god-hero.jpg`;
const storagePhoto = (filename: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-photos/${filename}.jpg`;
function HomeHero({ preorderClosed, preorderActive, images, preorderOpensAt, preorderClosesAt }: { preorderClosed: boolean; preorderActive: boolean; images: { src: string; alt: string }[]; preorderOpensAt: string | null; preorderClosesAt: string | null }) {
  const countdownDate = preorderActive ? preorderClosesAt : preorderOpensAt;
  const countdownLabel = preorderActive ? "Pre-orders close · Asia/Manila" : "Pre-orders open · Asia/Manila";
  return <section className={`hero${preorderClosed && !preorderActive ? " hero-preorder-open" : ""}`}>
    <HeroSlideshow images={images} />
    <div className="hero-overlay" aria-hidden="true" />
    <HeroPointer>
      <div className="hero-copy">
        <span className="eyebrow">Independent streetwear · Philippines</span>
        <h1 className={horizon.className}>WTNS.</h1>
        <p className="tagline">Witness To Nations’ Souls.<br />Wear what you stand for.</p>
        <div className="hero-actions">
          <Link className="button" href="/shop/child-of-god">Child Of God ↗</Link>
          <Link className="button button-outline" href="/shop">Explore collection</Link>
        </div>
      </div>
      {countdownDate && (preorderClosed || preorderActive) && <div className="hero-drop-countdown"><span className="eyebrow">{countdownLabel}</span><Countdown date={countdownDate} /></div>}
    </HeroPointer>
  </section>;
}
async function HomeContent() {
  const products = await getProducts();
  const cog = products.find((p) => p.slug === "child-of-god") ?? products[1];
  const eye = products.find((p) => p.slug === "eye-witness") ?? products[0];
  const closed = isPreorderClosed(cog);
  const preorderActive = isPreorderActive(cog);
  const releaseBadge = closed ? "Coming Soon" : preorderActive ? "Pre-Order Open" : "Now Available";
  const campaignPhoto = (filename: string) => cog.product_images.find((photo) =>
    new RegExp(`/${filename}\\.(jpg|jpeg|png|webp)([?].*)?$`, "i").test(photo.url)
  )?.url;
  const SLIDE_POSITIONS: Record<string, string> = {
    "child-of-god-18": "center 25%",
    "child-of-god-19": "center 30%",
    "child-of-god-back-standard": "center 35%",
  };
  const requestedSlides = [
    { src: campaignPhoto("child-of-god-18") ?? storagePhoto("child-of-god-18"), alt: "Child Of God campaign photo 18" },
    { src: campaignPhoto("child-of-god-19") ?? storagePhoto("child-of-god-19"), alt: "Child Of God campaign photo 19" },
    { src: heroImage, alt: "Original Child Of God hero photo" },
    { src: campaignPhoto("child-of-god-back-standard"), alt: "Child Of God Standard shirt back photo" },
  ].filter((photo): photo is { src: string; alt: string } => !!photo.src);
  const campaignSlides = requestedSlides.map((photo) => {
    const filename = decodeURIComponent(new URL(photo.src).pathname.split("/").pop() ?? "");
    const key = filename.replace(/\.[^.]+$/, "").toLowerCase();
    const objectPosition = SLIDE_POSITIONS[key];
    return objectPosition ? { ...photo, objectPosition } : photo;
  });
  const heroSlides = closed
    ? cog.teaser_image_url ? [{ src: cog.teaser_image_url, alt: "Child Of God sneak peek" }] : []
    : campaignSlides.length ? campaignSlides : [{ src: heroImage, alt: "WTNS Child Of God campaign photo" }];
  const featureImage = closed ? cog.teaser_image_url : cog.product_images[0]?.url ?? cog.teaser_image_url;

  return <>
    <HomeHero preorderClosed={closed} preorderActive={preorderActive} images={heroSlides} preorderOpensAt={cog.preorder_opens_at} preorderClosesAt={cog.preorder_closes_at} />
    <section className="section">
      <div className="section-heading"><div><span className="eyebrow">Featured release / 02</span><h2>CHILD OF GOD</h2></div><span className="badge">{releaseBadge}</span></div>
      <div className="feature"><div className="feature-image">{featureImage && <Image src={featureImage} alt={cog.name} fill sizes="(max-width:760px) 100vw, 60vw" />}</div><div className="feature-copy"><span className="eyebrow">{closed ? "Release countdown" : "The full release"}</span><h3>{closed ? "A new chapter is coming." : cog.name}</h3><p>{cog.description}</p><Link className="button" href={`/shop/${cog.slug}`}>{closed ? "View the teaser" : "Explore release"}</Link></div></div>
    </section>
    <section className="section"><div className="section-heading"><div><span className="eyebrow">Archive / 01</span><h2>EYE WITNESS</h2></div><span className="badge">Sold Out</span></div><div className="product-grid"><ProductCard product={eye}/></div></section>
  </>;
}
export default function Home() { return <><Suspense fallback={null}><LoginErrorBanner /></Suspense><Suspense fallback={<Loading/>}><HomeContent/></Suspense></>; }
