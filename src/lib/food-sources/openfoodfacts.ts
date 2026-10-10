import { cleanName, isPlausible, type FoodResult, type Serving } from "./types";

/**
 * Open Food Facts adapter — free, no key, crowd-sourced packaged foods.
 * Docs: https://openfoodfacts.github.io/openfoodfacts-server/api/
 * Data licence: ODbL, so the app shows an attribution line in the footer.
 * OFF asks every app to send a descriptive User-Agent.
 */

const ENDPOINT = "https://world.openfoodfacts.org/cgi/search.pl";
const USER_AGENT = "BeFitTracker/0.1 (family nutrition tracker)";

export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  serving_quantity?: number | string;
  serving_size?: string;
  nutriments?: Record<string, number | string | undefined>;
}

function n(v: number | string | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  const x = Number(v);
  return Number.isFinite(x) ? x : undefined;
}

/** Converts one OFF product into our FoodResult, or null when it lacks a name or calories. */
export function normalizeOff(p: OffProduct): FoodResult | null {
  const name = (p.product_name_en || p.product_name || "").trim();
  if (!p.code || !name) return null;
  const m = p.nutriments ?? {};

  // Prefer kcal; fall back to kJ ÷ 4.184.
  let kcal = n(m["energy-kcal_100g"]);
  if (kcal === undefined) {
    const kj = n(m["energy-kj_100g"]) ?? n(m["energy_100g"]);
    if (kj !== undefined) kcal = Math.round((kj / 4.184) * 10) / 10;
  }
  if (kcal === undefined) return null;

  const servings: Serving[] = [];
  const sq = n(p.serving_quantity);
  if (sq && sq > 0 && sq <= 5000) {
    servings.push({ label: `1 serving${p.serving_size ? ` (${p.serving_size})` : ` (${sq} g)`}`.slice(0, 60), grams: sq });
  }

  const result: FoodResult = {
    source: "off",
    sourceId: p.code,
    name: cleanName(name),
    brand: p.brands ? p.brands.split(",")[0].trim().slice(0, 120) : null,
    per100: {
      kcal,
      protein: n(m["proteins_100g"]) ?? 0,
      carbs: n(m["carbohydrates_100g"]) ?? 0,
      fat: n(m["fat_100g"]) ?? 0,
      fiber: n(m["fiber_100g"]) ?? 0,
    },
    servings,
  };
  return isPlausible(result) ? result : null;
}

export async function searchOff(query: string, signal?: AbortSignal): Promise<FoodResult[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("search_terms", query);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "15");
  url.searchParams.set("fields", "code,product_name,product_name_en,brands,serving_quantity,serving_size,nutriments");

  const res = await fetch(url, { signal, headers: { "User-Agent": USER_AGENT }, next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`OFF ${res.status}`);
  const body = (await res.json()) as { products?: OffProduct[] };
  return (body.products ?? []).map(normalizeOff).filter((f): f is FoodResult => f !== null);
}
