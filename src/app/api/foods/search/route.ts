import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { searchUsda } from "@/lib/food-sources/usda";
import { searchOff } from "@/lib/food-sources/openfoodfacts";
import { mergeAndRank } from "@/lib/food-sources/rank";
import type { FoodResult, FoodSource } from "@/lib/food-sources/types";

/**
 * GET /api/foods/search?q=rice
 *
 * Order of lookup (section 11 of the plan):
 *   1. Our own database: the person's custom foods, the imported Indian Nutrient Databank,
 *      and the shared cache of past lookups.
 *   2. USDA FoodData Central and Open Food Facts, in parallel, each with a timeout.
 * Results are merged, de-duplicated and ranked. New results from step 2 are saved
 * to the shared cache so the next search for the same thing costs no API call.
 *
 * Only signed-in people can call this, so it can't be used as a free proxy.
 */

const TIMEOUT_MS = 6000;

interface FoodRow {
  id: string;
  owner_id: string | null;
  source: FoodSource;
  source_id: string | null;
  name: string;
  brand: string | null;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fiber_100g: number;
  servings: { label: string; grams: number }[];
}

function rowToResult(r: FoodRow): FoodResult {
  return {
    source: r.source,
    sourceId: r.source === "custom" ? r.id : (r.source_id ?? r.id),
    name: r.name,
    brand: r.brand,
    per100: {
      kcal: Number(r.kcal_100g),
      protein: Number(r.protein_100g),
      carbs: Number(r.carbs_100g),
      fat: Number(r.fat_100g),
      fiber: Number(r.fiber_100g),
    },
    servings: Array.isArray(r.servings) ? r.servings : [],
  };
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to search foods." }, { status: 401 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().replace(/\s+/g, " ");
  if (q.length < 2) return NextResponse.json({ results: [], status: {} });
  if (q.length > 60) return NextResponse.json({ error: "Search is too long." }, { status: 400 });

  // 1. Local: custom foods + shared cache. Escape LIKE wildcards in the query.
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const localPromise = supabase
    .from("foods")
    .select("id, owner_id, source, source_id, name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, servings")
    .ilike("name", like)
    // 30, not 20: the imported Indian Nutrient Databank lives here too, so local hits matter more.
    .limit(30);

  // 2. Remote sources, each allowed to fail without breaking the search.
  const [local, usda, off] = await Promise.allSettled([
    localPromise,
    withTimeout((s) => searchUsda(q, process.env.USDA_API_KEY ?? "", s)),
    withTimeout((s) => searchOff(q, s)),
  ]);

  const localResults =
    local.status === "fulfilled" ? ((local.value.data ?? []) as FoodRow[]).map(rowToResult) : [];
  const usdaResults = usda.status === "fulfilled" ? usda.value : [];
  const offResults = off.status === "fulfilled" ? off.value : [];

  const results = mergeAndRank(q, [localResults, usdaResults, offResults]);

  // 3. Best-effort cache of remote results (needs the service-role key; skipped otherwise).
  const admin = createAdminClient();
  const fresh = [...usdaResults, ...offResults].slice(0, 30);
  if (admin && fresh.length) {
    await admin
      .from("foods")
      .upsert(
        fresh.map((f) => ({
          owner_id: null,
          source: f.source,
          source_id: f.sourceId,
          name: f.name,
          brand: f.brand,
          kcal_100g: f.per100.kcal,
          protein_100g: f.per100.protein,
          carbs_100g: f.per100.carbs,
          fat_100g: f.per100.fat,
          fiber_100g: f.per100.fiber,
          servings: f.servings,
        })),
        { onConflict: "source,source_id", ignoreDuplicates: true },
      )
      .then(
        () => undefined,
        () => undefined,
      );
  }

  return NextResponse.json({
    results,
    status: {
      usda: usda.status === "fulfilled" ? "ok" : "unavailable",
      openFoodFacts: off.status === "fulfilled" ? "ok" : "unavailable",
    },
  });
}
