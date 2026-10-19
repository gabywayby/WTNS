import { Suspense } from "react";
import ProductCard from "@/components/ProductCard";
import { getProducts } from "@/lib/data";
async function ShopContent() { const products = await getProducts(); return <div className="section"><div className="section-heading"><div><span className="eyebrow">WTNS / Current collection</span><h1 className="page-title">SHOP</h1></div><span className="label">Two releases · One purpose</span></div><div className="product-grid">{products.map((p)=><ProductCard key={p.id} product={p}/>)}</div></div>; }
export default function Shop() { return <Suspense fallback={<div className="section muted">Loading collection…</div>}><ShopContent/></Suspense>; }
