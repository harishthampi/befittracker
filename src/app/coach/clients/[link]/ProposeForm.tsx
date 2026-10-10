"use client";

import { useActionState, useState } from "react";
import { proposeTargets } from "@/app/coaching-actions";
import type { FormState } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";

export interface TargetValues {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  steps: number;
}

/** Suggest new daily targets. The client accepts or declines on their Coach page. */
export function ProposeForm({ link, current }: { link: string; current: TargetValues }) {
  const [state, action] = useActionState<FormState, FormData>(proposeTargets, {});
  const [v, setV] = useState(current);
  const set = (k: keyof TargetValues) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: Number(e.target.value) });
  const macroKcal = v.protein_g * 4 + v.carbs_g * 4 + v.fat_g * 9;
  const gap = Math.round(macroKcal - v.kcal);

  const field = (k: keyof TargetValues, label: string, step = 1) => (
    <div className="field">
      <label htmlFor={`p-${k}`}>{label}</label>
      <input id={`p-${k}`} name={k} type="number" inputMode="numeric" step={step} value={v[k]} onChange={set(k)} required />
    </div>
  );

  return (
    <form action={action}>
      <input type="hidden" name="link" value={link} />
      <div className="grid-2">
        {field("kcal", "Calories (kcal)", 10)}
        {field("steps", "Steps", 500)}
        {field("protein_g", "Protein (g)")}
        {field("carbs_g", "Carbs (g)")}
        {field("fat_g", "Fat (g)")}
      </div>
      <p className={`small ${Math.abs(gap) > 50 ? "state-warn" : "muted"}`} role="status">
        Macros add up to {macroKcal.toLocaleString("en-CA")} kcal
        {Math.abs(gap) > 50 ? ` — ${Math.abs(gap)} kcal ${gap > 0 ? "over" : "under"} the calorie target.` : "."}
      </p>
      <div className="field">
        <label htmlFor="p-message">Message (optional)</label>
        <textarea id="p-message" name="message" rows={2} maxLength={500} placeholder="Why the change, e.g. more protein on training days" />
      </div>
      <FormMessage state={state} />
      <SubmitButton pending="Sending…">Send suggestion</SubmitButton>
    </form>
  );
}
