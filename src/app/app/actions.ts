"use server";

/**
 * Server Actions for the signed-in user area. Every action:
 *   1. Re-checks who is signed in (never trusts a user id sent by the browser).
 *   2. Validates every number and string before it reaches the database.
 *   3. Writes as that person, so Row-Level Security applies as a second guard.
 *   4. Revalidates the pages that show the changed data.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isMeal } from "@/lib/meals";
import { parseDateParam, todayIn } from "@/lib/dates";
import { scaleNutrients, workoutKcal, WORKOUT_METS } from "@/lib/nutrition";
import type { FormState } from "@/app/(auth)/actions";
import { FOOD_SOURCES, type FoodSource } from "@/lib/food-sources/types";

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, weight_kg")
    .eq("id", user.id)
    .single();
  const today = todayIn(profile?.timezone ?? "America/Toronto");
  return { supabase, userId: user.id, today, weightKg: Number(profile?.weight_kg ?? 70) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function num(form: FormData, key: string): number {
  const raw = form.get(key);
  return raw === null || raw === "" ? NaN : Number(raw);
}

function refresh() {
  revalidatePath("/app");
  revalidatePath("/app/diary");
}

// ---------------------------------------------------------------------------
// Steps, water, workouts (Home quick-add)
// ---------------------------------------------------------------------------

/** Sets (not adds) today's step count; typed in from the phone's step counter. */
export async function setSteps(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, userId, today } = await session();
  const date = parseDateParam(String(form.get("date") ?? ""), today);
  const steps = Math.round(num(form, "steps"));
  if (!Number.isFinite(steps) || steps < 0 || steps > 150000) return { error: "Enter steps between 0 and 150,000." };

  const { error } = await supabase
    .from("step_logs")
    .upsert({ user_id: userId, local_date: date, steps, updated_at: new Date().toISOString() });
  if (error) return { error: "Couldn't save steps. Try again." };
  refresh();
  return { message: `Saved ${steps.toLocaleString("en-CA")} steps.` };
}

export async function addWater(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, userId, today } = await session();
  const ml = Math.round(num(form, "ml"));
  if (!Number.isFinite(ml) || ml < 1 || ml > 5000) return { error: "Enter between 1 and 5,000 ml." };
  const { error } = await supabase.from("water_logs").insert({ user_id: userId, local_date: today, ml });
  if (error) return { error: "Couldn't save water. Try again." };
  refresh();
  return { message: `Added ${ml} ml.` };
}

export async function addWorkout(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, userId, today, weightKg } = await session();
  const type = String(form.get("type") ?? "");
  const minutes = Math.round(num(form, "minutes"));
  const typedKcal = num(form, "kcal");

  if (!(type in WORKOUT_METS)) return { error: "Choose a workout type." };
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 600) return { error: "Enter 1 to 600 minutes." };
  // Use the person's own number (from a watch) if they typed one; otherwise estimate from MET.
  const activeKcal = Number.isFinite(typedKcal) ? Math.round(typedKcal) : workoutKcal(type, minutes, weightKg);
  if (activeKcal < 0 || activeKcal > 5000) return { error: "Calories should be between 0 and 5,000." };

  // The diary can log a workout for the day it is showing; Home logs for today. Never a future day.
  const date = parseDateParam(String(form.get("date") ?? ""), today);
  if (date > today) return { error: "You can't log a workout for a future day." };

  const { error } = await supabase
    .from("workouts")
    .insert({ user_id: userId, local_date: date, type, minutes, active_kcal: activeKcal, source: "manual" });
  if (error) return { error: "Couldn't save the workout. Try again." };
  refresh();
  return { message: `Logged ${type.toLowerCase()} · ${minutes} min · ${activeKcal} kcal.` };
}

/** Removes one logged workout. RLS limits it to the person's own rows; the user_id filter makes that explicit. */
export async function deleteWorkout(form: FormData) {
  const { supabase, userId } = await session();
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return;
  await supabase.from("workouts").delete().eq("id", id).eq("user_id", userId);
  refresh();
}

// ---------------------------------------------------------------------------
// Skipping a meal ("I didn't have a morning snack today")
// ---------------------------------------------------------------------------

