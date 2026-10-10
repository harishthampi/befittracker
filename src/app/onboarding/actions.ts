"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ageFromBirthDate, calculateTargets, type ActivityLevel, type Goal, type Sex } from "@/lib/nutrition";
import { isValidTimeZone, todayIn } from "@/lib/dates";
import type { FormState } from "@/app/(auth)/actions";

const ACTIVITIES: ActivityLevel[] = ["sedentary", "light", "moderate", "very", "extra"];
const GOALS: Goal[] = ["lose", "maintain", "gain"];

/**
 * Onboarding (screens O1–O4) in one form. Validates body stats, converts imperial
 * to metric, stores the profile, calculates default targets, then shows them for review.
 */
export async function completeOnboarding(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = profile?.role ?? form.get("role");
  if (role !== "user" && role !== "instructor") return { error: "Choose User or Gym Instructor." };

  const displayName = String(form.get("display_name") ?? "").trim().slice(0, 80) || null;
  const tzInput = String(form.get("timezone") ?? "");
  const timezone = isValidTimeZone(tzInput) ? tzInput : "America/Toronto";

  // Instructors only need a name for now; the client tools arrive in V1.1.
  if (role === "instructor") {
    const { error } = await supabase
      .from("profiles")
      .update({ role, display_name: displayName, timezone, onboarded_at: new Date().toISOString() })
      .eq("id", user.id);
    if (error) return { error: "Couldn't save your profile. Please try again." };
    redirect("/coach");
  }

  const units = form.get("units") === "imperial" ? "imperial" : "metric";
  const birthDate = String(form.get("birth_date") ?? "");
  const sex = form.get("sex") as Sex;
  const activity = form.get("activity_level") as ActivityLevel;
  const goal = form.get("goal") as Goal;

  let heightCm: number;
  let weightKg: number;
  if (units === "imperial") {
    const ft = Number(form.get("height_ft"));
    const inch = Number(form.get("height_in") || 0);
    heightCm = (ft * 12 + inch) * 2.54;
    weightKg = Number(form.get("weight_lb")) * 0.45359237;
  } else {
    heightCm = Number(form.get("height_cm"));
    weightKg = Number(form.get("weight_kg"));
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return { error: "Enter your date of birth." };
  const age = ageFromBirthDate(birthDate);
  if (age < 18) return { error: "BeFitTracker is for adults (18 and over)." };
  if (age > 110) return { error: "Check your date of birth." };
  if (sex !== "male" && sex !== "female") return { error: "Choose the sex used for the calorie formula." };
  if (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250) return { error: "Height should be between 100 and 250 cm (3'3\"–8'2\")." };
  if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) return { error: "Weight should be between 30 and 300 kg (66–660 lb)." };
  if (!ACTIVITIES.includes(activity)) return { error: "Choose an activity level." };
  if (!GOALS.includes(goal)) return { error: "Choose a goal." };

  heightCm = Math.round(heightCm * 10) / 10;
  weightKg = Math.round(weightKg * 10) / 10;

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      role,
      display_name: displayName,
      birth_date: birthDate,
      sex,
      height_cm: heightCm,
      weight_kg: weightKg,
      activity_level: activity,
      goal,
      units,
      timezone,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (profileError) return { error: "Couldn't save your profile. Please try again." };

  const t = calculateTargets({ sex, weightKg, heightCm, age, activity, goal });
  const { error: targetError } = await supabase.from("targets").upsert(
    {
      user_id: user.id,
      effective_from: todayIn(timezone),
      kcal: t.kcal,
      protein_g: t.proteinG,
      carbs_g: t.carbsG,
      fat_g: t.fatG,
      fiber_g: t.fiberG,
      steps: t.steps,
      active_kcal: t.activeKcal,
      water_ml: t.waterMl,
      set_by: "calculated",
    },
    { onConflict: "user_id,effective_from" },
  );
  if (targetError) return { error: "Couldn't save your targets. Please try again." };

  redirect(`/app/targets?welcome=1${t.clampedToMinimum ? "&clamped=1" : ""}`);
}
