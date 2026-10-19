"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isOrderable } from "@/lib/data";
export type CheckoutState = { error?: string; success?: string };
export async function placeOrder(_state: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const slug=String(formData.get("slug")??""); const size=String(formData.get("size")??""); const variant_id=String(formData.get("variant_id")??"");
  const payment_method=String(formData.get("payment_method")??"");
  const quantity=Number(formData.get("quantity")); const full_name=String(formData.get("full_name")??"").trim(); const phone=String(formData.get("phone")??"").trim();
  const addressParts=["street","barangay","city","province","postal_code"].map((k)=>String(formData.get(k)??"").trim()); const receiptFile=formData.get("receipt_file");
  const validReceipt=receiptFile instanceof File && receiptFile.size>0 && receiptFile.size<=4*1024*1024 && receiptFile.type==="image/jpeg";
  const receiptHeader = validReceipt && receiptFile instanceof File
    ? new Uint8Array(await receiptFile.slice(0, 3).arrayBuffer())
    : null;
  const receiptSignatureValid = receiptHeader?.length === 3
    && receiptHeader[0] === 0xff && receiptHeader[1] === 0xd8 && receiptHeader[2] === 0xff;
  if (!slug || !size || !["gotyme","cod"].includes(payment_method) || !Number.isInteger(quantity) || quantity<1 || quantity>5 || !full_name || full_name.length>120 || !phone || phone.length>40 || addressParts.some((v)=>!v||v.length>150) || (payment_method==="gotyme"&&(!validReceipt||!receiptSignatureValid))) return {error:payment_method==="gotyme"&&(!validReceipt||!receiptSignatureValid)?"Upload a JPEG receipt screenshot (maximum 4 MB).":"Please complete every field with valid details."};
  try {
    const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) return {error:"Sign in before placing an order."};
    const {data:admin}=await supabase.from("admins").select("user_id").eq("user_id",user.id).maybeSingle(); if(admin) return {error:"Admin accounts cannot place customer orders."};
    const {data:product,error:productError}=await supabase.from("products").select("id,price_php,status,preorder_opens_at,product_variants(id)").eq("slug",slug).single();
    if(productError||!product) return {error:"We couldn't find this product."};
    if(!isOrderable(product)) return {error:"Pre-orders are not open yet."};
    const variants=product.product_variants as {id:string}[];
    if(variants.length>0&&!variants.some((variant)=>variant.id===variant_id)) return {error:"Please choose a valid shirt style."};
    let receiptPath: string | null = null;
    if(payment_method==="gotyme"&&receiptFile instanceof File){
      const extension="jpg";
      receiptPath=`${user.id}/${crypto.randomUUID()}.${extension}`;
      const {error:uploadError}=await supabase.storage.from("payment-receipts").upload(receiptPath,receiptFile,{contentType:receiptFile.type,upsert:false});
      if(uploadError)return {error:"We couldn't upload your receipt. Please try again."};
    }
    try { await supabase.rpc("wtns_release_expired_orders"); } catch { /* expired holds are best-effort cleanup */ }
    const {error}=await supabase.from("orders").insert({user_id:user.id,product_id:product.id,variant_id:variant_id||null,size,quantity,full_name,phone,address:addressParts.join(", "),payment_method,payment_reference:null,receipt_path:receiptPath});
    if(error){if(receiptPath)await supabase.storage.from("payment-receipts").remove([receiptPath]);return {error:/stock|enough/i.test(error.message)?"That size is out of stock or the available quantity changed. Please choose another size or reduce the quantity.":/pending orders/i.test(error.message)?"You already have 3 pending orders. Please wait for them to be confirmed or cancel one before ordering again.":"We couldn't place the order. Please check your details and try again."};}
    revalidatePath("/orders"); return {success:`/orders?placed=${encodeURIComponent(slug)}`};
  } catch { return {error:"Something went wrong while placing your order."}; }
}
