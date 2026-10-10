"use client";

import { useActionState } from "react";
import { updatePassword, type FormState } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";

/** Screen A4 (step 2) — choose a new password after opening the emailed link. */
export default function ResetPasswordPage() {
  const [state, action] = useActionState<FormState, FormData>(updatePassword, {});
  return (
    <main id="main" className="narrow">
      <h1>Choose a new password</h1>
      <form action={action}>
        <div className="field">
          <label htmlFor="password">New password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </div>
        <div className="field">
          <label htmlFor="confirm">Confirm new password</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
        </div>
        <FormMessage state={state} />
        <SubmitButton pending="Saving…">Save password</SubmitButton>
      </form>
    </main>
  );
}
