import Link from "next/link";
import { requireUserProfile, targetsFor } from "@/lib/profile";
import { loadDay } from "@/lib/day";
import { formatDay } from "@/lib/dates";
import { Rings, pct } from "@/components/Rings";
import { ProgressBar } from "@/components/ProgressBar";
import { WorkoutList } from "@/components/WorkoutList";
import { QuickAdd } from "./QuickAdd";

export const metadata = { title: "Home" };

/** Screen H1 — today's rings, remaining calories, macros, and quick-add. */
export default async function Home() {
  const { supabase, user, profile, today } = await requireUserProfile();
  const weightKg = Number(profile.weight_kg ?? 70);
  const [targets, day, unreadNotes, pendingProposals] = await Promise.all([
    targetsFor(supabase, user.id, today),
    loadDay(supabase, user.id, today, weightKg),
    // Coaching notices. If migration 0004 isn't run yet these error and simply show nothing.
    supabase.from("coach_notes").select("id", { count: "exact", head: true }).is("read_at", null).neq("author_id", user.id),
    supabase.from("target_proposals").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  const noteCount = unreadNotes.count ?? 0;
  const proposalCount = pendingProposals.count ?? 0;

  if (!targets) {
    return (
      <p className="alert">
        No targets yet. <Link href="/onboarding">Finish setting up</Link>.
      </p>
    );
  }

  const rings = [
    { label: "Steps", value: day.steps, goal: targets.steps, color: "var(--ring-steps)", href: "/app/trends/steps?range=week" },
    { label: "Burned", value: day.burnedKcal, goal: targets.active_kcal, color: "var(--ring-burned)", href: "/app/trends/burned?range=week" },
    { label: "Eaten", value: day.intake.kcal, goal: targets.kcal, color: "var(--ring-consumed)", href: "/app/trends/eaten?range=week" },
  ];
  const remaining = Math.round(targets.kcal - day.intake.kcal);
  const isEmpty = day.entries.length === 0 && day.steps === 0 && day.workouts.length === 0;

  return (
    <div className="stack">
      <div>
        <p className="muted small" style={{ margin: 0 }}>
          {formatDay(today)}
        </p>
        <h1>Hi {profile.display_name ?? "there"}</h1>
      </div>

      {(noteCount > 0 || proposalCount > 0) && (
        <Link href="/app/coach" className="alert coach-notice" role="status">
          ✉{" "}
          {[
            noteCount > 0 && `${noteCount} new note${noteCount > 1 ? "s" : ""} from your coach`,
            proposalCount > 0 && "your coach suggested new targets",
          ]
            .filter(Boolean)
            .join(" · ")}{" "}
          →
        </Link>
      )}

      <section className="card rings-card" aria-labelledby="rings-title">
        <h2 id="rings-title" className="visually-hidden">
          Today&apos;s rings
        </h2>
        <Rings rings={rings} />
        <ul className="ring-legend">
          {rings.map((r) => (
            <li key={r.label}>
              <Link href={r.href}>
                <span className="dot" style={{ background: r.color }} aria-hidden="true" />
                <div>
                  <div className="small muted">{r.label} ›</div>
                  <div className="legend-value">
                    {Math.round(r.value).toLocaleString("en-CA")} / {r.goal.toLocaleString("en-CA")}
                    {r.label === "Steps" ? "" : " kcal"} <span className="muted small">({pct(r)}%)</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {isEmpty && (
        <p className="alert" role="status">
          Nothing logged yet today. Start with <Link href="/app/food/add">breakfast</Link> or enter your steps below.
        </p>
      )}

      <section className="card" aria-labelledby="remaining-title">
        <div className="row-between">
          <div>
            <h2 id="remaining-title" className="small muted" style={{ fontWeight: 600 }}>
              {remaining >= 0 ? "Calories remaining" : "Calories over"}
            </h2>
            <div className="big-number" style={{ color: remaining >= 0 ? "var(--text)" : "var(--warn)" }}>
              {Math.abs(remaining).toLocaleString("en-CA")}
            </div>
          </div>
          <p className="small muted" style={{ textAlign: "right", margin: 0 }}>
            {targets.kcal.toLocaleString("en-CA")} target
            <br />− {Math.round(day.intake.kcal).toLocaleString("en-CA")} eaten
          </p>
        </div>
        <div style={{ marginTop: "1rem" }}>
          <ProgressBar label="Protein" consumed={day.intake.proteinG} target={targets.protein_g} unit="g" color="var(--protein)" warnWhen="under" />
          <ProgressBar label="Carbs" consumed={day.intake.carbsG} target={targets.carbs_g} unit="g" color="var(--carbs)" />
          <ProgressBar label="Fat" consumed={day.intake.fatG} target={targets.fat_g} unit="g" color="var(--fat)" />
          <ProgressBar label="Water" consumed={day.waterMl} target={targets.water_ml} unit="ml" color="var(--primary)" warnWhen="under" />
        </div>
        <Link href="/app/diary" className="small">
          Open today&apos;s diary →
        </Link>
      </section>

      <QuickAdd currentSteps={day.steps} today={today} />

      {day.workouts.length > 0 && (
        <section className="card" aria-labelledby="today-workouts">
          <div className="row-between">
            <h2 id="today-workouts">Today&apos;s workouts</h2>
            <span className="entry-kcal">{day.workoutKcal.toLocaleString("en-CA")} kcal</span>
          </div>
          <WorkoutList workouts={day.workouts} timeZone={profile.timezone} />
        </section>
      )}

      <p className="small muted">
        Steps are entered by hand in this version. Burned calories are estimated from steps and logged workouts.
      </p>
    </div>
  );
}
