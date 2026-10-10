import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Checks the generated supabase/seed/indb_foods.sql against the limits the database
 * enforces (0001_init.sql CHECK constraints), so a bad row can't make the import fail
 * halfway in the Supabase SQL editor.
 */
const sql = readFileSync(path.resolve(__dirname, "../../../supabase/seed/indb_foods.sql"), "utf8");

// One VALUES row: (null, 'indb', 'CODE', 'Name', null, kcal, protein, carbs, fat, fibre, 'json'::jsonb)
const ROW =
  /^\s*\(null, 'indb', '([^']+)', '((?:[^']|'')+)', null, ([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+), '((?:[^']|'')*)'::jsonb\),?$/;

const rows = sql
  .split("\n")
  .filter((l) => l.trimStart().startsWith("(null, 'indb'"))
  .map((line) => {
    const m = line.match(ROW);
    if (!m) throw new Error(`Unparseable row: ${line.slice(0, 120)}`);
    return {
      code: m[1],
      name: m[2].replace(/''/g, "'"),
      kcal: Number(m[3]),
      protein: Number(m[4]),
      carbs: Number(m[5]),
      fat: Number(m[6]),
      fibre: Number(m[7]),
      servings: JSON.parse(m[8].replace(/''/g, "'")) as { label: string; grams: number }[],
    };
  });

describe("INDB seed file", () => {
  it("contains the expected number of foods", () => {
    expect(rows.length).toBe(980);
  });

  it("has unique source ids (the upsert key)", () => {
    expect(new Set(rows.map((r) => r.code)).size).toBe(rows.length);
  });

  it("respects every database limit", () => {
    for (const r of rows) {
      expect(r.name.length, r.code).toBeGreaterThan(0);
      expect(r.name.length, r.code).toBeLessThanOrEqual(200);
      expect(r.kcal, r.code).toBeGreaterThan(0);
      expect(r.kcal, r.code).toBeLessThanOrEqual(950);
      for (const v of [r.protein, r.carbs, r.fat, r.fibre]) expect(v, r.code).toBeLessThanOrEqual(100);
      for (const s of r.servings) {
        expect(s.grams, r.code).toBeGreaterThanOrEqual(5);
        expect(s.grams, r.code).toBeLessThanOrEqual(600);
        expect(s.label.length, r.code).toBeLessThanOrEqual(60);
      }
    }
  });

  it("includes the core South Indian dishes", () => {
    const names = rows.map((r) => r.name.toLowerCase());
    for (const dish of ["idli", "sambar", "avial", "appam", "rice puttu", "plain dosa", "chicken stew", "medu vada"]) {
      expect(names.some((n) => n.includes(dish)), dish).toBe(true);
    }
  });
});
