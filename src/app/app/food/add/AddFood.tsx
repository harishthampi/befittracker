"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addFoodEntry, createCustomFood } from "../../actions";
import type { FormState } from "@/app/(auth)/actions";
import { MEALS, MEAL_LABEL, type Meal } from "@/lib/meals";
import { scaleNutrients } from "@/lib/nutrition";
import { BASE_SERVINGS, type FoodResult, type Serving } from "@/lib/food-sources/types";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";

const SOURCE_LABEL: Record<FoodResult["source"], string> = {
  usda: "USDA",
  off: "Open Food Facts",
  indb: "Indian Nutrient Databank",
  custom: "My food",
};

/**
 * Screen F3 — search, pick a measurement and amount, see live nutrients, add to a meal.
 * Search runs on the server (/api/foods/search); this component only shows results.
 */
export function AddFood({ date, initialMeal, recent }: { date: string; initialMeal: Meal; recent: FoodResult[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FoodResult | null>(null);
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [saved, setSaved] = useState<FormState>({});

  // Debounced search: wait 350 ms after typing stops, and cancel stale requests.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setSearchError(null);
      try {
        const res = await fetch(`/api/foods/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Search failed");
        setResults(body.results ?? []);
        const down = Object.entries(body.status ?? {}).filter(([, v]) => v !== "ok");
        if (down.length === 2) setSearchError("The food databases aren't responding. Showing saved foods only.");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setSearchError("Search isn't working right now. Try again in a moment.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const list = query.trim().length >= 2 ? results : recent;

  return (
    <div className="stack">
      <div className="card">
        <div className="field">
          <label htmlFor="meal">Meal</label>
          <select id="meal" value={meal} onChange={(e) => setMeal(e.target.value as Meal)}>
            {MEALS.map((m) => (
              <option key={m} value={m}>
                {MEAL_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="q">Search foods</label>
          <input
            id="q"
            type="search"
            placeholder="e.g. idli, sambar, avial, fish curry, rice"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
            autoComplete="off"
            aria-describedby="q-status"
          />
          <p id="q-status" className="hint" role="status" aria-live="polite">
            {loading ? "Searching…" : query.trim().length >= 2 ? `${results.length} results` : ""}
          </p>
        </div>
      </div>

      <FormMessage state={saved} />
      {searchError && (
        <p className="alert alert-warn" role="alert">
          {searchError}
        </p>
      )}

      {selected ? (
        <PortionPicker
          key={`${selected.source}:${selected.sourceId}`}
          food={selected}
          meal={meal}
          date={date}
          onCancel={() => setSelected(null)}
          onSaved={(s) => {
            setSaved(s);
            if (!s.error) {
              setSelected(null);
              setQuery("");
            }
          }}
        />
      ) : (
        <section className="card" aria-labelledby="results-title">
          <h2 id="results-title">{query.trim().length >= 2 ? "Results" : "Recent foods"}</h2>
          {list.length === 0 && !loading && (
            <p className="muted small">
              {query.trim().length >= 2
                ? "No matches. Try a simpler word (\"rice\" instead of \"jeera rice\"), or add it as your own food below."
                : "Foods you log will show up here for quick re-adding."}
            </p>
          )}
          <ul className="results">
            {list.map((f) => (
              <li key={`${f.source}:${f.sourceId}`}>
                <button type="button" className="result-btn" onClick={() => setSelected(f)}>
                  <span className="entry-name">{f.name}</span>
                  <span className="small muted">
                    {f.brand ? `${f.brand} · ` : ""}
                    {Math.round(f.per100.kcal)} kcal per 100 g · P {f.per100.protein} · C {f.per100.carbs} · F {f.per100.fat}
                  </span>
                  <span className="source-tag">{SOURCE_LABEL[f.source]}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CustomFoodForm />

      <p className="small">
        <Link href={`/app/diary?date=${date}`}>← Back to diary</Link>
      </p>
    </div>
  );
}

/** Measurement + amount, with nutrients recalculated on every keystroke. */
function PortionPicker({
  food,
  meal,
  date,
  onCancel,
  onSaved,
}: {
  food: FoodResult;
  meal: Meal;
  date: string;
  onCancel: () => void;
  onSaved: (s: FormState) => void;
}) {
  // Source servings first (cup, slice, piece), then grams and ounces.
  const servings: Serving[] = useMemo(() => {
    const own = food.servings.filter((s) => s.grams > 0);
    return [...own, ...BASE_SERVINGS.filter((b) => !own.some((o) => o.label === b.label))];
  }, [food]);

  const [servingIndex, setServingIndex] = useState(0);
  const serving = servings[servingIndex];
  const [quantity, setQuantity] = useState(serving.label === "g" ? "100" : "1");
  const [pending, startTransition] = useTransition();

  const qty = Number(quantity);
  const valid = Number.isFinite(qty) && qty > 0 && qty <= 1000;
  const grams = valid ? qty * serving.grams : 0;
  const n = scaleNutrients(food.per100, grams);

  function save() {
    if (!valid) return;
    startTransition(async () => {
      const result = await addFoodEntry({
        date,
        meal,
        food: { source: food.source, sourceId: food.sourceId, name: food.name, brand: food.brand, per100: food.per100 },
        quantity: qty,
        unitLabel: serving.label,
        gramsPerUnit: serving.grams,
      });
      onSaved(result);
    });
  }

  return (
    <section className="card" aria-labelledby="pick-title">
      <h2 id="pick-title">{food.name}</h2>
      {food.brand && <p className="muted small">{food.brand}</p>}

      <div className="grid-2">
        <div className="field">
          <label htmlFor="qty">Amount</label>
          <input
            id="qty"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-invalid={!valid}
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="unit">Measurement</label>
          <select
            id="unit"
            value={servingIndex}
            onChange={(e) => {
              const i = Number(e.target.value);
              setServingIndex(i);
              setQuantity(servings[i].label === "g" ? "100" : "1");
            }}
          >
            {servings.map((s, i) => (
              <option key={`${s.label}-${i}`} value={i}>
                {s.label === "g" || s.label === "oz" ? s.label : `${s.label} (${Math.round(s.grams)} g)`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="row-between" aria-live="polite">
        <div>
          <div className="big-number">{Math.round(n.kcal)}</div>
          <div className="small muted">kcal · {Math.round(grams)} g</div>
        </div>
        <div className="macro-chips">
          <span className="chip chip-p">P {n.proteinG} g</span>
          <span className="chip chip-c">C {n.carbsG} g</span>
          <span className="chip chip-f">F {n.fatG} g</span>
          <span className="chip">Fiber {n.fiberG} g</span>
        </div>
      </div>

      <div className="row" style={{ marginTop: "1rem" }}>
        <button type="button" className="btn" onClick={save} disabled={!valid || pending} aria-busy={pending}>
          {pending ? "Adding…" : `Add to ${MEAL_LABEL[meal]}`}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Back to results
        </button>
      </div>
      <p className="hint">Values come from public databases and are approximate.</p>
    </section>
  );
}

/** For homemade or local dishes the databases don't have: enter values for one serving. */
function CustomFoodForm() {
  const [state, action] = useActionState<FormState, FormData>(createCustomFood, {});
  return (
    <details className="card">
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Can&apos;t find it? Add your own food</summary>
      <form action={action} style={{ marginTop: "1rem" }}>
        <div className="field">
          <label htmlFor="cf-name">Name</label>
          <input id="cf-name" name="name" required maxLength={200} placeholder="e.g. Mom's chicken biryani" />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="cf-serving">Serving name</label>
            <input id="cf-serving" name="serving_label" placeholder="1 cup" maxLength={60} />
          </div>
          <div className="field">
            <label htmlFor="cf-grams">Serving weight (g)</label>
            <input id="cf-grams" name="serving_grams" type="number" inputMode="decimal" min={1} step="any" required />
          </div>
          <div className="field">
            <label htmlFor="cf-kcal">Calories per serving</label>
            <input id="cf-kcal" name="kcal" type="number" inputMode="decimal" min={0} step="any" required />
          </div>
          <div className="field">
            <label htmlFor="cf-protein">Protein (g)</label>
            <input id="cf-protein" name="protein" type="number" inputMode="decimal" min={0} step="any" />
          </div>
          <div className="field">
            <label htmlFor="cf-carbs">Carbs (g)</label>
            <input id="cf-carbs" name="carbs" type="number" inputMode="decimal" min={0} step="any" />
          </div>
          <div className="field">
            <label htmlFor="cf-fat">Fat (g)</label>
            <input id="cf-fat" name="fat" type="number" inputMode="decimal" min={0} step="any" />
          </div>
          <div className="field">
            <label htmlFor="cf-fiber">Fiber (g)</label>
            <input id="cf-fiber" name="fiber" type="number" inputMode="decimal" min={0} step="any" />
          </div>
        </div>
        <FormMessage state={state} />
        <SubmitButton>Save food</SubmitButton>
      </form>
    </details>
  );
}
