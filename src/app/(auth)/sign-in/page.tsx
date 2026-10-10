"use client";

import Link from "next/link";
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, type FormState } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";

function SignInForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/app";
  const [state, action] = useActionState<FormState, FormData>(signIn, {});

  return (
    <form action={action}>
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="username">Username</label>
        <input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <p className="small">
        <Link href="/forgot-password">Forgot password?</Link>
      </p>
      <FormMessage state={state} />
      <SubmitButton pending="Signing in…">Sign in</SubmitButton>
    </form>
  );
}

/** Screen A3 — sign in with username and password (Users and Gym Instructors). */
export default function SignInPage() {
  return (
    <main id="main" className="narrow">
      <h1>Welcome back</h1>
      <Suspense>
        <SignInForm />
      </Suspense>
      <p className="small" style={{ marginTop: "1.5rem" }}>
        New here? <Link href="/sign-up">Create an account</Link>
      </p>
    </main>
  );
}
