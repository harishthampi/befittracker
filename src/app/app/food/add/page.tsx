import { requireUserProfile } from "@/lib/profile";
import { parseDateParam, formatDay } from "@/lib/dates";
import { isMeal, mealForHour } from "@/lib/meals";
import type { FoodResult } from "@/lib/food-sources/types";
import { AddFood } from "./AddFood";

export const metadata = { title: "Add food" };

/**
 * Add-food page. ?meal= and ?date= come from the diary's "Add food" buttons;
 * without them we pick today and the meal that fits the current hour.
 */
export default async function AddFoodPage({
  searchParams,
}: {
  searchParams: Promise<{ meal?: string; date?: string }>;
}) {
  const { supabase, user, profile, today } = await requireUserProfile();
  const params = await searchParams;
  const date = parseDateParam(params.date, today);

  const hour = Number(
    new Intl.DateTimeFormat("en-CA", { hour: "numeric", hourCycle: "h23", timeZone: profile.timezone }).format(new Date()),
  );
  const meal = isMeal(params.meal) ? params.meal : mealForHour(hour);

  // Recent foods: the last 40 entries, one per food, turned back into per-100 g values.
  const { data: rows } = await supabase
    .from("food_entries")
    .select("source, source_id, name, brand, quantity, unit_label, grams, kcal, protein_g, carbs_g, fat_g, fiber_g")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(40);

  const seen = new Set<string>();
  const recent: FoodResult[] = [];
  for (const r of rows ?? []) {
    const key = `${r.source}:${r.source_id ?? r.name}`;
    const grams = Number(r.grams);
    if (seen.has(key) || grams <= 0) continue;
    seen.add(key);
    const f = 100 / grams;
    recent.push({
      source: r.source,
      sourceId: r.source_id ?? r.name,
      name: r.name,
      brand: r.brand,
      per100: {
        kcal: round1(Number(r.kcal) * f),
        protein: round1(Number(r.protein_g) * f),
        carbs: round1(Number(r.carbs_g) * f),
        fat: round1(Number(r.fat_g) * f),
        fiber: round1(Number(r.fiber_g) * f),
      },
      // Offer the measurement used last time first.
      servings:
        r.unit_label === "g" || r.unit_label === "oz"
          ? []
          : [{ label: r.unit_label, grams: grams / Number(r.quantity) }],
    });
    if (recent.length >= 10) break;
  }

  return (
    <div className="stack">
      <div>
        <p className="muted small" style={{ margin: 0 }}>
          {formatDay(date)}
        </p>
        <h1>Add food</h1>
      </div>
      <AddFood date={date} initialMeal={meal} recent={recent} />
    </div>
  );
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
