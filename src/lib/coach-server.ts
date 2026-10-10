import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Scope } from "@/lib/coaching";

/** A client as returned by the coach_clients() database function (body/goal fields null unless shared). */
export interface CoachClient {
  link_id: string;
  client_id: string;
  display_name: string;
  timezone: string;
  scopes: Scope[];
  approved_at: string;
  age: number | null;
  sex: "male" | "female" | null;
  height_cm: number | null;
  weight_kg: number | null;
  goal: "lose" | "maintain" | "gain" | null;
}

export interface Note {
  id: string;
  link_id: string;
  author_id: string;
  local_date: string | null;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface Proposal {
  id: string;
  link_id: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  steps: number;
  message: string | null;
  status: "pending" | "accepted" | "declined" | "replaced";
  created_at: string;
  responded_at: string | null;
}

/** Loads the signed-in instructor for a /coach page; sends anyone else where they belong. */
export async function requireInstructor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/coach");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name, onboarded_at, timezone")
    .eq("id", user.id)
    .single();
  if (!profile?.onboarded_at) redirect("/onboarding");
  if (profile.role !== "instructor") redirect("/app");
  return { supabase, user, profile };
}

/**
 * Database functions raise friendly messages for expected problems ("That code is invalid or has
 * expired"). Show those; hide anything else (it could be a technical error).
 */
const FRIENDLY = [
  "Only instructors",
  "Choose at least one",
  "open invites",
  "invalid or has expired",
  "own invite",
  "Only user accounts",
  "does not share goals",
  "Link not found",
  "Suggestion not found",
  "Notes are",
  "or stop sharing",
  "Could not create a code",
];
export function friendly(message: string | undefined, fallback = "Something went wrong. Please try again."): string {
  if (!message) return fallback;
  if (message.includes("function") && message.includes("does not exist")) {
    return "Coaching isn't set up in the database yet. Run supabase/migrations/0004_coaching.sql in Supabase.";
  }
  return FRIENDLY.some((f) => message.includes(f)) ? message : fallback;
}
