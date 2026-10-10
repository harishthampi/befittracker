import Link from "next/link";
import { notFound } from "next/navigation";
import { requireInstructor, type CoachClient, type Note, type Proposal } from "@/lib/coach-server";
import { flagsFor, SCOPE_INFO, type ClientDay } from "@/lib/coaching";
import { addDays, parseDateParam, todayIn } from "@/lib/dates";
import { MEALS, MEAL_LABEL } from "@/lib/meals";
import { formatAmount } from "@/lib/format";
import { macroCaloriePercents, sumNutrients } from "@/lib/nutrition";
import {
  barsFor,
  dailyPoints,
  dayLabel,
  goalFor,
  listFor,
  METRIC_INFO,
  periodFor,
  periodLabel,
  statsFor,
  summaryLine,
  type Metric,
  type SummaryRow,
  type TargetVersion,
} from "@/lib/trends";
import type { Workout } from "@/lib/day";
import { BarChart } from "@/components/BarChart";
import { ProgressBar } from "@/components/ProgressBar";
import { WorkoutList } from "@/components/WorkoutList";
import { ScopeChips } from "@/components/coaching/ScopeChips";
import { NotesThread } from "@/components/coaching/NotesThread";
import { NoteForm } from "@/components/coaching/NoteForm";
import { endCoaching } from "@/app/coaching-actions";
import { ProposeForm } from "./ProposeForm";

export const metadata = { title: "Client" };

type CoachRange = "week" | "month" | "3m";
const COACH_RANGES: CoachRange[] = ["week", "month", "3m"];
const RANGE_LABEL: Record<CoachRange, string> = { week: "Week", month: "Month", "3m": "3 Months" };
const UUID = /^[0-9a-f-]{36}$/i;

