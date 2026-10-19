import { BRAND, CONTACT_EMAIL, SOCIALS, isCustomerVisibleValue } from "@/lib/config";
import Link from "next/link";
import { horizon } from "@/app/fonts";
export default function SiteFooter() {
  return <footer className="site-footer"><div><Link className={`${horizon.className} wordmark`} href="/">{BRAND.name}</Link><p>{BRAND.tagline}</p></div><div className="footer-links">{isCustomerVisibleValue(SOCIALS.instagram) && <a href={SOCIALS.instagram} target="_blank" rel="noreferrer">Instagram ↗</a>}{isCustomerVisibleValue(SOCIALS.facebook) && <a href={SOCIALS.facebook} target="_blank" rel="noreferrer">Facebook ↗</a>}{isCustomerVisibleValue(SOCIALS.tiktok) && <a href={SOCIALS.tiktok} target="_blank" rel="noreferrer">TikTok ↗</a>}{isCustomerVisibleValue(CONTACT_EMAIL) && <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>}</div><small>© 2026 WTNS. Worn with purpose.</small></footer>;
}
