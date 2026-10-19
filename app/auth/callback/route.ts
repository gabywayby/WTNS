import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/";
  let next = "/";
  try {
    const target = new URL(rawNext, origin);
    if (target.origin === origin) next = target.pathname + target.search;
  } catch {
    next = "/";
  }
  if (code) { try { const supabase = await createClient(); const { error } = await supabase.auth.exchangeCodeForSession(code); if (!error) return NextResponse.redirect(new URL(next, origin)); } catch { /* redirect below */ } }
  return NextResponse.redirect(new URL("/?error=Could%20not%20complete%20login", origin));
}
