"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Supabase client for Client Components (used for Google sign-in and password reset). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
