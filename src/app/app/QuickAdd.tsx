"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { addWater, addWorkout, setSteps } from "./actions";
import type { FormState } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";
import { WORKOUT_METS } from "@/lib/nutrition";

type Panel = "steps" | "water" | "workout" | null;

/**
 * Quick-add row on Home: Food (goes to search), Steps, Water, Workout.
 * Steps/Water/Workout open a small inline form instead of a new page.
 */
export function QuickAdd({ currentSteps, today }: { currentSteps: number; today: string }) {
  const [open, setOpen] = useState<Panel>(null);
  const toggle = (p: Panel) => setOpen(open === p ? null : p);

  const button = (p: Exclude<Panel, null>, icon: string, label: string) => (
    <button type="button" className="btn btn-ghost" aria-expanded={open === p} aria-controls={`qa-${p}`} onClick={() => toggle(p)}>
      <span aria-hidden="true">{icon}</span>
      {label}
    </button>
  );

  return (
    <section className="card" aria-labelledby="qa-title">
      <h2 id="qa-title">Quick add</h2>
      <div className="quick-add" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <Link className="btn btn-ghost" href="/app/food/add">
          <span aria-hidden="true">🍽</span>
          Food
        </Link>
        {button("steps", "👟", "Steps")}
        {button("water", "💧", "Water")}
        {button("workout", "🏋", "Workout")}
      </div>
      {open === "steps" && <StepsForm current={currentSteps} today={today} />}
      {open === "water" && <WaterForm />}
      {open === "workout" && <WorkoutForm date={today} />}
    </section>
  );
}

function StepsForm({ current, today }: { current: number; today: string }) {
  const [state, action] = useActionState<FormState, FormData>(setSteps, {});
  return (
    <form id="qa-steps" action={action} style={{ marginTop: "1rem" }}>
      <input type="hidden" name="date" value={today} />
      <div className="field">
        <label htmlFor="steps">Today&apos;s steps</label>
        <input id="steps" name="steps" type="number" inputMode="numeric" min={0} max={150000} defaultValue={current || ""} required autoFocus />
        <p className="hint">Copy the number from your phone or watch. This replaces today&apos;s total.</p>
      </div>
      <FormMessage state={state} />
      <SubmitButton>Save steps</SubmitButton>
    </form>
  );
}

function WaterForm() {
  const [state, action] = useActionState<FormState, FormData>(addWater, {});
  return (
    <div id="qa-water" style={{ marginTop: "1rem" }}>
      <div className="row">
        {[250, 500, 750].map((ml) => (
          <form key={ml} action={action}>
            <input type="hidden" name="ml" value={ml} />
            <SubmitButton className="btn btn-small" pending="…">
              +{ml} ml
            </SubmitButton>
          </form>
        ))}
      </div>
      <form action={action} className="row" style={{ marginTop: "0.75rem", flexWrap: "nowrap" }}>
        <label htmlFor="water-custom" className="visually-hidden">
          Custom amount in ml
        </label>
        <input id="water-custom" name="ml" type="number" inputMode="numeric" min={1} max={5000} placeholder="Other amount (ml)" />
        <SubmitButton className="btn btn-small">Add</SubmitButton>
      </form>
      <div style={{ marginTop: "0.75rem" }}>
        <FormMessage state={state} />
      </div>
    </div>
  );
}

/**
 * Workout form, shared by Home quick-add (today) and the diary (the day being viewed).
 * `idPrefix` keeps label/input ids unique if two forms are ever on one page.
 */
export function WorkoutForm({ date, idPrefix = "qa" }: { date?: string; idPrefix?: string }) {
  const [state, action] = useActionState<FormState, FormData>(addWorkout, {});
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <form id={id("workout")} action={action} style={{ marginTop: "1rem" }}>
      {date && <input type="hidden" name="date" value={date} />}
      <div className="grid-2">
        <div className="field">
          <label htmlFor={id("type")}>Type</label>
          <select id={id("type")} name="type" defaultValue="Strength training">
            {Object.keys(WORKOUT_METS).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={id("minutes")}>Minutes</label>
          <input id={id("minutes")} name="minutes" type="number" inputMode="numeric" min={1} max={600} required />
        </div>
      </div>
      <div className="field">
        <label htmlFor={id("kcal")}>Calories burned (optional)</label>
        <input id={id("kcal")} name="kcal" type="number" inputMode="numeric" min={0} max={5000} />
        <p className="hint">Leave empty and we&apos;ll estimate from the type, time and your weight.</p>
      </div>
      <FormMessage state={state} />
      <SubmitButton>Log workout</SubmitButton>
    </form>
  );
}
