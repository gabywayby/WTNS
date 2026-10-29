"use client";
import "./checkout.css";
import Image from "next/image";
import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import { placeOrder } from "../actions";
import type { CheckoutState } from "../actions";
import { GOTYME, isCustomerVisibleValue } from "@/lib/config";

type StockSize = { size: string; stock: number };
type Variant = { id: string; name: string; price_php: number; variant_stock: StockSize[] };
type Fields = { full_name: string; phone: string; street: string; barangay: string; city: string; province: string; postal_code: string };

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL"];
const rank = (size: string) => { const i = SIZE_ORDER.indexOf(size); return i === -1 ? 99 : i; };
const peso = (n: number) => `₱${n.toLocaleString("en-PH")}`;

function resizeReceipt(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    image.onerror = () => { cleanup(); reject(new Error("Image could not be read")); };
    image.onload = () => {
      try {
        const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          cleanup();
          if (!blob) { reject(new Error("Image could not be encoded")); return; }
          resolve(new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg", lastModified: file.lastModified }));
        }, "image/jpeg", 0.8);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    image.src = objectUrl;
  });
}

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="co-copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch { /* clipboard not available */ }
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function StepHead({ n, title, hint }: { n: string; title: string; hint?: string }) {
  return (
    <div className="co-step-head">
      <span className="co-step-num">{n}</span>
      <h2 className="co-step-title">{title}</h2>
      {hint && <span className="co-step-hint">{hint}</span>}
    </div>
  );
}

