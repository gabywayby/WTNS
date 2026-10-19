import { readFileSync } from "node:fs";

function readEnvValue(name) {
  const line = readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`));
  if (!line) return undefined;
  const value = line.slice(line.indexOf("=") + 1).trim();
  return value.replace(/^(['"])(.*)\1$/, "$2");
}

const supabaseUrl = readEnvValue("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = readEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!supabaseUrl || !anonKey) {
  console.error("Missing Supabase URL or anon key in .env.local.");
  process.exit(1);
}

async function getRows(table, query) {
  const url = new URL(`/rest/v1/${table}`, supabaseUrl);
  url.search = new URLSearchParams(query).toString();
  const response = await fetch(url, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  if (!response.ok) {
    console.error(`Supabase visibility check failed (HTTP ${response.status}).`);
    process.exit(1);
  }
  return response.json();
}

const products = await getRows("products", {
  select: "id,status,preorder_opens_at",
  slug: "eq.child-of-god",
});
const product = products[0];
if (!product) {
  console.error("Child Of God product was not found.");
  process.exit(1);
}

const closed = product.status === "upcoming"
  || (product.status === "available" && product.preorder_opens_at
    && new Date(product.preorder_opens_at).getTime() > Date.now());
if (!closed) {
  console.error("Child Of God is not currently in a closed pre-order state; visibility assertion was not run.");
  process.exit(2);
}

const photos = await getRows("product_images", {
  select: "url",
  product_id: `eq.${product.id}`,
});
if (photos.length !== 0) {
  console.error(`Expected no public Child Of God gallery rows before launch; received ${photos.length}.`);
  process.exit(1);
}

console.log("PASS: logged-out anon request returned [] for Child Of God gallery photos while pre-orders are closed.");
