import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserProfile } from "@/lib/profile";
import { loadDay } from "@/lib/day";
import { parseDateParam } from "@/lib/dates";
import { MEALS, MEAL_LABEL } from "@/lib/meals";
import { stepsToKcal } from "@/lib/nutrition";
import {
  barsFor,
  dailyPoints,
  isMetric,
  isRange,
  listFor,
  METRIC_INFO,
  periodFor,
  periodLabel,
  RANGE_LABEL,
  RANGES,
  statsFor,
  summaryLine,
  type Bar,
  type ListRow,
  type Metric,
  type Range,
  type SummaryRow,
  type TargetVersion,
} from "@/lib/trends";
import { BarChart } from "@/components/BarChart";

export async function generateMetadata({ params }: { params: Promise<{ metric: string }> }) {
  const { metric } = await params;
  return { title: isMetric(metric) ? METRIC_INFO[metric].title : "Trends" };
}

/**
 * Ring detail screen (opened by tapping a ring on Home):
 * Day / Week / Month / 3 Months / Year tabs, ‹ › to move between periods, the headline
 * number, a bar chart with the goal line, and a list underneath.
 */
export default async function TrendsPage({
  params,
  searchParams,
}: {
  params: Promise<{ metric: string }>;
  searchParams: Promise<{ range?: string; date?: string }>;
}) {
  const { metric } = await params;
  if (!isMetric(metric)) notFound();
  const sp = await searchParams;
  const range: Range = isRange(sp.range) ? sp.range : "week";

  const { supabase, user, profile, today } = await requireUserProfile();
  const weightKg = Number(profile.weight_kg ?? 70);
  let date = parseDateParam(sp.date, today);
  if (date > today) date = today;

  const period = periodFor(range, date);
  // The Day view also shows that day's week for context, so fetch the wider span.
  const fetchFrom = range === "day" ? periodFor("week", date).from : period.from;
  const fetchTo = range === "day" ? periodFor("week", date).to : period.to;

  const [summary, targets, day] = await Promise.all([
    supabase
      .from("daily_summary")
      .select("local_date, steps, intake_kcal, workout_kcal")
      .eq("user_id", user.id)
      .gte("local_date", fetchFrom)
      .lte("local_date", fetchTo),
    supabase.from("targets").select("effective_from, steps, active_kcal, kcal").eq("user_id", user.id),
    range === "day" ? loadDay(supabase, user.id, date, weightKg) : Promise.resolve(null),
  ]);

  const rows = (summary.data ?? []) as SummaryRow[];
  const versions = (targets.data ?? []) as TargetVersion[];
  const info = METRIC_INFO[metric];
  const n = (x: number) => Math.round(x).toLocaleString("en-CA");

  // Points for the period being shown, and stats over them.
  const points = dailyPoints(metric, period.from, period.to, rows, versions, weightKg);
  const stats = statsFor(points, today);
  const dayPoint = range === "day" ? points[0] : undefined;
  const hasNext = periodFor(range, period.next).from <= today;
  const href = (r: Range, d: string) => `/app/trends/${metric}?range=${r}&date=${d}`;

  // Chart + list depend on the range.
  let bars: Bar[] = [];
  let list: ListRow[] = [];
  let chartGoal: number | undefined;
  let listTitle = periodLabel(range, period, today);
  let note: string | null = null;

  if (range === "day" && day && dayPoint) {
    if (metric === "eaten") {
      bars = MEALS.map((m) => {
        const kcal = day.entries.filter((e) => e.meal === m).reduce((s, e) => s + e.kcal, 0);
        return { key: m, label: SHORT_MEAL[m], value: kcal, met: false, title: `${MEAL_LABEL[m]}: ${n(kcal)} kcal` };
      });
      list = MEALS.filter((m) => !day.skippedMeals.includes(m) || day.entries.some((e) => e.meal === m)).map((m) => {
        const items = day.entries.filter((e) => e.meal === m);
        const kcal = items.reduce((s, e) => s + e.kcal, 0);
        return { key: m, label: `${MEAL_LABEL[m]}${items.length ? ` · ${items.length} item${items.length > 1 ? "s" : ""}` : ""}`, value: items.length ? kcal : null, met: false };
      });
      listTitle = "By meal";
    } else if (metric === "burned") {
      const walking = Math.round(stepsToKcal(day.steps, weightKg));
      const byType = new Map<string, number>();
      for (const w of day.workouts) byType.set(w.type, (byType.get(w.type) ?? 0) + w.active_kcal);
      bars = [
        { key: "walking", label: "Walking", value: walking, met: false, title: `Walking: ${n(walking)} kcal` },
        ...[...byType].map(([type, kcal]) => ({ key: type, label: type.split(" ")[0], value: kcal, met: false, title: `${type}: ${n(kcal)} kcal` })),
      ];
      const time = new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZone: profile.timezone });
      list = [
        { key: "walking", label: `Walking · ${n(day.steps)} steps`, value: walking, met: false },
        ...day.workouts.map((w) => ({
          key: w.id,
          label: `${w.type} · ${w.minutes} min · ${time.format(new Date(w.created_at))}`,
          value: w.active_kcal,
          met: false,
        })),
      ];
      listTitle = "Where it came from";
    } else {
      // Steps: one total per day in this version, so show the day's week for context.
      const week = periodFor("week", date);
      const weekPoints = dailyPoints("steps", week.from, week.to, rows, versions, weightKg);
      bars = barsFor("week", weekPoints, today);
      chartGoal = dayPoint.goal;
      list = listFor("steps", "week", weekPoints, today);
      listTitle = `Week of ${periodLabel("week", week, today)}`;
      note = "This version stores one step total per day. Hour-by-hour steps arrive with phone sync in the mobile app.";
    }
  } else if (range !== "day") {
    bars = barsFor(range, points, today);
    list = listFor(metric, range, points, today);
    // Goal line: the goal in force at the end of the period (or today, if earlier).
    const goalDay = period.to <= today ? period.to : today;
    chartGoal = points.find((p) => p.date === goalDay)?.goal ?? points[points.length - 1]?.goal;
    if (range === "3m") listTitle = "Weekly averages";
    if (range === "year") listTitle = "Monthly averages";
  }

  const headline = range === "day" ? dayPoint?.value ?? 0 : stats.average;
  const chartLabel = `${info.title}, ${periodLabel(range, period, today)}. ${bars
    .filter((b) => b.value !== null)
    .map((b) => b.title)
    .join("; ")}`;

  return (
    <div className="stack">
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <Link href="/app" className="btn btn-ghost btn-small" aria-label="Back to Home">
          ←
        </Link>
        <h1 style={{ margin: 0, fontSize: "1.3rem" }}>{info.title}</h1>
      </div>

      <MetricSwitch current={metric} range={range} date={date} />

      <nav className="range-tabs" aria-label="Time range">
        {RANGES.map((r) => (
          <Link key={r} href={href(r, date)} aria-current={r === range ? "page" : undefined}>
            {RANGE_LABEL[r]}
          </Link>
        ))}
      </nav>

      <section className="card" aria-labelledby="period-title">
        <div className="row-between">
          <h2 id="period-title" style={{ margin: 0 }}>
            {periodLabel(range, period, today)}
          </h2>
          <div className="row" style={{ gap: "0.25rem" }}>
            <Link className="btn btn-ghost btn-small" href={href(range, period.prev)} aria-label="Previous period">
              ‹
            </Link>
            {hasNext ? (
              <Link className="btn btn-ghost btn-small" href={href(range, period.next)} aria-label="Next period">
                ›
              </Link>
            ) : (
              <span className="btn btn-ghost btn-small" aria-disabled="true" style={{ opacity: 0.35 }}>
                ›
              </span>
            )}
            {date !== today && (
              <Link className="btn btn-ghost btn-small" href={href(range, today)}>
                Today
              </Link>
            )}
          </div>
        </div>

        <div className="trend-head">
          <div>
            <p className="trend-value" style={{ margin: "0.75rem 0 0" }}>
              {headline === null ? "—" : n(headline)}{" "}
              <span className="trend-unit">
                {range === "day" ? `of ${n(dayPoint?.goal ?? 0)} ${info.unit}` : info.perDay}
              </span>
            </p>
            <p className="small muted" style={{ margin: "0.25rem 0 0" }}>
              {summaryLine(metric, range, stats, dayPoint)}
            </p>
          </div>
          {range === "day" && dayPoint && <MiniRing value={dayPoint.value} goal={dayPoint.goal} color={info.strong} />}
        </div>

        {bars.length > 0 && (
          <div style={{ marginTop: "1rem" }}>
            <BarChart bars={bars} goal={chartGoal} color={info.color} strongColor={info.strong} label={chartLabel} />
          </div>
        )}
        {note && <p className="hint">{note}</p>}
      </section>

      <section className="card" aria-labelledby="list-title">
        <h2 id="list-title">{listTitle}</h2>
        {list.length === 0 ? (
          <p className="muted small">Nothing logged yet.</p>
        ) : (
          <ul className="trend-list">
            {list.map((r) => {
              const content = (
                <>
                  <span>{r.label}</span>
                  <span className="trend-list-value">
                    {r.met && (
                      <span className="met-badge" aria-label="goal met" title="Goal met">
                        ✓
                      </span>
                    )}
                    {r.value === null ? <span className="muted">—</span> : n(r.value)}
                    {r.note && r.value !== null && <span className="muted small"> {r.note}</span>}
                  </span>
                </>
              );
              return <li key={r.key}>{r.href ? <Link href={r.href}>{content}</Link> : <div>{content}</div>}</li>;
            })}
          </ul>
        )}
        {range === "day" && metric === "eaten" && (
          <Link className="small" href={`/app/diary?date=${date}`}>
            Open this day&apos;s diary →
          </Link>
        )}
      </section>

      {metric === "burned" && (
        <p className="small muted">Burned calories are estimated from steps and logged workouts using your current weight.</p>
      )}
    </div>
  );
}