export default function CheckoutForm({ slug, productName, sizes, variants, price, shipping, holdHours, preorderEnded, initialVariantId, initialSize }: {
  slug: string; productName: string; sizes: StockSize[]; variants: Variant[]; price: number; shipping: number; holdHours: number; preorderEnded: boolean; initialVariantId?: string; initialSize?: string;
}) {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(placeOrder, {});
  const styles = useMemo(() => [...variants].sort((a, b) => a.price_php - b.price_php), [variants]);

  const [variantId, setVariantId] = useState(styles.some((v) => v.id === initialVariantId) ? initialVariantId! : styles[0]?.id ?? "");
  const variant = styles.find((v) => v.id === variantId);
  const sizeOptions = useMemo(() => [...(variant?.variant_stock ?? sizes)].sort((a, b) => rank(a.size) - rank(b.size) || a.size.localeCompare(b.size)), [variant, sizes]);

  const [selectedSize, setSelectedSize] = useState(() => {
    const pool = styles.find((v) => v.id === initialVariantId)?.variant_stock ?? (styles.length ? [] : sizes);
    return pool.some((s) => s.size === initialSize && (!preorderEnded || s.stock > 0)) ? initialSize ?? "" : "";
  });
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<"gotyme" | "cod">("gotyme");
  const [fields, setFields] = useState<Fields>({ full_name: "", phone: "", street: "", barangay: "", city: "", province: "", postal_code: "" });
  const [receiptError, setReceiptError] = useState("");

  const selectedStock = sizeOptions.find((s) => s.size === selectedSize)?.stock ?? 0;
  const maxQty = preorderEnded ? Math.min(5, selectedStock) : 5;
  const qty = Math.min(quantity, Math.max(1, maxQty));
  const itemPrice = variant?.price_php ?? price;
  const itemTotal = itemPrice * qty;
  const total = itemTotal + shipping;

  useEffect(() => { if (state.success) window.location.assign(state.success); }, [state.success]);

  const chooseStyle = (id: string) => {
    setVariantId(id);
    const next = styles.find((v) => v.id === id)?.variant_stock ?? [];
    setSelectedSize((current) => (next.some((s) => s.size === current && (!preorderEnded || s.stock > 0)) ? current : ""));
    setQuantity(1);
  };
  const field = (key: keyof Fields) => ({ name: key, value: fields[key], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setFields((current) => ({ ...current, [key]: event.target.value })) });

  // Keep form state intact after a failed order so customers don't need to re-enter details or reselect a receipt.
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const receipt = data.get("receipt_file");
    if (receipt instanceof File && receipt.size > 0) {
      try {
        data.set("receipt_file", await resizeReceipt(receipt));
        setReceiptError("");
      } catch {
        setReceiptError("We couldn't read that image. Choose another receipt image and try again.");
        return;
      }
    }
    startTransition(() => action(data));
  };

  return (
    <form onSubmit={handleSubmit} className="co-layout">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="quantity" value={qty} />

      <div className="co-main">
        {/* 01 — what they're buying */}
        <section className="co-step">
          <StepHead n="01" title="Your order" />
          {styles.length > 0 && (
            <fieldset className="co-group">
              <legend>Style</legend>
              <div className="co-styles">
                {styles.map((v) => (
                  <label className="co-choice" key={v.id}>
                    <input type="radio" name="variant_id" value={v.id} checked={variantId === v.id} onChange={() => chooseStyle(v.id)} required />
                    <span className="co-style"><strong>{v.name}</strong><span>{peso(v.price_php)}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset className="co-group">
            <legend>Size</legend>
            <div className="co-sizes">
              {sizeOptions.map((s) => (
                <label className="co-choice" key={s.size}>
                  <input type="radio" name="size" value={s.size} checked={selectedSize === s.size} onChange={() => { setSelectedSize(s.size); setQuantity(1); }} required disabled={preorderEnded && s.stock < 1} />
                  <span className="co-size">{s.size}{preorderEnded && s.stock < 1 && <small>Out of stock</small>}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {preorderEnded && <p className="co-note">{paymentMethod === "gotyme" ? `Your size is held for you for ${holdHours} hours while we confirm your payment.` : "Your size is held for you. Pay in cash on delivery."}</p>}
          <div className="co-group">
            <span className="co-legend">Quantity</span>
            <div className="co-qty" role="group" aria-label="Quantity">
              <button type="button" aria-label="One less" onClick={() => setQuantity(Math.max(1, qty - 1))} disabled={qty <= 1}>−</button>
              <output aria-live="polite">{qty}</output>
              <button type="button" aria-label="One more" onClick={() => setQuantity(Math.min(maxQty, qty + 1))} disabled={qty >= maxQty}>+</button>
            </div>
          </div>
        </section>

        {/* 02 — delivery */}
        <section className="co-step">
          <StepHead n="02" title="Delivery" hint="Philippines only" />
          <div className="co-fields">
            <label className="co-field co-wide">Full name<input {...field("full_name")} required maxLength={120} autoComplete="name" /></label>
            <label className="co-field co-wide">Phone number<input {...field("phone")} type="tel" inputMode="tel" required maxLength={40} autoComplete="tel" placeholder="09XX XXX XXXX" /></label>
            <label className="co-field co-wide">Street / House no.<input {...field("street")} required maxLength={150} autoComplete="address-line1" /></label>
            <label className="co-field">Barangay<input {...field("barangay")} required maxLength={150} autoComplete="address-line2" /></label>
            <label className="co-field">City / Municipality<input {...field("city")} required maxLength={150} autoComplete="address-level2" /></label>
            <label className="co-field">Province<input {...field("province")} required maxLength={150} autoComplete="address-level1" /></label>
            <label className="co-field">Postal code<input {...field("postal_code")} required maxLength={20} inputMode="numeric" autoComplete="postal-code" /></label>
          </div>
        </section>

        {/* 03 — payment */}
        <section className="co-step">
          <StepHead n="03" title="Payment" />
          <fieldset className="co-group">
            <legend>Choose payment method</legend>
            <div className="co-styles">
              <label className="co-choice">
                <input type="radio" name="payment_method" value="gotyme" checked={paymentMethod === "gotyme"} onChange={() => setPaymentMethod("gotyme")} />
                <span className="co-style"><strong>GoTyme</strong><span>Pay by bank transfer</span></span>
              </label>
              <label className="co-choice">
                <input type="radio" name="payment_method" value="cod" checked={paymentMethod === "cod"} onChange={() => setPaymentMethod("cod")} />
                <span className="co-style"><strong>Cash on delivery</strong><span>Pay when your order arrives</span></span>
              </label>
            </div>
          </fieldset>
          <div className="co-amount">
            <span>{paymentMethod === "gotyme" ? "Send exactly" : "Due on delivery"}</span>
            <strong>{peso(total)}</strong>
            <small>{qty > 1 ? `${qty} × ${peso(itemPrice)}` : peso(itemPrice)} + {peso(shipping)} shipping</small>
          </div>
          {paymentMethod === "gotyme" ? (
            <>
              <div className="co-gotyme">
                <div className="co-gotyme-copy">
                  <span className="co-method-label">GoTyme</span>
                  {isCustomerVisibleValue(GOTYME.accountName) && <strong>{GOTYME.accountName}</strong>}
                  {isCustomerVisibleValue(GOTYME.accountNumber) && <div className="co-copyrow"><span>{GOTYME.accountNumber}</span><CopyButton value={GOTYME.accountNumber} /></div>}
                  {isCustomerVisibleValue(GOTYME.qrDownload) && <a className="co-copy co-qr-download" href={GOTYME.qrDownload}>Save QR image</a>}
                </div>
                {isCustomerVisibleValue(GOTYME.qrImage) && <div className="co-qr-frame"><Image src={GOTYME.qrImage} alt="WTNS GoTyme QR code" width={240} height={240} unoptimized /></div>}
              </div>
              <label className="co-field co-wide">Upload payment receipt screenshot
                <input name="receipt_file" type="file" accept="image/jpeg,image/png,image/webp" required />
              </label>
              <p className="co-note">Send the payment first, then upload a clear screenshot of the receipt. Your order stays pending until we confirm it.</p>
            </>
          ) : (
            <p className="co-note">No payment reference is needed for cash on delivery. Please have the total ready when your order arrives.</p>
          )}
        </section>
      </div>

      {/* summary + submit */}
      <aside className="co-summary">
        <span className="co-eyebrow">Order summary</span>
        <h2>{productName}</h2>
        <p className="co-summary-item">
          {variant ? `${variant.name} · ` : ""}{selectedSize ? `Size ${selectedSize}` : <em>Choose a size</em>} × {qty}
        </p>
        <dl className="co-lines">
          <div><dt>{qty > 1 ? `${qty} × ${peso(itemPrice)}` : "Item"}</dt><dd>{peso(itemTotal)}</dd></div>
          <div><dt>Shipping</dt><dd>{peso(shipping)}</dd></div>
          <div className="co-total"><dt>Total</dt><dd>{peso(total)}</dd></div>
        </dl>
        {(receiptError || state.error) && <p className="co-error" role="alert">{receiptError || state.error}</p>}
        <button className="co-submit" disabled={pending || (preorderEnded && (!selectedSize || selectedStock < 1))}>{pending ? "Placing order…" : `Place order · ${peso(total)}`}</button>
        <p className="co-fine">{paymentMethod === "gotyme" ? "Pay by GoTyme transfer (step 03)." : "Pay cash when your order arrives."}</p>
      </aside>
    </form>
  );
}
