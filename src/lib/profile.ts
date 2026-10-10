import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/dates";

export interface Profile {
  id: string;
  role: "user" | "instructor" | null;
  display_name: string | null;
  birth_date: string | null;
  sex: "male" | "female" | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: "sedentary" | "light" | "moderate" | "very" | "extra" | null;
  goal: "lose" | "maintain" | "gain" | null;
  timezone: string;
  onboarded_at: string | null;
}

export interface TargetRow {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  steps: number;
  active_kcal: number;
  water_ml: number;
}

/**
 * Loads the signed-in person's profile for a page inside /app.
 * Sends them to sign-in, onboarding, or the instructor area if needed,
 * so every user page can assume a complete profile.
 */
export async function requireUserProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (!profile || !profile.role || !profile.onboarded_at) redirect("/onboarding");
  if (profile.role === "instructor") redirect("/coach");

  const today = todayIn(profile.timezone);
  return { supabase, user, profile, today };
}

/** The targets in force on a given day (latest version on or before that day). */
export async function targetsFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  date: string,
): Promise<TargetRow | null> {
  const { data } = await supabase
    .from("targets")
    .select("kcal, protein_g, carbs_g, fat_g, fiber_g, steps, active_kcal, water_ml")
    .eq("user_id", userId)
    .lte("effective_from", date)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle<TargetRow>();
  if (data) return data;

  // A day before the first targets were set: fall back to the earliest version.
  const { data: first } = await supabase
    .from("targets")
    .select("kcal, protein_g, carbs_g, fat_g, fiber_g, steps, active_kcal, water_ml")
    .eq("user_id", userId)
    .order("effective_from", { ascending: true })
    .limit(1)
    .maybeSingle<TargetRow>();
  return first ?? null;
}