const SHORT_MEAL: Record<string, string> = {
  breakfast: "Bfast",
  morning_snack: "AM snk",
  lunch: "Lunch",
  evening_snack: "PM snk",
  dinner: "Dinner",
};

/** Switch between the three rings without going back to Home. */
function MetricSwitch({ current, range, date }: { current: Metric; range: Range; date: string }) {
  const items: Metric[] = ["steps", "burned", "eaten"];
  return (
    <nav className="metric-switch" aria-label="Choose ring">
      {items.map((m) => (
        <Link
          key={m}
          href={`/app/trends/${m}?range=${range}&date=${date}`}
          aria-current={m === current ? "page" : undefined}
          style={{ ["--dot" as string]: METRIC_INFO[m].color }}
        >
          <span className="dot" aria-hidden="true" />
          {m === "steps" ? "Steps" : m === "burned" ? "Burned" : "Eaten"}
        </Link>
      ))}
    </nav>
  );
}

/** Small progress ring beside the day's number, like the reference design. */
function MiniRing({ value, goal, color }: { value: number; goal: number; color: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const ratio = goal > 0 ? Math.min(value / goal, 1) : 0;
  return (
    <svg width={68} height={68} viewBox="0 0 68 68" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx={34} cy={34} r={r} fill="none" stroke={color} strokeOpacity={0.2} strokeWidth={8} />
      <circle
        cx={34}
        cy={34}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={`${ratio * c} ${c}`}
        transform="rotate(-90 34 34)"
      />
      <text x={34} y={39} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--text)">
        {goal > 0 ? Math.round((value / goal) * 100) : 0}%
      </text>
    </svg>
  );
}