/** Hides an empty meal from that day's diary. Meals with food in them can't be skipped. */
export async function skipMeal(form: FormData) {
  const { supabase, userId, today } = await session();
  const meal = String(form.get("meal") ?? "");
  const date = parseDateParam(String(form.get("date") ?? ""), today);
  if (!isMeal(meal)) return;

  const { count } = await supabase
    .from("food_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("local_date", date)
    .eq("meal", meal);
  if ((count ?? 0) > 0) return;

  await supabase.from("skipped_meals").upsert({ user_id: userId, local_date: date, meal });
  refresh();
}

/** Brings a skipped meal back ("Undo"). */
export async function unskipMeal(form: FormData) {
  const { supabase, userId, today } = await session();
  const meal = String(form.get("meal") ?? "");
  const date = parseDateParam(String(form.get("date") ?? ""), today);
  if (!isMeal(meal)) return;
  await unskip(supabase, userId, date, meal);
  refresh();
}

async function unskip(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, date: string, meal: string) {
  await supabase.from("skipped_meals").delete().eq("user_id", userId).eq("local_date", date).eq("meal", meal);
}

// ---------------------------------------------------------------------------
// Food entries
// ---------------------------------------------------------------------------

export interface FoodPayload {
  source: FoodSource;
  sourceId: string;
  name: string;
  brand?: string | null;
  per100: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
}

const SOURCES = new Set<string>(FOOD_SOURCES);

function validFood(f: FoodPayload): string | null {
  if (!f || typeof f !== "object") return "Pick a food first.";
  if (!SOURCES.has(f.source)) return "Unknown food source.";
  if (typeof f.name !== "string" || f.name.trim().length === 0 || f.name.length > 200) return "Food name is missing.";
  const p = f.per100;
  if (!p) return "This food has no nutrition data.";
  const values = [p.kcal, p.protein, p.carbs, p.fat, p.fiber];
  if (values.some((v) => typeof v !== "number" || !Number.isFinite(v) || v < 0)) return "This food's nutrition data looks wrong.";
  if (p.kcal > 950 || p.protein > 100 || p.carbs > 100 || p.fat > 100 || p.fiber > 100) return "This food's nutrition data looks wrong.";
  return null;
}

/**
 * Adds one food to one meal. Nutrients are recalculated here on the server from
 * the per-100 g values and the grams, so the stored numbers are always consistent.
 */
export async function addFoodEntry(input: {
  date: string;
  meal: string;
  food: FoodPayload;
  quantity: number;
  unitLabel: string;
  gramsPerUnit: number;
}): Promise<FormState> {
  const { supabase, userId, today } = await session();
  const date = parseDateParam(input.date, today);
  if (!isMeal(input.meal)) return { error: "Choose a meal." };
  const problem = validFood(input.food);
  if (problem) return { error: problem };

  const quantity = Number(input.quantity);
  const gramsPerUnit = Number(input.gramsPerUnit);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000) return { error: "Enter an amount greater than 0." };
  if (!Number.isFinite(gramsPerUnit) || gramsPerUnit <= 0 || gramsPerUnit > 5000) return { error: "That measurement isn't valid." };
  const grams = Math.round(quantity * gramsPerUnit * 100) / 100;
  if (grams > 5000) return { error: "That's more than 5 kg in one entry. Check the amount." };

  const n = scaleNutrients(input.food.per100, grams);
  const { error } = await supabase.from("food_entries").insert({
    user_id: userId,
    local_date: date,
    meal: input.meal,
    source: input.food.source,
    source_id: String(input.food.sourceId).slice(0, 100),
    name: input.food.name.trim().slice(0, 200),
    brand: input.food.brand ? String(input.food.brand).slice(0, 120) : null,
    quantity,
    unit_label: String(input.unitLabel).slice(0, 60) || "g",
    grams,
    kcal: n.kcal,
    protein_g: n.proteinG,
    carbs_g: n.carbsG,
    fat_g: n.fatG,
    fiber_g: n.fiberG,
  });
  if (error) return { error: "Couldn't add the food. Try again." };
  // Adding food to a meal that was marked skipped means it wasn't skipped after all.
  await unskip(supabase, userId, date, input.meal);
  refresh();
  return { message: `Added ${input.food.name} (${Math.round(n.kcal)} kcal).` };
}

export async function deleteFoodEntry(form: FormData) {
  const { supabase, userId } = await session();
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return;
  // RLS already limits this to the person's own rows; the user_id filter makes it explicit.
  await supabase.from("food_entries").delete().eq("id", id).eq("user_id", userId);
  refresh();
}

