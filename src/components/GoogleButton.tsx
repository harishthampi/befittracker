"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * "Continue with Google". Supabase sends the person to Google and back to
 * /auth/callback. New Google accounts pick User or Instructor during onboarding.
 */
export function GoogleButton({ next = "/app" }: { next?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setError("Google sign-in isn't available right now. Try email instead.");
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-block" onClick={go} disabled={busy}>
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && (
        <p className="alert alert-error small" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
