import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";

/**
 * Landing point for every emailed link and for Google sign-in (screen A5).
 * Supabase sends one of two shapes:
 *   ?code=...                  (Google, or email links in PKCE mode)
 *   ?token_hash=...&type=...   (email confirmation / recovery templates)
 * Either way we turn it into a session cookie, then continue to ?next=.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"), "/app");
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let ok = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  }

  const target = new URL(ok ? next : "/sign-in?error=link", url.origin);
  return NextResponse.redirect(target);
}