interface FoodRow {
  id: string;
  meal: string;
  name: string;
  quantity: number;
  unit_label: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

/**
 * One client, as their instructor sees them: flags, a chosen day's food and workouts,
 * Week/Month/3 Months charts, notes, and suggested targets. Everything is limited by
 * what the client shares (the database enforces this; the page just hides empty sections).
 */
export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ link: string }>;
  searchParams: Promise<{ metric?: string; range?: string; date?: string; day?: string }>;
}) {
  const { link } = await params;
  if (!UUID.test(link)) notFound();
  const { supabase, user, profile } = await requireInstructor();

  const { data: clientRows } = await supabase.rpc("coach_clients");
  const c = ((clientRows ?? []) as CoachClient[]).find((x) => x.link_id === link);
  if (!c) notFound(); // not your client, or they stopped sharing

  const has = (s: string) => c.scopes.includes(s as never);
  const sp = await searchParams;
  const today = todayIn(c.timezone);
  const day = (() => {
    const d = parseDateParam(sp.day, today);
    return d > today ? today : d;
  })();

  const metrics: Metric[] = [...(has("activity") ? (["steps", "burned"] as Metric[]) : []), ...(has("nutrition") ? (["eaten"] as Metric[]) : [])];
  const metric: Metric = metrics.includes(sp.metric as Metric) ? (sp.metric as Metric) : (metrics[0] ?? "steps");
  const range: CoachRange = COACH_RANGES.includes(sp.range as CoachRange) ? (sp.range as CoachRange) : "week";
  let anchor = parseDateParam(sp.date, today);
  if (anchor > today) anchor = today;
  const period = periodFor(range, anchor);
  const fetchFrom = [period.from, addDays(today, -6)].sort()[0];

  // Mark the client's notes as read now that the coach is looking at them.
  await supabase.rpc("mark_notes_read", { p_link: link });

  const [daily, targets, food, workouts, notes, proposals] = await Promise.all([
    supabase.rpc("coach_daily", { p_client: c.client_id, p_from: fetchFrom, p_to: [period.to, today].sort().at(-1) }),
    has("goals")
      ? supabase.from("targets").select("effective_from, kcal, protein_g, carbs_g, fat_g, steps, active_kcal").eq("user_id", c.client_id)
      : Promise.resolve({ data: [] }),
    has("nutrition")
      ? supabase
          .from("food_entries")
          .select("id, meal, name, quantity, unit_label, grams, kcal, protein_g, carbs_g, fat_g, fiber_g")
          .eq("user_id", c.client_id)
          .eq("local_date", day)
          .order("created_at")
      : Promise.resolve({ data: [] }),
    has("activity")
      ? supabase
          .from("workouts")
          .select("id, type, minutes, active_kcal, source, created_at")
          .eq("user_id", c.client_id)
          .eq("local_date", day)
          .order("created_at")
      : Promise.resolve({ data: [] }),
    supabase.from("coach_notes").select("*").eq("link_id", link).order("created_at"),
    supabase.from("target_proposals").select("*").eq("link_id", link).order("created_at", { ascending: false }).limit(1),
  ]);

  const days = (daily.data ?? []) as ClientDay[];
  const versions = (targets.data ?? []) as (TargetVersion & { protein_g: number; carbs_g: number; fat_g: number })[];
  const rows: SummaryRow[] = days.map((d) => ({
    local_date: d.local_date,
    steps: Number(d.steps ?? 0),
    intake_kcal: Number(d.intake_kcal ?? 0),
    workout_kcal: Number(d.workout_kcal ?? 0),
    burned_kcal: d.burned_kcal,
  }));
  const kcalTarget = versions.length ? goalFor("eaten", today, versions) : undefined;
  const stepGoal = versions.length ? goalFor("steps", today, versions) : undefined;
  const flags = flagsFor(days, today, { nutrition: has("nutrition"), activity: has("activity"), kcalTarget, stepGoal });

  // Targets in force on the selected day (for the snapshot) and today (for suggestions).
  const dayTarget = [...versions].sort((a, b) => a.effective_from.localeCompare(b.effective_from)).filter((t) => t.effective_from <= day).at(-1) ?? versions[0];
  const nowTarget = [...versions].sort((a, b) => a.effective_from.localeCompare(b.effective_from)).filter((t) => t.effective_from <= today).at(-1) ?? versions[0];

  // Chart (only when this metric is shared). Coaches have no weight unless shared; burned comes precomputed.
  const points = dailyPoints(metric, period.from, period.to, rows, versions, 70);
  const stats = statsFor(points, today);
  const bars = barsFor(range, points, today);
  const list = listFor(metric, range, points, today).map((r) => ({ ...r, href: undefined }));
  const goalDay = period.to <= today ? period.to : today;
  const chartGoal = versions.length ? points.find((p) => p.date === goalDay)?.goal : undefined;

  const foodRows = ((food.data ?? []) as FoodRow[]).map((f) => ({ ...f, kcal: Number(f.kcal), protein_g: Number(f.protein_g), carbs_g: Number(f.carbs_g), fat_g: Number(f.fat_g), fiber_g: Number(f.fiber_g), grams: Number(f.grams), quantity: Number(f.quantity) }));
  const intake = sumNutrients(foodRows.map((f) => ({ kcal: f.kcal, proteinG: f.protein_g, carbsG: f.carbs_g, fatG: f.fat_g, fiberG: f.fiber_g })));
  const dayRow = days.find((d) => d.local_date === day);
  const latest = ((proposals.data ?? []) as Proposal[])[0];
  const pct = macroCaloriePercents(intake);

  const n = (x: number | null | undefined) => (x == null ? "—" : Math.round(Number(x)).toLocaleString("en-CA"));
  const base = `/coach/clients/${link}`;
  const href = (o: { metric?: Metric; range?: CoachRange; date?: string; day?: string }) =>
    `${base}?metric=${o.metric ?? metric}&range=${o.range ?? range}&date=${o.date ?? anchor}&day=${o.day ?? day}`;
  const since = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(c.approved_at));

  return (
    <div className="stack">
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <Link href="/coach" className="btn btn-ghost btn-small" aria-label="Back to clients">
          ←
        </Link>
        <div>
          <h1 style={{ margin: 0 }}>{c.display_name}</h1>
          <div className="small muted">Client since {since}</div>
        </div>
      </div>

      <section className="card">
        <div className="row-between">
          <ScopeChips scopes={c.scopes} showMissing />
          {has("body") && (
            <span className="small muted">
              {[c.age && `${c.age} yrs`, c.sex, c.height_cm && `${n(c.height_cm)} cm`, c.weight_kg && `${Number(c.weight_kg)} kg`]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </div>
        {has("goals") && c.goal && <p className="small muted" style={{ margin: "0.5rem 0 0" }}>Goal: {c.goal === "lose" ? "lose weight" : c.goal === "gain" ? "gain weight" : "maintain weight"}</p>}
        {flags.length > 0 ? (
          <ul className="flag-list">{flags.map((f) => <li key={f.key}>⚠ {f.text}</li>)}</ul>
        ) : (
          <p className="small" style={{ color: "var(--ok)", margin: "0.5rem 0 0" }}>✓ No off-track flags this week</p>
        )}
      </section>

      {/* ---------- Selected day ---------- */}
      <section className="card" aria-labelledby="day-title">
        <div className="row-between">
          <h2 id="day-title" style={{ margin: 0 }}>{dayLabel(day, today)}</h2>
          <div className="row" style={{ gap: "0.25rem" }}>
            <Link className="btn btn-ghost btn-small" href={href({ day: addDays(day, -1) })} aria-label="Previous day">‹</Link>
            {day < today ? (
              <Link className="btn btn-ghost btn-small" href={href({ day: addDays(day, 1) })} aria-label="Next day">›</Link>
            ) : (
              <span className="btn btn-ghost btn-small" aria-disabled="true" style={{ opacity: 0.35 }}>›</span>
            )}
          </div>
        </div>

        <div className="client-stats" style={{ marginTop: "0.75rem" }}>
          {has("activity") && (
            <>
              <div><div className="small muted">Steps</div><div className="stat">{n(dayRow?.steps ?? 0)}{dayTarget ? <span className="muted small"> / {n(dayTarget.steps)}</span> : null}</div></div>
              <div><div className="small muted">Burned</div><div className="stat">{n(dayRow?.burned_kcal ?? 0)} <span className="muted small">kcal</span></div></div>
            </>
          )}
          {has("nutrition") && (
            <div><div className="small muted">Eaten</div><div className="stat">{n(intake.kcal)}{dayTarget ? <span className="muted small"> / {n(dayTarget.kcal)}</span> : <span className="muted small"> kcal</span>}</div></div>
          )}
        </div>

        {has("nutrition") && dayTarget && (
          <div style={{ marginTop: "1rem" }}>
            <ProgressBar label="Protein" extra={`${pct.protein}% of kcal`} consumed={intake.proteinG} target={dayTarget.protein_g} unit="g" color="var(--protein)" warnWhen="under" />
            <ProgressBar label="Carbs" extra={`${pct.carbs}% of kcal`} consumed={intake.carbsG} target={dayTarget.carbs_g} unit="g" color="var(--carbs)" />
            <ProgressBar label="Fat" extra={`${pct.fat}% of kcal`} consumed={intake.fatG} target={dayTarget.fat_g} unit="g" color="var(--fat)" />
          </div>
        )}

        {has("nutrition") && (
          <>
            <h3 style={{ marginTop: "1rem" }}>Food</h3>
            {foodRows.length === 0 ? (
              <p className="muted small">Nothing logged.</p>
            ) : (
              MEALS.filter((m) => foodRows.some((f) => f.meal === m)).map((m) => {
                const items = foodRows.filter((f) => f.meal === m);
                return (
                  <div key={m} style={{ marginBottom: "0.5rem" }}>
                    <div className="row-between small"><strong>{MEAL_LABEL[m]}</strong><strong>{n(items.reduce((s, f) => s + f.kcal, 0))} kcal</strong></div>
                    <ul className="entry-list" style={{ marginTop: 0 }}>
                      {items.map((f) => (
                        <li key={f.id} style={{ gridTemplateColumns: "1fr auto" }}>
                          <div>
                            <div>{f.name}</div>
                            <div className="small muted">{formatAmount(f.quantity, f.unit_label, f.grams)} · P {n(f.protein_g)} · C {n(f.carbs_g)} · F {n(f.fat_g)}</div>
                          </div>
                          <span className="entry-kcal">{n(f.kcal)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </>
        )}

        {has("activity") && (
          <>
            <h3 style={{ marginTop: "1rem" }}>Workouts</h3>
            <WorkoutList workouts={(workouts.data ?? []) as Workout[]} timeZone={c.timezone} readOnly />
          </>
        )}
        {!has("activity") && !has("nutrition") && <p className="muted small">This client doesn&apos;t share activity or food.</p>}
      </section>

      {/* ---------- Trends ---------- */}
      {metrics.length > 0 && (
        <section className="card" aria-labelledby="trend-title">
          <h2 id="trend-title">Trends</h2>
          <nav className="metric-switch" aria-label="Choose measure" style={{ marginBottom: "0.75rem" }}>
            {metrics.map((m) => (
              <Link key={m} href={href({ metric: m })} aria-current={m === metric ? "page" : undefined} style={{ ["--dot" as string]: METRIC_INFO[m].color }}>
                <span className="dot" aria-hidden="true" />
                {m === "steps" ? "Steps" : m === "burned" ? "Burned" : "Eaten"}
              </Link>
            ))}
          </nav>
          <nav className="range-tabs" aria-label="Time range">
            {COACH_RANGES.map((r) => (
              <Link key={r} href={href({ range: r, date: today })} aria-current={r === range ? "page" : undefined}>{RANGE_LABEL[r]}</Link>
            ))}
          </nav>
          <div className="row-between" style={{ marginTop: "0.75rem" }}>
            <strong>{periodLabel(range, period, today)}</strong>
            <div className="row" style={{ gap: "0.25rem" }}>
              <Link className="btn btn-ghost btn-small" href={href({ date: period.prev })} aria-label="Previous period">‹</Link>
              {periodFor(range, period.next).from <= today ? (
                <Link className="btn btn-ghost btn-small" href={href({ date: period.next })} aria-label="Next period">›</Link>
              ) : (
                <span className="btn btn-ghost btn-small" aria-disabled="true" style={{ opacity: 0.35 }}>›</span>
              )}
            </div>
          </div>
          <p className="trend-value" style={{ margin: "0.5rem 0 0" }}>
            {stats.average === null ? "—" : n(stats.average)} <span className="trend-unit">{METRIC_INFO[metric].perDay}</span>
          </p>
          <p className="small muted" style={{ margin: "0.25rem 0 0" }}>{summaryLine(metric, range, stats)}</p>
          <div style={{ marginTop: "1rem" }}>
            <BarChart bars={bars} goal={chartGoal} color={METRIC_INFO[metric].color} strongColor={METRIC_INFO[metric].strong} label={`${METRIC_INFO[metric].title}, ${periodLabel(range, period, today)}`} />
          </div>
          {!has("goals") && <p className="hint">Goal lines and ✓ badges need the client to share Goals.</p>}
          <ul className="trend-list" style={{ marginTop: "0.5rem" }}>
            {list.slice(0, range === "month" ? 31 : 13).map((r) => (
              <li key={r.key}>
                <div>
                  <span>{r.label}</span>
                  <span className="trend-list-value">
                    {r.met && <span className="met-badge" aria-label="goal met">✓</span>}
                    {r.value === null ? <span className="muted">—</span> : n(r.value)}
                    {r.note && r.value !== null && <span className="muted small"> {r.note}</span>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- Notes ---------- */}
      <section className="card" aria-labelledby="notes-title">
        <h2 id="notes-title">Notes</h2>
        <NotesThread notes={(notes.data ?? []) as Note[]} me={user.id} otherName={c.display_name} timeZone={profile.timezone ?? c.timezone} today={today} />
        <NoteForm link={link} date={day} dateLabel={dayLabel(day, today)} placeholder={`Write to ${c.display_name}…`} />
      </section>

      {/* ---------- Targets ---------- */}
      <section className="card" aria-labelledby="targets-title">
        <h2 id="targets-title">Suggest targets</h2>
        {has("goals") && nowTarget ? (
          <>
            <p className="small muted">
              Current: {n(nowTarget.kcal)} kcal · P {nowTarget.protein_g} g · C {nowTarget.carbs_g} g · F {nowTarget.fat_g} g · {n(nowTarget.steps)} steps
            </p>
            {latest && (
              <p className={`alert ${latest.status === "pending" ? "" : latest.status === "accepted" ? "alert-ok" : "alert-warn"}`} role="status">
                Your last suggestion ({n(latest.kcal)} kcal, {n(latest.steps)} steps) is{" "}
                <strong>{latest.status === "pending" ? "waiting for a reply" : latest.status}</strong>.
              </p>
            )}
            <ProposeForm link={link} current={{ kcal: nowTarget.kcal, protein_g: nowTarget.protein_g, carbs_g: nowTarget.carbs_g, fat_g: nowTarget.fat_g, steps: nowTarget.steps }} />
          </>
        ) : (
          <p className="muted small">
            {c.display_name} doesn&apos;t share <strong>{SCOPE_INFO.goals.label}</strong>, so you can&apos;t see or suggest targets. Ask them to turn it on in their Coach page.
          </p>
        )}
      </section>

      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>End coaching</summary>
        <p className="small muted">
          {c.display_name} will be removed from your list and you&apos;ll lose access to their data straight away. They can join again with a new code.
        </p>
        <form action={endCoaching}>
          <input type="hidden" name="link" value={link} />
          <input type="hidden" name="back" value="coach" />
          <button type="submit" className="btn" style={{ background: "var(--danger)" }}>
            End coaching {c.display_name}
          </button>
        </form>
      </details>
    </div>
  );
}
