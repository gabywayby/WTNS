import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type ProductVariant = { id: string; name: string; price_php: number; variant_stock: { size: string; stock: number }[] };
export type ProductImage = { id: string; url: string; sort_order: number; shirt_style: string | null; view: "front" | "back" | null };
export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price_php: number;
  status: "upcoming" | "available" | "sold_out";
  preorder_opens_at: string | null;
  preorder_closes_at: string | null;
  teaser_image_url: string | null;
  product_images: ProductImage[];
  product_sizes: { size: string; stock: number }[];
  product_variants: ProductVariant[];
};

const productSelection = "*, product_sizes(size,stock), product_variants(id,name,price_php,variant_stock(size,stock))";

async function attachVisibleImages(supabase: Awaited<ReturnType<typeof createClient>>, products: Product[]) {
  let isAdmin = false;
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: admin, error } = await supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (error) throw new Error("Product gallery access could not be checked.");
    isAdmin = !!admin;
  }
  return Promise.all(products.map(async (product) => {
    const preorderClosed = isPreorderClosed(product);
    if (preorderClosed && !isAdmin) return product;
    const { data: photos, error } = await supabase.from("product_images").select("id,url,sort_order,shirt_style,view").eq("product_id", product.id).order("sort_order");
    if (error) throw new Error("Product photos could not be loaded.");
    return { ...product, product_images: photos ?? [] };
  }));
}

async function loadProducts(): Promise<Product[]> {
  await connection();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("products").select(productSelection).order("created_at");
    if (error) throw error;
    return await attachVisibleImages(supabase, (data ?? []).map((item) => ({
      ...item,
      product_images: [],
      product_sizes: item.product_sizes ?? [],
      product_variants: item.product_variants ?? [],
    }) as Product));
  } catch {
    throw new Error("The WTNS collection could not be loaded. Refresh the page to try again.");
  }
}

async function loadProduct(slug: string): Promise<Product | null> {
  await connection();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("products").select(productSelection).eq("slug", slug).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const product = {
      ...data,
      product_images: [],
      product_sizes: data.product_sizes ?? [],
      product_variants: data.product_variants ?? [],
    } as Product;
    return (await attachVisibleImages(supabase, [product]))[0];
  } catch {
    throw new Error("This WTNS product could not be loaded. Refresh the page to try again.");
  }
}

export const getProducts = cache(loadProducts);
export const getProduct = cache(loadProduct);

export function isPreorderClosed(product: Product) {
  return product.status === "upcoming" || (product.status === "available" && !!product.preorder_opens_at && new Date(product.preorder_opens_at).getTime() > Date.now());
}

export function isOrderable(product: Pick<Product, "status" | "preorder_opens_at">) {
  return product.status === "available" && (!product.preorder_opens_at || new Date(product.preorder_opens_at).getTime() <= Date.now());
}

export function isPreorderActive(product: Pick<Product, "status" | "preorder_opens_at" | "preorder_closes_at">) {
  const now = Date.now();
  const hasOpened = !product.preorder_opens_at || new Date(product.preorder_opens_at).getTime() <= now;
  const hasNotClosed = !product.preorder_closes_at || new Date(product.preorder_closes_at).getTime() > now;
  return product.status === "available" && hasOpened && hasNotClosed;
}

export function isPreorderEnded(product: Pick<Product, "status" | "preorder_closes_at">) {
  return product.status === "available" && !!product.preorder_closes_at && new Date(product.preorder_closes_at).getTime() <= Date.now();
}
