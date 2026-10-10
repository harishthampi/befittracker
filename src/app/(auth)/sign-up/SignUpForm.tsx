"use client";

import { useActionState } from "react";
import { signUp, type FormState } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";

/** Same form for Users and Gym Instructors: role, username, password (twice), optional family code. */
export function SignUpForm({ needsCode }: { needsCode: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(signUp, {});

  return (
    <form action={action} noValidate>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 1rem" }}>
        <legend style={{ fontWeight: 600, marginBottom: "0.4rem" }}>I am a…</legend>
        <div className="segmented">
          <input type="radio" id="role-user" name="role" value="user" defaultChecked />
          <label htmlFor="role-user">
            User<span>Track my food and activity</span>
          </label>
          <input type="radio" id="role-instructor" name="role" value="instructor" />
          <label htmlFor="role-instructor">
            Gym Instructor<span>Follow my clients&apos; progress</span>
          </label>
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="username">Username</label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          minLength={3}
          maxLength={20}
          required
          aria-describedby="username-hint"
        />
        <p id="username-hint" className="hint">3–20 letters, numbers, dots or underscores. You&apos;ll use this to sign in.</p>
      </div>
      <div className="field">
        <label htmlFor="display_name">First name (optional)</label>
        <input id="display_name" name="display_name" autoComplete="given-name" maxLength={80} />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required aria-describedby="pw-hint" />
        <p id="pw-hint" className="hint">At least 8 characters. There&apos;s no email reset, so keep it somewhere safe.</p>
      </div>
      <div className="field">
        <label htmlFor="confirm">Confirm password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {needsCode && (
        <div className="field">
          <label htmlFor="signup_code">Family sign-up code</label>
          <input id="signup_code" name="signup_code" autoComplete="off" autoCapitalize="none" required aria-describedby="code-hint" />
          <p id="code-hint" className="hint">Ask the person who shared BeFitTracker with you.</p>
        </div>
      )}

      <div className="field row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
        <input id="consent" name="consent" type="checkbox" style={{ width: 22, minHeight: 22, marginTop: 3 }} />
        <label htmlFor="consent" style={{ fontWeight: 400 }}>
          I agree that BeFitTracker stores my health data (food, weight, activity) to run the app.
        </label>
      </div>

      <FormMessage state={state} />
      <SubmitButton pending="Creating account…">Create account</SubmitButton>
    </form>
  );
}
