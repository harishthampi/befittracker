"use client";

import { useActionState, useState } from "react";
import { saveTargets } from "../actions";
import type { FormState } from "@/app/(auth)/actions";
import type { TargetRow } from "@/lib/profile";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";

/** Editable targets with a live check that the macros add up to the calorie target. */
export function TargetsForm({ initial }: { initial: TargetRow }) {
  const [state, action] = useActionState<FormState, FormData>(saveTargets, {});
  const [v, setV] = useState(initial);
  const set = (k: keyof TargetRow) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV({ ...v, [k]: Number(e.target.value) });

  const macroKcal = v.protein_g * 4 + v.carbs_g * 4 + v.fat_g * 9;
  const gap = Math.round(macroKcal - v.kcal);

  const field = (k: keyof TargetRow, label: string, unit: string, step = 1) => (
    <div className="field">
      <label htmlFor={k}>
        {label} <span className="muted small">({unit})</span>
      </label>
      <input id={k} name={k} type="number" inputMode="numeric" step={step} value={v[k]} onChange={set(k)} required />
    </div>
  );

  return (
    <form action={action} className="stack">
      <div className="card">
        <h2>Food</h2>
        {field("kcal", "Calories", "kcal", 10)}
        <div className="grid-2">
          {field("protein_g", "Protein", "g")}
          {field("carbs_g", "Carbs", "g")}
          {field("fat_g", "Fat", "g")}
          {field("fiber_g", "Fiber", "g")}
        </div>
        <p className={`small ${Math.abs(gap) > 50 ? "state-warn" : "muted"}`} role="status">
          Macros add up to {macroKcal.toLocaleString("en-CA")} kcal
          {Math.abs(gap) > 50 ? ` — ${Math.abs(gap)} kcal ${gap > 0 ? "over" : "under"} your calorie target.` : "."}
        </p>
      </div>
      <div className="card">
        <h2>Activity &amp; water</h2>
        <div className="grid-2">
          {field("steps", "Steps", "per day", 500)}
          {field("active_kcal", "Calories burned", "kcal", 10)}
          {field("water_ml", "Water", "ml", 250)}
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton>Save targets</SubmitButton>
    </form>
  );
}
