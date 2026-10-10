"use client";

import { useActionState } from "react";
import { createInvite } from "@/app/coaching-actions";
import type { FormState } from "@/app/(auth)/actions";
import { SCOPES, SCOPE_INFO } from "@/lib/coaching";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";

/** Pick what to ask a client to share, then create a one-time 8-character code. */
export function InviteForm() {
  const [state, action] = useActionState<FormState, FormData>(createInvite, {});
  return (
    <form action={action}>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Ask your client to share</legend>
        {SCOPES.map((s) => (
          <label key={s} className="check-row">
            <input type="checkbox" name="scopes" value={s} defaultChecked={s !== "body"} />
            <span>
              <strong>{SCOPE_INFO[s].label}</strong>
              <span className="muted small"> · {SCOPE_INFO[s].detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="hint">Your client can untick any of these before accepting, and change them later.</p>
      <FormMessage state={state} />
      <SubmitButton pending="Creating…">Create invite code</SubmitButton>
    </form>
  );
}
