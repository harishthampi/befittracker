/**
 * Logic behind the ring detail screens (Steps, Burned, Eaten): which days a period
 * covers, how bars are grouped, averages, and "goal met" days. Pure functions so they
 * can be unit-tested and reused by the mobile app.
 */

import { addDays } from "@/lib/dates";
import { progressState, stepsToKcal } from "@/lib/nutrition";

export type Metric = "steps" | "burned" | "eaten";
export type Range = "day" | "week" | "month" | "3m" | "year";

export const METRICS: readonly Metric[] = ["steps", "burned", "eaten"];
export const RANGES: readonly Range[] = ["day", "week", "month", "3m", "year"];
export const RANGE_LABEL: Record<Range, string> = { day: "Day", week: "Week", month: "Month", "3m": "3 Months", year: "Year" };

export const METRIC_INFO: Record<Metric, { title: string; unit: string; color: string; strong: string; perDay: string }> = {
  steps: { title: "Steps", unit: "steps", color: "var(--ring-steps)", strong: "var(--ok)", perDay: "steps per day (avg)" },
  burned: { title: "Calories burned", unit: "kcal", color: "var(--ring-burned)", strong: "var(--warn)", perDay: "kcal burned per day (avg)" },
  eaten: { title: "Calories eaten", unit: "kcal", color: "var(--ring-consumed)", strong: "var(--primary-strong)", perDay: "kcal eaten per day (avg)" },
};

export const isMetric = (v: unknown): v is Metric => typeof v === "string" && (METRICS as readonly string[]).includes(v);
export const isRange = (v: unknown): v is Range => typeof v === "string" && (RANGES as readonly string[]).includes(v);

/** One row of the daily_summary view (database totals for a day). */
export interface SummaryRow {
  local_date: string;
  steps: number;
  intake_kcal: number;
  workout_kcal: number;
  /** Already-computed burned calories (the coach view gets this from the database). */
  burned_kcal?: number | null;
}

/** A target version, as stored in the targets table. */
export interface TargetVersion {
  effective_from: string;
  steps: number;
  active_kcal: number;
  kcal: number;
}

export interface DayPoint {
  date: string;
  value: number;
  /** Whether anything was logged for this metric that day (days with no data don't count in averages). */
  logged: boolean;
  goal: number;
  met: boolean;
}

export interface Period {
  from: string;
  to: string;
  /** Anchor dates for the ‹ and › arrows. */
  prev: string;
  next: string;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}
function iso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function dayOfWeek(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
}
function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
/** Same day in another month, clamped (Jan 31 + 1 month = Feb 28). */
function addMonths(date: string, n: number) {
  const { y, m, d } = parts(date);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return iso(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}
export function weekStart(date: string) {
  return addDays(date, -dayOfWeek(date));
}

/** Days from..to inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * The days a range covers around an anchor date. Weeks run Sunday–Saturday;
 * "3 Months" is the 13 weeks ending with the anchor's week.
 */
export function periodFor(range: Range, date: string): Period {
  const { y, m } = parts(date);
  switch (range) {
    case "day":
      return { from: date, to: date, prev: addDays(date, -1), next: addDays(date, 1) };
    case "week": {
      const from = weekStart(date);
      return { from, to: addDays(from, 6), prev: addDays(from, -7), next: addDays(from, 7) };
    }
    case "month":
      return { from: iso(y, m, 1), to: iso(y, m, daysInMonth(y, m)), prev: addMonths(iso(y, m, 1), -1), next: addMonths(iso(y, m, 1), 1) };
    case "3m": {
      const end = addDays(weekStart(date), 6);
      return { from: addDays(weekStart(date), -84), to: end, prev: addDays(date, -91), next: addDays(date, 91) };
    }
    case "year":
      return { from: iso(y, 1, 1), to: iso(y, 12, 31), prev: iso(y - 1, 1, 1), next: iso(y + 1, 1, 1) };
  }
}

/** Header label for a period, e.g. "Today", "Oct 4–10", "October 2026", "Jul 13 – Oct 10", "2026". */
export function periodLabel(range: Range, p: Period, today: string): string {
  const a = parts(p.from);
  const b = parts(p.to);
  const short = (x: { m: number; d: number }) => `${MONTHS[x.m - 1]} ${x.d}`;
  switch (range) {
    case "day":
      return p.from === today ? "Today" : p.from === addDays(today, -1) ? "Yesterday" : dayLabel(p.from, today);
    case "week":
      return a.m === b.m ? `${MONTHS[a.m - 1]} ${a.d}–${b.d}` : `${short(a)} – ${short(b)}`;
    case "month":
      return `${MONTHS_LONG[a.m - 1]} ${a.y}`;
    case "3m":
      return `${short(a)} – ${short(b)}`;
    case "year":
      return String(a.y);
  }
}

/** "Today", "Yesterday", or "Wed, Oct 7". */
export function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  const { m, d } = parts(date);
  return `${WEEKDAYS[dayOfWeek(date)]}, ${MONTHS[m - 1]} ${d}`;
}

