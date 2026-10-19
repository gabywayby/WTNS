// TODO: Replace these launch placeholders in one place before opening the store.
export const BRAND = { name: "WTNS", tagline: "Witness To Nations' Souls" };
const STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-photos`;
export const GOTYME = {
  accountName: "GABRIEL DAN ALOJADO DELAMIN",
  accountNumber: "016372289757",
  qrImage: `${STORAGE}/payment/gotyme-qr.png`,
  qrDownload: `${STORAGE}/payment/gotyme-qr.png?download=gotyme-qr.png`,
};
export const SOCIALS = { instagram: "https://instagram.com/", facebook: "https://facebook.com/", tiktok: "https://tiktok.com/" };
export const CONTACT_EMAIL = "hello@example.com"; // TODO: Set your support email.
export const PREORDER_INFO = "";

export function isCustomerVisibleValue(value: string | null | undefined): value is string {
  if (!value?.trim() || /\bTODO\b/i.test(value) || /example\.com/i.test(value)) return false;
  try {
    const url = new URL(value);
    if (["instagram.com", "www.instagram.com", "facebook.com", "www.facebook.com", "tiktok.com", "www.tiktok.com"].includes(url.hostname) && url.pathname === "/") return false;
  } catch {
    // Non-URL values such as account names and numbers are valid configuration too.
  }
  return true;
}
