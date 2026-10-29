"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import sharp from "sharp";
async function adminClient(){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user) redirect("/");const {data}=await supabase.from("admins").select("user_id").eq("user_id",user.id).maybeSingle();if(!data) redirect("/");return supabase;}
export async function updateOrder(formData:FormData){const supabase=await adminClient();const id=String(formData.get("id")??"");const status=String(formData.get("status")??"");if(!id||!["pending","paid","shipped","delivered","completed","cancelled"].includes(status))return;const {data:order}=await supabase.from("orders").select("status").eq("id",id).maybeSingle();if(!order||order.status==="cancelled")return;const {data:updated,error}=await supabase.from("orders").update({status}).eq("id",id).neq("status","cancelled").select("id,status").maybeSingle();if(error||!updated){redirect(error&&/stock|enough/i.test(error.message)?"/orders?error=stock":"/orders?error=status-save");}revalidatePath("/admin");revalidatePath("/orders");redirect("/orders?saved=1");}
export async function deleteOrder(formData:FormData){const supabase=await adminClient();const id=String(formData.get("id")??"");if(!id)redirect("/orders?error=delete-order");const {data:deleted,error}=await supabase.from("orders").delete().eq("id",id).select("id,receipt_path").maybeSingle();if(error||!deleted)redirect("/orders?error=delete-order");if(deleted.receipt_path)await supabase.storage.from("payment-receipts").remove([deleted.receipt_path]);revalidatePath("/orders");}
export async function updateProduct(formData:FormData){
 const supabase=await adminClient();const id=String(formData.get("id")??"");const rawProductPrice=formData.get("price_php");const price=rawProductPrice===null?null:Number(rawProductPrice);const status=String(formData.get("status")??"");const rawDate=String(formData.get("preorder_opens_at")??"");const rawCloseDate=String(formData.get("preorder_closes_at")??"");const teaserUrl=String(formData.get("teaser_image_url")??"").trim();
 if(!id||!["upcoming","available","sold_out"].includes(status))return;
 const parsedDate=rawDate?new Date(`${rawDate}:00+08:00`):null;const parsedCloseDate=rawCloseDate?new Date(`${rawCloseDate}:00+08:00`):null;if((parsedDate&&Number.isNaN(parsedDate.getTime()))||(parsedCloseDate&&Number.isNaN(parsedCloseDate.getTime()))||(parsedDate&&parsedCloseDate&&parsedCloseDate<=parsedDate))redirect("/admin?error=product-save");
 const {data:variants,error:variantsError}=await supabase.from("product_variants").select("id,name").eq("product_id",id);if(variantsError)redirect("/admin?error=stock-save");
 const variantPrices=new Map<string,number>();
 if(variants?.length){
  for(const variant of variants){const raw=formData.get(`variant_price_${variant.id}`);const variantPrice=raw===null?NaN:Number(raw);if(!Number.isInteger(variantPrice)||variantPrice<0)redirect("/admin?error=product-save");variantPrices.set(variant.id,variantPrice);}
 }else if(price===null||!Number.isInteger(price)||price<0){redirect("/admin?error=product-save");}
 const basePrice=variants?.length
  ? variantPrices.get(variants.find((variant)=>variant.name.toLowerCase().includes("standard"))?.id??variants[0].id)!
  : price!;
 const {error}=await supabase.from("products").update({price_php:basePrice,status,preorder_opens_at:parsedDate?.toISOString()??null,preorder_closes_at:parsedCloseDate?.toISOString()??null,teaser_image_url:teaserUrl||null}).eq("id",id);if(error)redirect("/admin?error=product-save");
 for(const variant of variants??[]){const {error:priceError}=await supabase.from("product_variants").update({price_php:variantPrices.get(variant.id)}).eq("id",variant.id).eq("product_id",id);if(priceError)redirect("/admin?error=product-save");}
 if(variants?.length){
  for(const variant of variants){for(const size of ["S","M","L","XL","XXL"]){const fieldName=`variant_stock_${variant.id}_${size}`;const raw=formData.get(fieldName);const originalRaw=formData.get(`orig_${fieldName}`);if(raw===null||originalRaw===null)continue;const stock=Number(raw);const original=Number(originalRaw);if(!Number.isInteger(stock)||stock<0||!Number.isInteger(original)||original<0)redirect("/admin?error=stock-save");if(stock===original)continue;const {data:existing,error:readError}=await supabase.from("variant_stock").select("stock").eq("variant_id",variant.id).eq("size",size).maybeSingle();if(readError)redirect("/admin?error=stock-save");if(existing){const {data:updated,error:stockError}=await supabase.from("variant_stock").update({stock}).eq("variant_id",variant.id).eq("size",size).eq("stock",original).select("variant_id").maybeSingle();if(stockError)redirect("/admin?error=stock-save");if(!updated)redirect("/admin?error=stock-conflict");}else{const {error:insertError}=await supabase.from("variant_stock").insert({variant_id:variant.id,size,stock});if(insertError)redirect(/duplicate|unique/i.test(insertError.message)?"/admin?error=stock-conflict":"/admin?error=stock-save");}}}
 }else{
  for(const size of ["S","M","L","XL","XXL"]){const fieldName=`product_stock_${size}`;const raw=formData.get(fieldName);const originalRaw=formData.get(`orig_${fieldName}`);if(raw===null||originalRaw===null)continue;const stock=Number(raw);const original=Number(originalRaw);if(!Number.isInteger(stock)||stock<0||!Number.isInteger(original)||original<0)redirect("/admin?error=stock-save");if(stock===original)continue;const {data:existing,error:readError}=await supabase.from("product_sizes").select("stock").eq("product_id",id).eq("size",size).maybeSingle();if(readError)redirect("/admin?error=stock-save");if(existing){const {data:updated,error:stockError}=await supabase.from("product_sizes").update({stock}).eq("product_id",id).eq("size",size).eq("stock",original).select("product_id").maybeSingle();if(stockError)redirect("/admin?error=stock-save");if(!updated)redirect("/admin?error=stock-conflict");}else{const {error:insertError}=await supabase.from("product_sizes").insert({product_id:id,size,stock});if(insertError)redirect(/duplicate|unique/i.test(insertError.message)?"/admin?error=stock-conflict":"/admin?error=stock-save");}}
 }
 revalidatePath("/");revalidatePath("/admin");revalidatePath("/shop");revalidatePath("/shop/[slug]","page");
}

