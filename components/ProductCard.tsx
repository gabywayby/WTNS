import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/data";
import { isPreorderClosed, isPreorderEnded } from "@/lib/data";
export default function ProductCard({ product }: { product: Product }) {
  const closed = isPreorderClosed(product);
  const ended = isPreorderEnded(product);
  const badge = product.status === "sold_out" ? "Sold Out" : closed ? "Coming Soon" : ended ? "Pre-Order Ended" : "Pre-Order Open";
  const src = closed || product.status === "sold_out"
    ? product.teaser_image_url ?? product.product_images[0]?.url
    : product.product_images[0]?.url ?? product.teaser_image_url;
  const startingPrice = product.product_variants.length ? Math.min(...product.product_variants.map((variant) => variant.price_php)) : product.price_php;
  return <Link href={`/shop/${product.slug}`} className="product-card"><div className="product-image">{src && <Image src={src} alt={product.name} fill sizes="(max-width:760px) 100vw, 50vw" />}</div><div className="product-meta"><div><h3>{product.name}</h3><span className="muted">{product.product_variants.length ? "From " : ""}₱{startingPrice.toLocaleString("en-PH")}</span></div><span className="badge">{badge}</span></div></Link>;
}
