import type { FoodResult } from "./types";

/**
 * Merges results from several sources into one list:
 *  - removes duplicates (same source + id, or same name + brand),
 *  - ranks: the person's own custom foods, then names that start with the query,
 *    Indian Nutrient Databank dishes, generic foods before branded ones, then shorter names.
 */
export function mergeAndRank(query: string, lists: FoodResult[][], limit = 25): FoodResult[] {
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const all: FoodResult[] = [];

  for (const list of lists) {
    for (const f of list) {
      const idKey = `${f.source}:${f.sourceId}`;
      const nameKey = `${f.name.toLowerCase()}|${(f.brand ?? "").toLowerCase()}`;
      if (seen.has(idKey) || seen.has(nameKey)) continue;
      seen.add(idKey);
      seen.add(nameKey);
      all.push(f);
    }
  }

  const score = (f: FoodResult) => {
    const name = f.name.toLowerCase();
    let s = 0;
    if (f.source === "custom") s += 100;
    // Indian recipes and ingredients first for an Indian-food household; still below exact name matches.
    if (f.source === "indb") s += 12;
    if (name === q) s += 50;
    else if (name.startsWith(q)) s += 30;
    else if (name.includes(q)) s += 15;
    if (!f.brand) s += 10;
    if (f.servings.length > 0) s += 5;
    s -= Math.min(name.length, 80) / 10;
    return s;
  };

  return all
    .map((f, i) => ({ f, s: score(f), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.f);
}
