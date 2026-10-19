import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next") ?? "/";
  try {
    const supabase = await createClient();
    const callback = new URL("/auth/callback", request.url); callback.searchParams.set("next", next);
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback.toString() } });
    if (error || !data.url) return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error?.message ?? "Unable to start Google login")}`, request.url));
    return NextResponse.redirect(data.url);
  } catch { return NextResponse.redirect(new URL("/?error=Supabase%20is%20not%20configured", request.url)); }
}
