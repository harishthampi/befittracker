import { cleanName, isPlausible, type FoodResult, type Serving } from "./types";

/**
 * USDA FoodData Central adapter.
 * Docs: https://fdc.nal.usda.gov/api-guide  ·  Free key: https://fdc.nal.usda.gov/api-key-signup
 * Search results already carry nutrients per 100 g, plus household measures
 * ("1 cup", "1 large") for generic foods.
 */

const ENDPOINT = "https://api.nal.usda.gov/fdc/v1/foods/search";

// FDC nutrient ids. Energy appears under different ids depending on the dataset.
const ENERGY_IDS = [1008, 2047, 2048]; // kcal, Atwater general, Atwater specific
const NUTRIENT = { protein: 1003, fat: 1004, carbs: 1005, fiber: 1079 };

interface UsdaNutrient {
  nutrientId?: number;
  nutrientNumber?: string;
  unitName?: string;
  value?: number;
}
interface UsdaMeasure {
  disseminationText?: string;
  gramWeight?: number;
}
export interface UsdaFood {
  fdcId: number;
  description: string;
  dataType?: string;
  brandOwner?: string;
  brandName?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: UsdaNutrient[];
  foodMeasures?: UsdaMeasure[];
}

function nutrient(list: UsdaNutrient[], id: number): number | undefined {
  return list.find((n) => n.nutrientId === id)?.value;
}

function energy(list: UsdaNutrient[]): number | undefined {
  for (const id of ENERGY_IDS) {
    const n = list.find((x) => x.nutrientId === id && (x.unitName ?? "KCAL").toUpperCase() === "KCAL");
    if (n?.value !== undefined) return n.value;
  }
  return undefined;
}

/** Converts one USDA search hit into our FoodResult, or null if it has no calories. */
export function normalizeUsda(food: UsdaFood): FoodResult | null {
  const list = food.foodNutrients ?? [];
  const kcal = energy(list);
  if (kcal === undefined) return null;

  const servings: Serving[] = [];
  for (const m of food.foodMeasures ?? []) {
    const label = m.disseminationText?.trim();
    if (label && label.toLowerCase() !== "quantity not specified" && m.gramWeight && m.gramWeight > 0) {
      servings.push({ label: label.slice(0, 60), grams: m.gramWeight });
    }
  }
  // Branded foods: the label's serving, when it's given in grams or ml (treated as grams).
  const unit = food.servingSizeUnit?.toLowerCase();
  if (food.servingSize && food.servingSize > 0 && (unit === "g" || unit === "grm" || unit === "ml" || unit === "mlt")) {
    const text = food.householdServingFullText?.trim();
    servings.push({
      label: (text ? `${text} (${food.servingSize} ${unit.startsWith("m") ? "ml" : "g"})` : `1 serving (${food.servingSize} g)`).slice(0, 60),
      grams: food.servingSize,
    });
  }

  const result: FoodResult = {
    source: "usda",
    sourceId: String(food.fdcId),
    name: cleanName(titleCase(food.description)),
    brand: food.brandName || food.brandOwner || null,
    per100: {
      kcal,
      protein: nutrient(list, NUTRIENT.protein) ?? 0,
      carbs: nutrient(list, NUTRIENT.carbs) ?? 0,
      fat: nutrient(list, NUTRIENT.fat) ?? 0,
      fiber: nutrient(list, NUTRIENT.fiber) ?? 0,
    },
    servings: dedupeServings(servings).slice(0, 8),
  };
  return isPlausible(result) ? result : null;
}

export async function searchUsda(query: string, apiKey: string, signal?: AbortSignal): Promise<FoodResult[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("api_key", apiKey || "DEMO_KEY");
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "15");
  // Generic foods first (they have household measures); branded after.
  url.searchParams.set("dataType", "Foundation,SR Legacy,Survey (FNDDS),Branded");

  const res = await fetch(url, { signal, next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`USDA ${res.status}`);
  const body = (await res.json()) as { foods?: UsdaFood[] };
  return (body.foods ?? []).map(normalizeUsda).filter((f): f is FoodResult => f !== null);
}

/** USDA descriptions are often ALL CAPS for branded foods ("GREEK YOGURT"). */
function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s,(-])\p{L}/gu, (m) => m.toUpperCase());
}

export function dedupeServings(list: Serving[]): Serving[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const key = s.label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
