"use client";

import { useActionState } from "react";
import { acceptInvite, saveScopes } from "@/app/coaching-actions";
import type { FormState } from "@/app/(auth)/actions";
import { SCOPES, SCOPE_INFO, type Scope } from "@/lib/coaching";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";

function ScopeChecks({ offered, checked }: { offered: readonly Scope[]; checked: readonly Scope[] }) {
  return (
    <>
      {offered.map((s) => (
        <label key={s} className="check-row">
          <input type="checkbox" name="scopes" value={s} defaultChecked={checked.includes(s)} />
          <span>
            <strong>{SCOPE_INFO[s].label}</strong>
            <span className="muted small"> · {SCOPE_INFO[s].detail}</span>
          </span>
        </label>
      ))}
    </>
  );
}

/** After entering a valid code: choose what to share (only what the coach asked for), then accept. */
export function AcceptForm({ code, requested }: { code: string; requested: Scope[] }) {
  const [state, action] = useActionState<FormState, FormData>(acceptInvite, {});
  return (
    <form action={action}>
      <input type="hidden" name="code" value={code} />
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Share with them</legend>
        <ScopeChecks offered={requested} checked={requested} />
      </fieldset>
      <p className="hint">Untick anything you&apos;d rather keep private. You can change this or stop sharing any time.</p>
      <FormMessage state={state} />
      <SubmitButton pending="Joining…">Accept and share</SubmitButton>
    </form>
  );
}

/** Change what an existing coach can see. */
export function SharingForm({ link, scopes }: { link: string; scopes: Scope[] }) {
  const [state, action] = useActionState<FormState, FormData>(saveScopes, {});
  return (
    <form action={action}>
      <input type="hidden" name="link" value={link} />
      <ScopeChecks offered={SCOPES} checked={scopes} />
      <FormMessage state={state} />
      <SubmitButton className="btn btn-small" pending="Saving…">
        Save sharing
      </SubmitButton>
    </form>
  );
}
