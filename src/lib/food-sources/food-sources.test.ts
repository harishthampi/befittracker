import { describe, expect, it } from "vitest";
import { normalizeUsda } from "./usda";
import { normalizeOff } from "./openfoodfacts";
import { mergeAndRank } from "./rank";
import type { FoodResult } from "./types";

describe("normalizeUsda", () => {
  it("reads per-100 g nutrients and household measures", () => {
    const f = normalizeUsda({
      fdcId: 168878,
      description: "Rice, white, long-grain, regular, cooked",
      dataType: "SR Legacy",
      foodNutrients: [
        { nutrientId: 1008, unitName: "KCAL", value: 130 },
        { nutrientId: 1003, unitName: "G", value: 2.69 },
        { nutrientId: 1005, unitName: "G", value: 28.2 },
        { nutrientId: 1004, unitName: "G", value: 0.28 },
        { nutrientId: 1079, unitName: "G", value: 0.4 },
      ],
      foodMeasures: [
        { disseminationText: "1 cup", gramWeight: 158 },
        { disseminationText: "Quantity not specified", gramWeight: 158 },
      ],
    });
    expect(f).not.toBeNull();
    expect(f!.per100.kcal).toBe(130);
    expect(f!.per100.protein).toBe(2.69);
    expect(f!.servings).toEqual([{ label: "1 cup", grams: 158 }]);
  });

  it("falls back to Atwater energy for Foundation foods", () => {
    const f = normalizeUsda({
      fdcId: 1,
      description: "Eggs, Grade A, Large, egg whole",
      foodNutrients: [{ nutrientId: 2047, unitName: "KCAL", value: 148 }],
    });
    expect(f!.per100.kcal).toBe(148);
  });

  it("title-cases ALL CAPS branded names and keeps the label serving", () => {
    const f = normalizeUsda({
      fdcId: 2,
      description: "GREEK YOGURT, PLAIN",
      brandOwner: "Some Dairy Co",
      servingSize: 170,
      servingSizeUnit: "g",
      householdServingFullText: "1 container",
      foodNutrients: [{ nutrientId: 1008, unitName: "KCAL", value: 59 }],
    });
    expect(f!.name).toBe("Greek Yogurt, Plain");
    expect(f!.servings[0]).toEqual({ label: "1 container (170 g)", grams: 170 });
  });

  it("drops foods without calories", () => {
    expect(normalizeUsda({ fdcId: 3, description: "Mystery", foodNutrients: [] })).toBeNull();
  });
});

describe("normalizeOff", () => {
  it("reads kcal and the serving size", () => {
    const f = normalizeOff({
      code: "0062639",
      product_name: "Whole wheat bread",
      brands: "Bakery, Other",
      serving_quantity: 38,
      serving_size: "1 slice (38 g)",
      nutriments: { "energy-kcal_100g": 247, proteins_100g: 13, carbohydrates_100g: 41, fat_100g: 3.4, fiber_100g: 7 },
    });
    expect(f).toMatchObject({ source: "off", brand: "Bakery", per100: { kcal: 247, protein: 13 } });
    expect(f!.servings).toEqual([{ label: "1 serving (1 slice (38 g))", grams: 38 }]);
  });

  it("converts kJ when kcal is missing", () => {
    const f = normalizeOff({ code: "1", product_name: "Juice", nutriments: { "energy-kj_100g": 184.1 } });
    expect(f!.per100.kcal).toBe(44);
  });

  it("rejects impossible crowd-sourced values", () => {
    const f = normalizeOff({ code: "2", product_name: "Typo", nutriments: { "energy-kcal_100g": 2500 } });
    expect(f).toBeNull();
  });

  it("rejects products without a name", () => {
    expect(normalizeOff({ code: "3", nutriments: { "energy-kcal_100g": 100 } })).toBeNull();
  });
});

describe("mergeAndRank", () => {
  const food = (over: Partial<FoodResult>): FoodResult => ({
    source: "usda",
    sourceId: Math.random().toString(),
    name: "x",
    brand: null,
    per100: { kcal: 100, protein: 1, carbs: 1, fat: 1, fiber: 0 },
    servings: [],
    ...over,
  });

  it("puts custom foods first, then exact/prefix matches, generic before branded", () => {
    const ranked = mergeAndRank("rice", [
      [food({ name: "Fried rice", brand: "Brand A" }), food({ name: "Rice, white, cooked" })],
      [food({ source: "custom", name: "Mom's jeera rice" })],
    ]);
    expect(ranked.map((f) => f.name)).toEqual(["Mom's jeera rice", "Rice, white, cooked", "Fried rice"]);
  });

  it("ranks Indian Nutrient Databank dishes above USDA for the same kind of match", () => {
    const ranked = mergeAndRank("fish curry", [
      [food({ name: "Fish curry, ready meal", source: "usda" })],
      [food({ name: "Fish curry (Machli curry)", source: "indb" })],
    ]);
    expect(ranked[0].source).toBe("indb");
  });

  it("removes duplicates by name and brand across sources", () => {
    const ranked = mergeAndRank("oats", [
      [food({ name: "Oats", brand: "Quaker", source: "usda" })],
      [food({ name: "oats", brand: "quaker", source: "off" })],
    ]);
    expect(ranked).toHaveLength(1);
  });
});
