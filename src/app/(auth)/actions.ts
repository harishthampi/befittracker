"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-redirect";
import { loginEmail, normalizeUsername, usernameProblem, usernameToEmail } from "@/lib/username";

export interface FormState {
  error?: string;
  message?: string;
}

const MIN_PASSWORD = 8;

/**
 * Optional family sign-up code. When SIGNUP_CODE is set (in .env.local or Vercel), people
 * must type it to create an account, so strangers who find the link can't sign up.
 */
function signupCodeOk(input: string): boolean {
  const expected = (process.env.SIGNUP_CODE ?? "").trim();
  if (!expected) return true;
  return input.trim().toLowerCase() === expected.toLowerCase();
}

/** Sign-up for Users and Gym Instructors alike: username + password + role. */
export async function signUp(_prev: FormState, form: FormData): Promise<FormState> {
  const username = normalizeUsername(String(form.get("username") ?? ""));
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const displayName = String(form.get("display_name") ?? "").trim().slice(0, 80);
  const role = form.get("role");
  const consent = form.get("consent") === "on";

  if (role !== "user" && role !== "instructor") return { error: "Choose whether you are a User or a Gym Instructor." };
  const problem = usernameProblem(username);
  if (problem) return { error: problem };
  if (password.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters for your password.` };
  if (password !== confirm) return { error: "The two passwords don't match." };
  if (!signupCodeOk(String(form.get("signup_code") ?? ""))) return { error: "That sign-up code isn't right. Ask the person who shared the app." };
  if (!consent) return { error: "Please agree to how we handle your health data to continue." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: usernameToEmail(username),
    password,
    // Read by the database trigger that creates the profile row.
    options: { data: { role, username, display_name: displayName || username } },
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("already registered") || m.includes("already exists") || m.includes("database error saving")) {
      return { error: "That username is taken. Try another." };
    }
    if (m.includes("email") && m.includes("invalid")) {
      return { error: "Sign-up is misconfigured (placeholder address rejected). See 'USERNAME_EMAIL_DOMAIN' in the go-live guide." };
    }
    if (m.includes("password")) return { error: error.message };
    return { error: "Couldn't create the account. Please try again." };
  }

  // With "Confirm email" turned off in Supabase, a session comes back straight away.
  if (!data.session) {
    return {
      error:
        "Account created, but Supabase is still set to confirm emails, so you can't sign in yet. The app owner needs to turn off 'Confirm email' (Authentication → Sign In / Providers → Email) and confirm this user in Authentication → Users.",
    };
  }
  redirect("/onboarding");
}

/** Sign-in with a username (or, for older accounts, an email). The error never says which part was wrong. */
export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const login = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  if (!login.trim() || !password) return { error: "Enter your username and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(login), password });
  if (error) {
    if (error.message.toLowerCase().includes("not confirmed")) {
      return { error: "This account isn't confirmed yet. Ask the app owner to confirm it in Supabase." };
    }
    return { error: "That username and password don't match." };
  }
  redirect(next);
}

/** Change password while signed in. Checks the current password first. */
export async function changePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const current = String(form.get("current") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters.` };
  if (password !== confirm) return { error: "The two new passwords don't match." };
  if (password === current) return { error: "Choose a password different from your current one." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/sign-in");

  const { error: wrong } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
  if (wrong) return { error: "Your current password isn't right." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message.toLowerCase().includes("password") ? error.message : "Couldn't change the password. Try again." };

  // Sign out other devices so an old session can't be reused.
  await supabase.auth.signOut({ scope: "others" });
  return { message: "Password changed. Other devices have been signed out." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