export async function updateShippingFee(formData:FormData){const supabase=await adminClient();const shipping=Number(formData.get("shipping_php"));if(!Number.isInteger(shipping)||shipping<0)redirect("/admin?error=shipping-save");const {error}=await supabase.from("store_settings").update({shipping_php:shipping,updated_at:new Date().toISOString()}).eq("singleton",true);if(error)redirect("/admin?error=shipping-save");revalidatePath("/admin");}

export async function updateHoldHours(formData:FormData){const supabase=await adminClient();const holdHours=Number(formData.get("hold_hours"));if(!Number.isInteger(holdHours)||holdHours<1||holdHours>720)redirect("/admin?error=hold-hours-save");const {error}=await supabase.from("store_settings").update({hold_hours:holdHours,updated_at:new Date().toISOString()}).eq("singleton",true);if(error)redirect("/admin?error=hold-hours-save");revalidatePath("/admin");revalidatePath("/orders");redirect("/admin?success=hold-hours-saved");}

export async function uploadProductPhotos(formData:FormData){
 const supabase=await adminClient();const productId=String(formData.get("product_id")??"");const files=formData.getAll("photos").filter((value):value is File=>value instanceof File&&value.size>0);
 const imageExtensions:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
 const shirtStyle=String(formData.get("shirt_style")??"").trim();const rawView=String(formData.get("view")??"");const view=rawView==="front"||rawView==="back"?rawView:null;
 if(!productId||files.length===0)redirect("/admin?error=photos-save");
 if(!(["", "front", "back"].includes(rawView)))redirect("/admin?error=photos-save");
 if(files.some(file=>!Object.hasOwn(imageExtensions,file.type)||file.size>8*1024*1024)||files.reduce((total,file)=>total+file.size,0)>16*1024*1024)redirect("/admin?error=photos-save");
 const {data:product,error:productError}=await supabase.from("products").select("id,product_variants(name)").eq("id",productId).maybeSingle();if(productError||!product)redirect("/admin?error=photos-save");
 const variantNames=(product.product_variants??[]).map((variant)=>variant.name);if(shirtStyle&&!variantNames.includes(shirtStyle))redirect("/admin?error=photos-save");
 const {data:lastPhoto,error:lastPhotoError}=await supabase.from("product_images").select("sort_order").eq("product_id",productId).order("sort_order",{ascending:false}).limit(1).maybeSingle();if(lastPhotoError)redirect("/admin?error=photos-save");
 let sortOrder=(lastPhoto?.sort_order??0)+1;
 for(const file of files){
  const isWebp=file.type==="image/webp";
  let imageData:Buffer;
  try{
   const image=sharp(await file.arrayBuffer()).rotate().resize({width:2000,height:2000,fit:"inside",withoutEnlargement:true});
   // Sharp strips metadata by default; orient pixels before removing EXIF.
   imageData=await (isWebp?image.webp({quality:80}):image.jpeg({quality:80})).toBuffer();
  }catch{redirect("/admin?error=photos-save");}
  const extension=isWebp?"webp":"jpg";
  const contentType=isWebp?"image/webp":"image/jpeg";
  const path=`${productId}/${crypto.randomUUID()}.${extension}`;
  const {error:uploadError}=await supabase.storage.from("product-photos").upload(path,imageData,{contentType,cacheControl:"31536000",upsert:false});
  if(uploadError)redirect("/admin?error=photos-save");
  const {data:{publicUrl}}=supabase.storage.from("product-photos").getPublicUrl(path);
  const {error:insertError}=await supabase.from("product_images").insert({product_id:productId,url:publicUrl,sort_order:sortOrder++,shirt_style:shirtStyle||null,view});
  if(insertError)redirect("/admin?error=photos-save");
 }
 revalidatePath("/admin");revalidatePath("/shop");
}

export async function cancelOldPendingOrders(formData:FormData){
 const supabase=await adminClient();const days=Number(formData.get("days"));if(!Number.isInteger(days)||days<1||days>3650)redirect("/orders?error=cancel-days");
 const cutoff=new Date(Date.now()-days*24*60*60*1000).toISOString();
 let query=supabase.from("orders").update({status:"cancelled"}).eq("status","pending").lt("created_at",cutoff);
 if(formData.get("include_preorders_cod")!=="on")query=query.eq("payment_method","gotyme").eq("is_preorder",false);
 const {data,error}=await query.select("id");
 if(error)redirect("/orders?error=cancel-orders");
 revalidatePath("/admin");revalidatePath("/orders");redirect(`/orders?cancelled=${data?.length??0}&days=${days}`);
}
