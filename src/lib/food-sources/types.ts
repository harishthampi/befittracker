import type { Per100g } from "@/lib/nutrition";

/**
 * Where a food's numbers come from. Matches the `food_source` enum in the database.
 *  usda   USDA FoodData Central (live API)
 *  off    Open Food Facts (live API)
 *  indb   Indian Nutrient Databank (imported once into our own table)
 *  custom a person's own food
 */
export type FoodSource = "usda" | "off" | "indb" | "custom";
export const FOOD_SOURCES: readonly FoodSource[] = ["usda", "off", "indb", "custom"];

/** A measurement the person can pick, with its weight in grams. */
export interface Serving {
  label: string; // e.g. "1 cup", "1 medium egg", "g"
  grams: number; // grams in ONE of this unit
}

/**
 * One food, the same shape whichever database it came from. Every adapter
 * converts its source's format into this, so the rest of the app never needs
 * to know where a food came from.
 */
export interface FoodResult {
  source: FoodSource;
  sourceId: string;
  name: string;
  brand: string | null;
  per100: Per100g;
  servings: Serving[];
}

/** Units every food offers, on top of the source's own servings. */
export const BASE_SERVINGS: Serving[] = [
  { label: "g", grams: 1 },
  { label: "oz", grams: 28.35 },
];

/** Drops results without usable calories and impossible values (bad crowd-sourced data). */
export function isPlausible(f: FoodResult): boolean {
  const p = f.per100;
  return (
    Number.isFinite(p.kcal) &&
    p.kcal >= 0 &&
    p.kcal <= 950 && // pure fat is ~900 kcal/100 g
    [p.protein, p.carbs, p.fat, p.fiber].every((v) => Number.isFinite(v) && v >= 0 && v <= 100) &&
    p.protein + p.carbs + p.fat <= 105 // allow rounding slack
  );
}

export function cleanName(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 200);
}
