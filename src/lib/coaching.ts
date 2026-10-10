/**
 * Coaching rules shared by the instructor and client screens: what each sharing scope means,
 * and the "off-track" flags shown on the instructor's client list.
 */

import { addDays } from "@/lib/dates";
import { progressState } from "@/lib/nutrition";

export type Scope = "activity" | "nutrition" | "body" | "goals";
export const SCOPES: readonly Scope[] = ["activity", "nutrition", "body", "goals"];

export const SCOPE_INFO: Record<Scope, { label: string; detail: string }> = {
  activity: { label: "Activity", detail: "Steps, workouts and calories burned" },
  nutrition: { label: "Food", detail: "Food diary, calories, macros and water" },
  body: { label: "Body", detail: "Age, sex, height and weight" },
  goals: { label: "Goals", detail: "Calorie, macro and step targets" },
};

export function cleanScopes(values: unknown[]): Scope[] {
  return SCOPES.filter((s) => values.includes(s));
}

/** One day for a client, as returned by the coach_daily function (null = not shared). */
export interface ClientDay {
  local_date: string;
  steps: number | null;
  intake_kcal: number | null;
  workout_kcal: number | null;
  burned_kcal: number | null;
}

export interface Flag {
  key: "no-food" | "off-calories" | "low-steps" | "no-activity";
  text: string;
}

/**
 * Off-track flags over the last 7 days (today included), using only what the client shares:
 *   - no food logged for 2+ days in a row (counting back from yesterday, so today isn't held against them);
 *   - calories more than 20% off target on 3 of the last 5 logged days (needs goals);
 *   - step goal missed on 5 or more of the last 7 days with steps entered (needs goals);
 *   - nothing at all logged in 3+ days.
 */
export function flagsFor(
  days: ClientDay[],
  today: string,
  opts: { nutrition: boolean; activity: boolean; kcalTarget?: number; stepGoal?: number },
): Flag[] {
  const byDate = new Map(days.map((d) => [d.local_date, d]));
  const flags: Flag[] = [];
  const ate = (d: string) => Number(byDate.get(d)?.intake_kcal ?? 0) > 0;
  const moved = (d: string) => Number(byDate.get(d)?.steps ?? 0) > 0 || Number(byDate.get(d)?.workout_kcal ?? 0) > 0;

  // Last day with anything at all.
  let quiet = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, -i);
    if ((opts.nutrition && ate(d)) || (opts.activity && moved(d))) break;
    quiet++;
  }
  if (quiet >= 3) flags.push({ key: "no-activity", text: `Nothing logged in ${quiet === 7 ? "7+" : quiet} days` });

  if (opts.nutrition && quiet < 3) {
    let gap = 0;
    for (let i = 1; i <= 6; i++) {
      if (ate(addDays(today, -i))) break;
      gap++;
    }
    if (gap >= 2) flags.push({ key: "no-food", text: `No food logged for ${gap === 6 ? "6+" : gap} days` });
  }

  if (opts.nutrition && opts.kcalTarget) {
    const logged = [...Array(7)]
      .map((_, i) => addDays(today, -i))
      .filter(ate)
      .slice(0, 5);
    const off = logged.filter((d) => {
      const ratio = Number(byDate.get(d)!.intake_kcal) / opts.kcalTarget!;
      return ratio < 0.8 || ratio > 1.2;
    }).length;
    if (logged.length >= 3 && off >= 3) flags.push({ key: "off-calories", text: `Calories 20%+ off target on ${off} of ${logged.length} days` });
  }

  if (opts.activity && opts.stepGoal) {
    const withSteps = [...Array(7)].map((_, i) => addDays(today, -i)).filter((d) => Number(byDate.get(d)?.steps ?? 0) > 0);
    const missed = withSteps.filter((d) => Number(byDate.get(d)!.steps) < opts.stepGoal!).length;
    if (withSteps.length >= 5 && missed >= 5) flags.push({ key: "low-steps", text: `Step goal missed ${missed} of ${withSteps.length} days` });
  }
  return flags;
}

/** Most recent day with anything logged, or null. */
export function lastLogged(days: ClientDay[]): string | null {
  const logged = days.filter(
    (d) => Number(d.intake_kcal ?? 0) > 0 || Number(d.steps ?? 0) > 0 || Number(d.workout_kcal ?? 0) > 0,
  );
  return logged.length ? logged.map((d) => d.local_date).sort().at(-1)! : null;
}

/** Status word for today's calories vs target, matching the diary colours. */
export function kcalStatus(eaten: number, target: number): "under" | "on" | "over" {
  return progressState(eaten, target);
}

/** Invite codes are shown as ABCD-EFGH for readability; accept either form. */
export function formatCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}