// ---------------------------------------------------------------------------
// Values and goals
// ---------------------------------------------------------------------------

/** The target version in force on a date (the earliest one for days before any target existed). */
export function goalFor(metric: Metric, date: string, versions: TargetVersion[]): number {
  if (versions.length === 0) return 0;
  const sorted = [...versions].sort((x, y) => x.effective_from.localeCompare(y.effective_from));
  let v = sorted[0];
  for (const t of sorted) if (t.effective_from <= date) v = t;
  return metric === "steps" ? v.steps : metric === "burned" ? v.active_kcal : v.kcal;
}

/**
 * Steps and burned: met when the goal is reached.
 * Eaten: met when intake lands on target (90–110%), the same rule as the diary bars.
 */
export function isMet(metric: Metric, value: number, goal: number, logged: boolean): boolean {
  if (!logged || goal <= 0) return false;
  return metric === "eaten" ? progressState(value, goal) === "on" : value >= goal;
}

/** Turns database rows into one point per day for the period, filling days with no data. */
export function dailyPoints(
  metric: Metric,
  from: string,
  to: string,
  rows: SummaryRow[],
  versions: TargetVersion[],
  weightKg: number,
): DayPoint[] {
  const byDate = new Map(rows.map((r) => [r.local_date, r]));
  return eachDay(from, to).map((date) => {
    const r = byDate.get(date);
    const steps = Number(r?.steps ?? 0);
    const intake = Number(r?.intake_kcal ?? 0);
    const workout = Number(r?.workout_kcal ?? 0);
    const value =
      metric === "steps"
        ? steps
        : metric === "eaten"
          ? Math.round(intake)
          : r?.burned_kcal != null
            ? Number(r.burned_kcal)
            : Math.round(stepsToKcal(steps, weightKg) + workout);
    const logged = metric === "steps" ? steps > 0 : metric === "eaten" ? intake > 0 : steps > 0 || workout > 0;
    const goal = goalFor(metric, date, versions);
    return { date, value, logged, goal, met: isMet(metric, value, goal, logged) };
  });
}

// ---------------------------------------------------------------------------
// Bars, stats and list rows
// ---------------------------------------------------------------------------

export interface Bar {
  key: string;
  /** Axis label; empty string = no label under this bar. */
  label: string;
  /** null = a future day or a group with nothing logged: draw no bar. */
  value: number | null;
  met: boolean;
  /** Read by screen readers and shown in the list. */
  title: string;
}

export interface ListRow {
  key: string;
  label: string;
  value: number | null;
  met: boolean;
  /** "avg" for grouped rows (weeks, months). */
  note?: string;
  /** Tapping a day opens its Day view. */
  href?: string;
}

function avgLogged(points: DayPoint[]): number | null {
  const logged = points.filter((p) => p.logged);
  return logged.length ? Math.round(logged.reduce((s, p) => s + p.value, 0) / logged.length) : null;
}

/** Bars for the chart. Week and Month: one per day. 3 Months: weekly averages. Year: monthly averages. */
export function barsFor(range: Exclude<Range, "day">, points: DayPoint[], today: string): Bar[] {
  const past = (d: string) => d <= today;

  if (range === "week" || range === "month") {
    return points.map((p) => {
      const { d } = parts(p.date);
      // Week: S M T W T F S. Month: label the 1st, 8th, 15th, 22nd and 29th.
      const label = range === "week" ? WEEKDAYS[dayOfWeek(p.date)][0] : d % 7 === 1 ? String(d) : "";
      return {
        key: p.date,
        label,
        value: past(p.date) ? p.value : null,
        met: p.met,
        title: `${dayLabel(p.date, today)}: ${p.value.toLocaleString("en-CA")}`,
      };
    });
  }

  if (range === "3m") {
    const bars: Bar[] = [];
    for (let i = 0; i < points.length; i += 7) {
      const week = points.slice(i, i + 7).filter((p) => past(p.date));
      const value = avgLogged(week);
      const { m, d } = parts(points[i].date);
      bars.push({
        key: points[i].date,
        label: (i / 7) % 4 === 0 ? `${MONTHS[m - 1]} ${d}` : "",
        value,
        met: false,
        title: `Week of ${MONTHS[m - 1]} ${d}: ${value === null ? "no data" : `${value.toLocaleString("en-CA")} avg`}`,
      });
    }
    return bars;
  }

  // year
  return MONTHS.map((name, idx) => {
    const month = points.filter((p) => parts(p.date).m === idx + 1 && past(p.date));
    const value = avgLogged(month);
    return {
      key: name,
      label: name[0],
      value,
      met: false,
      title: `${MONTHS_LONG[idx]}: ${value === null ? "no data" : `${value.toLocaleString("en-CA")} avg`}`,
    };
  });
}

