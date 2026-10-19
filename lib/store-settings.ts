import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getStoreSettings() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("store_settings").select("shipping_php,hold_hours").eq("singleton", true).single();
  if (error || !data) throw new Error("Store shipping settings could not be loaded.");
  return { shippingFee: data.shipping_php, holdHours: data.hold_hours };
}

export async function getShippingFee() {
  return (await getStoreSettings()).shippingFee;
}
