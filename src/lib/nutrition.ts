/**
 * Nutrition and energy maths, kept free of any framework code so it can be
 * unit-tested and reused unchanged by the V2 mobile app.
 */

export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "very" | "extra";
export type Goal = "lose" | "maintain" | "gain";

export const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2, // desk job, little exercise
  light: 1.375, // exercise 1-3 days/week
  moderate: 1.55, // exercise 3-5 days/week
  very: 1.725, // exercise 6-7 days/week
  extra: 1.9, // physical job or twice-daily training
};

export const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  sedentary: "Sedentary (little or no exercise)",
  light: "Light (1–3 days a week)",
  moderate: "Moderate (3–5 days a week)",
  very: "Very active (6–7 days a week)",
  extra: "Extra active (physical job or 2× a day)",
};

/** Calories adjustment per goal, applied to TDEE. */
export const GOAL_ADJUSTMENT: Record<Goal, number> = { lose: -500, maintain: 0, gain: 300 };

/** Lowest daily calorie target we set without a warning. */
export const MIN_SAFE_KCAL: Record<Sex, number> = { female: 1200, male: 1500 };

export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;

/** Whole years between a birth date and "today". */
export function ageFromBirthDate(birthDate: string, today: Date = new Date()): number {
  const [y, m, d] = birthDate.split("-").map(Number);
  let age = today.getFullYear() - y;
  const beforeBirthday =
    today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

/** Mifflin-St Jeor basal metabolic rate, kcal/day. */
export function bmr(p: { sex: Sex; weightKg: number; heightCm: number; age: number }): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return base + (p.sex === "male" ? 5 : -161);
}

/** Total daily energy expenditure = BMR × activity multiplier. */
export function tdee(p: Parameters<typeof bmr>[0] & { activity: ActivityLevel }): number {
  return bmr(p) * ACTIVITY_MULTIPLIER[p.activity];
}

export interface Targets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  steps: number;
  activeKcal: number;
  waterMl: number;
  /** True when the goal maths fell below the safe minimum and we clamped it. */
  clampedToMinimum: boolean;
}

/**
 * Default daily targets from body stats.
 * Protein: 1.6 g/kg when losing or gaining (protects / builds muscle), 1.2 g/kg to maintain.
 * Fat: 27% of calories. Carbs: whatever calories remain.
 */
export function calculateTargets(p: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activity: ActivityLevel;
  goal: Goal;
}): Targets {
  const raw = tdee(p) + GOAL_ADJUSTMENT[p.goal];
  const min = MIN_SAFE_KCAL[p.sex];
  const kcal = roundTo(Math.max(raw, min), 10);

  const proteinG = Math.round(p.weightKg * (p.goal === "maintain" ? 1.2 : 1.6));
  const fatG = Math.round((kcal * 0.27) / KCAL_PER_GRAM.fat);
  const carbKcal = kcal - proteinG * KCAL_PER_GRAM.protein - fatG * KCAL_PER_GRAM.fat;
  const carbsG = Math.max(0, Math.round(carbKcal / KCAL_PER_GRAM.carbs));

  const steps = 8000;
  return {
    kcal,
    proteinG,
    carbsG,
    fatG,
    fiberG: p.sex === "male" ? 38 : 25,
    steps,
    activeKcal: roundTo(stepsToKcal(steps, p.weightKg) + 150, 10), // steps plus a short workout
    waterMl: roundTo(p.weightKg * 35, 250),
    clampedToMinimum: raw < min,
  };
}

/**
 * Rough calories burned by walking: about 0.04 kcal per step for a 70 kg person,
 * scaled by body weight. Good enough for a ring; not a medical measurement.
 */
export function stepsToKcal(steps: number, weightKg: number): number {
  return steps * 0.04 * (weightKg / 70);
}

/** Common workouts and their MET values (Compendium of Physical Activities). */
export const WORKOUT_METS: Record<string, number> = {
  Walking: 3.5,
  Running: 9.8,
  Cycling: 7.5,
  "Strength training": 5.0,
  Yoga: 2.5,
  Swimming: 7.0,
  HIIT: 8.0,
  Sports: 7.0,
  Other: 5.0,
};

/** kcal = MET × weight (kg) × hours. Only the "active" part above resting is counted. */
export function workoutKcal(type: string, minutes: number, weightKg: number): number {
  const met = WORKOUT_METS[type] ?? WORKOUT_METS.Other;
  return Math.round((met - 1) * weightKg * (minutes / 60));
}

export interface Per100g {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface Nutrients {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

/** Nutrients for a given weight: per-100 g value × grams / 100. */
export function scaleNutrients(per100: Per100g, grams: number): Nutrients {
  const f = grams / 100;
  return {
    kcal: round1(per100.kcal * f),
    proteinG: round1(per100.protein * f),
    carbsG: round1(per100.carbs * f),
    fatG: round1(per100.fat * f),
    fiberG: round1(per100.fiber * f),
  };
}

export function sumNutrients(items: Nutrients[]): Nutrients {
  return items.reduce(
    (a, b) => ({
      kcal: round1(a.kcal + b.kcal),
      proteinG: round1(a.proteinG + b.proteinG),
      carbsG: round1(a.carbsG + b.carbsG),
      fatG: round1(a.fatG + b.fatG),
      fiberG: round1(a.fiberG + b.fiberG),
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
  );
}

/** Share of calories coming from each macro, in whole percent. */
export function macroCaloriePercents(n: Pick<Nutrients, "proteinG" | "carbsG" | "fatG">) {
  const p = n.proteinG * KCAL_PER_GRAM.protein;
  const c = n.carbsG * KCAL_PER_GRAM.carbs;
  const f = n.fatG * KCAL_PER_GRAM.fat;
  const total = p + c + f;
  if (total === 0) return { protein: 0, carbs: 0, fat: 0 };
  return {
    protein: Math.round((p / total) * 100),
    carbs: Math.round((c / total) * 100),
    fat: Math.round((f / total) * 100),
  };
}

export type ProgressState = "under" | "on" | "over";

/**
 * Colour state for a progress bar. Under 90% = under, 90–110% = on target, above 110% = over.
 * For protein, being under is the thing to warn about; for calories, being over is.
 */
export function progressState(consumed: number, target: number): ProgressState {
  if (target <= 0) return "on";
  const ratio = consumed / target;
  if (ratio < 0.9) return "under";
  if (ratio <= 1.1) return "on";
  return "over";
}

export function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