export interface Stats {
  /** Average over days with something logged, up to today. */
  average: number | null;
  loggedDays: number;
  metDays: number;
  total: number;
}

export function statsFor(points: DayPoint[], today: string): Stats {
  const upToToday = points.filter((p) => p.date <= today);
  const logged = upToToday.filter((p) => p.logged);
  return {
    average: avgLogged(upToToday),
    loggedDays: logged.length,
    metDays: upToToday.filter((p) => p.met).length,
    total: logged.reduce((s, p) => s + p.value, 0),
  };
}

/** List under the chart, newest first. Days for Week/Month, weeks for 3 Months, months for Year. */
export function listFor(metric: Metric, range: Exclude<Range, "day">, points: DayPoint[], today: string): ListRow[] {
  const dayHref = (d: string) => `/app/trends/${metric}?range=day&date=${d}`;
  if (range === "week" || range === "month") {
    return points
      .filter((p) => p.date <= today)
      .reverse()
      .map((p) => ({ key: p.date, label: dayLabel(p.date, today), value: p.logged ? p.value : null, met: p.met, href: dayHref(p.date) }));
  }
  const bars = barsFor(range, points, today);
  const rows: ListRow[] = bars.map((b, i) => {
    if (range === "3m") {
      const start = points[i * 7].date;
      const end = points[Math.min(i * 7 + 6, points.length - 1)].date;
      const a = parts(start);
      const z = parts(end);
      return {
        key: b.key,
        label: `${MONTHS[a.m - 1]} ${a.d} – ${a.m === z.m ? "" : `${MONTHS[z.m - 1]} `}${z.d}`,
        value: b.value,
        met: false,
        note: "avg",
        href: `/app/trends/${metric}?range=week&date=${start}`,
      };
    }
    return { key: b.key, label: MONTHS_LONG[i], value: b.value, met: false, note: "avg" };
  });
  // Drop groups that start after today (future weeks or months).
  const startOf = (i: number) => (range === "3m" ? points[i * 7].date : `${parts(points[0].date).y}-${String(i + 1).padStart(2, "0")}-01`);
  // Weeks/months with nothing logged are left out, so the list isn't a column of dashes.
  return rows.filter((r, i) => startOf(i) <= today && r.value !== null).reverse();
}

/** One-sentence summary under the big number. */
export function summaryLine(metric: Metric, range: Range, s: Stats, day?: DayPoint): string {
  const n = (x: number) => Math.round(x).toLocaleString("en-CA");
  if (range === "day" && day) {
    const gap = day.goal - day.value;
    if (metric === "eaten") {
      if (!day.logged) return "Nothing logged yet for this day.";
      return gap >= 0 ? `${n(gap)} kcal left to reach your target.` : `${n(-gap)} kcal over your target.`;
    }
    if (day.met) return "You hit your goal. Nice work!";
    return metric === "steps" ? `You're ${n(gap)} steps away from your daily goal.` : `${n(gap)} kcal to go to reach your goal.`;
  }
  if (s.loggedDays === 0) return "Nothing logged in this period yet.";
  const days = (k: number) => `${k} day${k === 1 ? "" : "s"}`;
  if (metric === "eaten") return `You were on target on ${days(s.metDays)} out of ${days(s.loggedDays)} logged.`;
  if (metric === "steps") return `You hit your goal on ${days(s.metDays)} and took a total of ${n(s.total)} steps.`;
  return `You hit your goal on ${days(s.metDays)} and burned a total of ${n(s.total)} kcal.`;
}

export function monthName(date: string) {
  return MONTHS_LONG[parts(date).m - 1];
}
