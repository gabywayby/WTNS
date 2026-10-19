import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/logout/actions";
import { horizon } from "@/app/fonts";

async function AuthLinks() {
  let signedIn = false; let isAdmin = false;
  // Keep Supabase's token-expiry clock check out of the prerendered shell.
  await connection();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: admin } = user ? await supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle() : { data: null };
    signedIn = !!user; isAdmin = !!admin;
  } catch { /* account links stay signed out */ }
  return <>{signedIn && <Link href="/orders">Orders</Link>}{isAdmin && <Link href="/admin">Admin</Link>}{signedIn ? <form action={signOut}><button type="submit" style={{ background: "none", border: 0, padding: 0, color: "inherit", cursor: "pointer", textTransform: "inherit", letterSpacing: "inherit", fontSize: "inherit" }}>Logout</button></form> : <Link href="/login" prefetch={false}>Login</Link>}</>;
}
export default function SiteHeader() {
  return <header className="site-header"><Link className={`${horizon.className} wordmark`} href="/">WTNS</Link><nav><Link href="/shop">Shop</Link><Suspense fallback={<span className="nav-placeholder">Account</span>}><AuthLinks /></Suspense></nav></header>;
}
