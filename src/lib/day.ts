import type { createClient } from "@/lib/supabase/server";
import { stepsToKcal, sumNutrients, type Nutrients } from "@/lib/nutrition";
import type { Meal } from "@/lib/meals";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface FoodEntry {
  id: string;
  meal: Meal;
  name: string;
  brand: string | null;
  quantity: number;
  unit_label: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export interface Workout {
  id: string;
  type: string;
  minutes: number;
  active_kcal: number;
  source: string;
  /** When it was logged (UTC timestamp); shown in the person's time zone. */
  created_at: string;
}

export interface DayData {
  entries: FoodEntry[];
  intake: Nutrients;
  steps: number;
  waterMl: number;
  workoutKcal: number;
  workouts: Workout[];
  /** Meals the person marked as skipped this day (hidden from the diary). */
  skippedMeals: Meal[];
  /** Estimated active calories: walking (from steps) + logged workouts. */
  burnedKcal: number;
}

/** Everything the Home and Diary screens need for one day, fetched in parallel. */
export async function loadDay(supabase: Supabase, userId: string, date: string, weightKg: number): Promise<DayData> {
  const [food, steps, water, workouts, skipped] = await Promise.all([
    supabase
      .from("food_entries")
      .select("id, meal, name, brand, quantity, unit_label, grams, kcal, protein_g, carbs_g, fat_g, fiber_g")
      .eq("user_id", userId)
      .eq("local_date", date)
      .order("created_at", { ascending: true }),
    supabase.from("step_logs").select("steps").eq("user_id", userId).eq("local_date", date).maybeSingle(),
    supabase.from("water_logs").select("ml").eq("user_id", userId).eq("local_date", date),
    supabase
      .from("workouts")
      .select("id, type, minutes, active_kcal, source, created_at")
      .eq("user_id", userId)
      .eq("local_date", date)
      .order("created_at", { ascending: true }),
    // If migration 0003 hasn't been run yet this returns an error; we then treat it as "nothing skipped".
    supabase.from("skipped_meals").select("meal").eq("user_id", userId).eq("local_date", date),
  ]);

  // Postgres numeric columns arrive as strings or numbers depending on size; normalise to numbers.
  const entries: FoodEntry[] = (food.data ?? []).map((e) => ({
    ...e,
    quantity: Number(e.quantity),
    grams: Number(e.grams),
    kcal: Number(e.kcal),
    protein_g: Number(e.protein_g),
    carbs_g: Number(e.carbs_g),
    fat_g: Number(e.fat_g),
    fiber_g: Number(e.fiber_g),
  }));

  const intake = sumNutrients(
    entries.map((e) => ({ kcal: e.kcal, proteinG: e.protein_g, carbsG: e.carbs_g, fatG: e.fat_g, fiberG: e.fiber_g })),
  );
  const stepCount = steps.data?.steps ?? 0;
  const waterMl = (water.data ?? []).reduce((s, w) => s + w.ml, 0);
  const workoutList = (workouts.data ?? []) as Workout[];
  const skippedMeals = ((skipped.data ?? []) as { meal: Meal }[]).map((r) => r.meal);
  const workoutKcal = workoutList.reduce((s, w) => s + w.active_kcal, 0);

  return {
    entries,
    intake,
    steps: stepCount,
    waterMl,
    workoutKcal,
    workouts: workoutList,
    skippedMeals,
    burnedKcal: Math.round(stepsToKcal(stepCount, weightKg) + workoutKcal),
  };
}