/** Copies every item from one day's meal into another day's same meal ("same as yesterday"). */
export async function copyMeal(form: FormData) {
  const { supabase, userId, today } = await session();
  const meal = String(form.get("meal") ?? "");
  const from = parseDateParam(String(form.get("from") ?? ""), "");
  const to = parseDateParam(String(form.get("to") ?? ""), today);
  if (!isMeal(meal) || !from) return;

  const { data: items } = await supabase
    .from("food_entries")
    .select("source, source_id, name, brand, quantity, unit_label, grams, kcal, protein_g, carbs_g, fat_g, fiber_g")
    .eq("user_id", userId)
    .eq("local_date", from)
    .eq("meal", meal);
  if (!items?.length) return;

  await supabase.from("food_entries").insert(items.map((i) => ({ ...i, user_id: userId, local_date: to, meal })));
  await unskip(supabase, userId, to, meal);
  refresh();
}

// ---------------------------------------------------------------------------
// Custom foods (for homemade dishes the databases don't have)
// ---------------------------------------------------------------------------

/** Saves a custom food from label values "per serving", stored as per-100 g like every other food. */
export async function createCustomFood(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, userId } = await session();
  const name = String(form.get("name") ?? "").trim();
  const servingLabel = String(form.get("serving_label") ?? "").trim() || "1 serving";
  const servingGrams = num(form, "serving_grams");
  const values = {
    kcal: num(form, "kcal"),
    protein: num(form, "protein") || 0,
    carbs: num(form, "carbs") || 0,
    fat: num(form, "fat") || 0,
    fiber: num(form, "fiber") || 0,
  };

  if (name.length < 1 || name.length > 200) return { error: "Give the food a name." };
  if (!Number.isFinite(servingGrams) || servingGrams <= 0 || servingGrams > 5000) return { error: "Enter the serving weight in grams." };
  if (!Number.isFinite(values.kcal) || values.kcal < 0) return { error: "Enter the calories per serving." };
  if (Object.values(values).some((v) => v < 0)) return { error: "Values can't be negative." };

  const f = 100 / servingGrams;
  const per100 = {
    kcal_100g: round2(values.kcal * f),
    protein_100g: round2(values.protein * f),
    carbs_100g: round2(values.carbs * f),
    fat_100g: round2(values.fat * f),
    fiber_100g: round2(values.fiber * f),
  };
  if (per100.kcal_100g > 950 || per100.protein_100g > 100 || per100.carbs_100g > 100 || per100.fat_100g > 100) {
    return { error: "Those values are more than the serving can weigh. Check the grams." };
  }

  const { error } = await supabase.from("foods").insert({
    owner_id: userId,
    source: "custom",
    name: name.slice(0, 200),
    ...per100,
    servings: [{ label: servingLabel.slice(0, 60), grams: servingGrams }],
  });
  if (error) return { error: "Couldn't save the food. Try again." };
  return { message: `Saved “${name}”. Search for it to add it to a meal.` };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

/** Saves edited targets as a new version starting today; earlier days keep their old targets. */
export async function saveTargets(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, userId, today } = await session();
  const t = {
    kcal: Math.round(num(form, "kcal")),
    protein_g: Math.round(num(form, "protein_g")),
    carbs_g: Math.round(num(form, "carbs_g")),
    fat_g: Math.round(num(form, "fat_g")),
    fiber_g: Math.round(num(form, "fiber_g")),
    steps: Math.round(num(form, "steps")),
    active_kcal: Math.round(num(form, "active_kcal")),
    water_ml: Math.round(num(form, "water_ml")),
  };
  const limits: Record<keyof typeof t, [number, number]> = {
    kcal: [800, 6000],
    protein_g: [0, 500],
    carbs_g: [0, 1000],
    fat_g: [0, 400],
    fiber_g: [0, 150],
    steps: [0, 100000],
    active_kcal: [0, 5000],
    water_ml: [0, 10000],
  };
  for (const [k, [lo, hi]] of Object.entries(limits) as [keyof typeof t, [number, number]][]) {
    if (!Number.isFinite(t[k]) || t[k] < lo || t[k] > hi) return { error: `Check ${k.replace("_", " ")}: allowed ${lo}–${hi}.` };
  }

  const { error } = await supabase
    .from("targets")
    .upsert({ user_id: userId, effective_from: today, ...t, set_by: "self" }, { onConflict: "user_id,effective_from" });
  if (error) return { error: "Couldn't save your targets. Try again." };
  refresh();
  revalidatePath("/app/targets");
  return { message: "Targets saved. They apply from today." };
}
