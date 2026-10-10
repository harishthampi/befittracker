import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createPlainClient } from "@supabase/supabase-js";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * It reads the signed-in person's session from cookies, so every query runs
 * as that person and Row-Level Security applies.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot set cookies; the middleware refreshes them instead.
          }
        },
      },
    },
  );
}

/**
 * Admin client that bypasses RLS. Server-only, used for one job: writing
 * public database results into the shared food cache. Returns null when the
 * service-role key is not configured, and callers simply skip caching.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
