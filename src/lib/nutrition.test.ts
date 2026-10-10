import { describe, expect, it } from "vitest";
import {
  ageFromBirthDate,
  bmr,
  calculateTargets,
  macroCaloriePercents,
  progressState,
  scaleNutrients,
  stepsToKcal,
  sumNutrients,
  tdee,
  workoutKcal,
} from "./nutrition";

describe("ageFromBirthDate", () => {
  it("counts a birthday that has passed this year", () => {
    expect(ageFromBirthDate("1990-03-15", new Date(2026, 9, 8))).toBe(36);
  });
  it("does not count a birthday still to come", () => {
    expect(ageFromBirthDate("1990-12-01", new Date(2026, 9, 8))).toBe(35);
  });
});

describe("Mifflin-St Jeor", () => {
  it("matches the published formula for a man", () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5
    expect(bmr({ sex: "male", weightKg: 80, heightCm: 180, age: 30 })).toBe(1780);
  });
  it("matches the published formula for a woman", () => {
    // 10*60 + 6.25*165 - 5*28 - 161 = 600 + 1031.25 - 140 - 161
    expect(bmr({ sex: "female", weightKg: 60, heightCm: 165, age: 28 })).toBe(1330.25);
  });
  it("applies the activity multiplier", () => {
    expect(tdee({ sex: "male", weightKg: 80, heightCm: 180, age: 30, activity: "moderate" })).toBeCloseTo(2759, 0);
  });
});

describe("calculateTargets", () => {
  it("subtracts 500 kcal to lose and rounds to 10", () => {
    const t = calculateTargets({ sex: "male", weightKg: 80, heightCm: 180, age: 30, activity: "moderate", goal: "lose" });
    expect(t.kcal).toBe(2260); // 2759 - 500 = 2259 -> 2260
    expect(t.proteinG).toBe(128); // 1.6 g/kg
    expect(t.clampedToMinimum).toBe(false);
  });
  it("macro calories add back up to the target (within rounding)", () => {
    const t = calculateTargets({ sex: "female", weightKg: 60, heightCm: 165, age: 28, activity: "light", goal: "maintain" });
    const kcalFromMacros = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9;
    expect(Math.abs(kcalFromMacros - t.kcal)).toBeLessThan(10);
  });
  it("never goes below the safe minimum and says so", () => {
    const t = calculateTargets({ sex: "female", weightKg: 45, heightCm: 150, age: 70, activity: "sedentary", goal: "lose" });
    expect(t.kcal).toBe(1200);
    expect(t.clampedToMinimum).toBe(true);
  });
});

describe("activity energy", () => {
  it("estimates about 400 kcal for 10,000 steps at 70 kg", () => {
    expect(stepsToKcal(10000, 70)).toBe(400);
  });
  it("counts only active MET above rest for workouts", () => {
    // Running MET 9.8 -> (9.8 - 1) * 70 kg * 0.5 h = 308
    expect(workoutKcal("Running", 30, 70)).toBe(308);
  });
  it("falls back to a moderate MET for unknown types", () => {
    expect(workoutKcal("Bouldering", 60, 70)).toBe(280);
  });
});

describe("scaling and totals", () => {
  const rice = { kcal: 130, protein: 2.7, carbs: 28.2, fat: 0.3, fiber: 0.4 };
  it("scales per-100 g values to the eaten weight", () => {
    expect(scaleNutrients(rice, 158)).toEqual({ kcal: 205.4, proteinG: 4.3, carbsG: 44.6, fatG: 0.5, fiberG: 0.6 });
  });
  it("sums several items", () => {
    const a = scaleNutrients(rice, 100);
    expect(sumNutrients([a, a]).kcal).toBe(260);
  });
  it("splits calories between macros", () => {
    expect(macroCaloriePercents({ proteinG: 25, carbsG: 50, fatG: 11.1 })).toEqual({ protein: 25, carbs: 50, fat: 25 });
    expect(macroCaloriePercents({ proteinG: 0, carbsG: 0, fatG: 0 })).toEqual({ protein: 0, carbs: 0, fat: 0 });
  });
});

describe("progressState", () => {
  it.each([
    [80, 100, "under"],
    [95, 100, "on"],
    [110, 100, "on"],
    [111, 100, "over"],
  ] as const)("%d of %d is %s", (consumed, target, state) => {
    expect(progressState(consumed, target)).toBe(state);
  });
});
