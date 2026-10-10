/** The five meals of the day, in display order. Matches the `meal` enum in the database. */
export const MEALS = ["breakfast", "morning_snack", "lunch", "evening_snack", "dinner"] as const;
export type Meal = (typeof MEALS)[number];

export const MEAL_LABEL: Record<Meal, string> = {
  breakfast: "Breakfast",
  morning_snack: "Morning snack",
  lunch: "Lunch",
  evening_snack: "Evening snack",
  dinner: "Dinner",
};

export function isMeal(value: unknown): value is Meal {
  return typeof value === "string" && (MEALS as readonly string[]).includes(value);
}

/** Picks a sensible default meal from the hour of day (0–23). */
export function mealForHour(hour: number): Meal {
  if (hour < 10) return "breakfast";
  if (hour < 12) return "morning_snack";
  if (hour < 15) return "lunch";
  if (hour < 18) return "evening_snack";
  return "dinner";
}
