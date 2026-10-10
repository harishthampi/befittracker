import Link from "next/link";
import { requireUserProfile, targetsFor } from "@/lib/profile";
import { loadDay, type FoodEntry } from "@/lib/day";
import { addDays, formatDay, parseDateParam } from "@/lib/dates";
import { MEALS, MEAL_LABEL, type Meal } from "@/lib/meals";
import { formatAmount } from "@/lib/format";
import { macroCaloriePercents, sumNutrients } from "@/lib/nutrition";
import { ProgressBar } from "@/components/ProgressBar";
import { WorkoutList } from "@/components/WorkoutList";
import { copyMeal, deleteFoodEntry, skipMeal, unskipMeal } from "../actions";
import { AddWorkoutToggle } from "./AddWorkoutToggle";

export const metadata = { title: "Diary" };

/** Screen D1 — the day's nutrition summary and the five meals, MyFitnessPal style. */
export default async function DiaryPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { supabase, user, profile, today } = await requireUserProfile();
  const date = parseDateParam((await searchParams).date, today);
  const weightKg = Number(profile.weight_kg ?? 70);
  const [targets, day] = await Promise.all([
    targetsFor(supabase, user.id, date),
    loadDay(supabase, user.id, date, weightKg),
  ]);
  if (!targets) return <p className="alert">No targets yet.</p>;

  const pctCal = macroCaloriePercents(day.intake);
  const net = Math.round(day.intake.kcal - day.burnedKcal);
  const remaining = Math.round(targets.kcal - day.intake.kcal);
  const yesterday = addDays(date, -1);
  // A meal only counts as skipped while it's empty; food added later always shows.
  const isSkipped = (meal: Meal) =>
    day.skippedMeals.includes(meal) && !day.entries.some((e) => e.meal === meal);
  const skipped = MEALS.filter(isSkipped);

  return (
    <div className="stack">
      <nav className="date-nav" aria-label="Choose day">
        <Link className="btn btn-ghost btn-small" href={`/app/diary?date=${yesterday}`} aria-label="Previous day">
          ‹
        </Link>
        <h1 style={{ margin: 0, fontSize: "1.25rem" }}>{date === today ? "Today" : formatDay(date)}</h1>
        {date < today ? (
          <Link className="btn btn-ghost btn-small" href={`/app/diary?date=${addDays(date, 1)}`} aria-label="Next day">
            ›
          </Link>
        ) : (
          <span style={{ width: 44 }} />
        )}
      </nav>

      <section className="card" aria-labelledby="summary-title">
        <h2 id="summary-title">Summary</h2>
        <div className="row-between small" style={{ marginBottom: "0.75rem" }}>
          <span>
            {targets.kcal.toLocaleString("en-CA")} target − {Math.round(day.intake.kcal).toLocaleString("en-CA")} food
          </span>
          <strong style={{ color: remaining < 0 ? "var(--warn)" : undefined }}>
            {remaining >= 0 ? `${remaining.toLocaleString("en-CA")} remaining` : `${Math.abs(remaining).toLocaleString("en-CA")} over`}
          </strong>
        </div>
        <ProgressBar label="Calories" consumed={day.intake.kcal} target={targets.kcal} unit="kcal" color="var(--ring-consumed)" />
        <ProgressBar label="Protein" extra={`${pctCal.protein}% of kcal`} consumed={day.intake.proteinG} target={targets.protein_g} unit="g" color="var(--protein)" warnWhen="under" />
        <ProgressBar label="Carbs" extra={`${pctCal.carbs}% of kcal`} consumed={day.intake.carbsG} target={targets.carbs_g} unit="g" color="var(--carbs)" />
        <ProgressBar label="Fat" extra={`${pctCal.fat}% of kcal`} consumed={day.intake.fatG} target={targets.fat_g} unit="g" color="var(--fat)" />
        <p className="small muted" style={{ margin: 0 }}>
          Net calories (eaten − burned): <strong>{net.toLocaleString("en-CA")}</strong> · Burned {day.burnedKcal} kcal from{" "}
          {day.steps.toLocaleString("en-CA")} steps
          {day.workouts.length ? ` and ${day.workouts.length} workout${day.workouts.length > 1 ? "s" : ""}` : ""} · Fiber{" "}
          {Math.round(day.intake.fiberG)} g
        </p>
      </section>

      {MEALS.filter((meal) => !isSkipped(meal)).map((meal) => (
        <MealCard
          key={meal}
          title={MEAL_LABEL[meal]}
          meal={meal}
          items={day.entries.filter((e) => e.meal === meal)}
          date={date}
          yesterday={yesterday}
        />
      ))}

      {skipped.length > 0 && (
        <section className="card" aria-labelledby="skipped-title">
          <h2 id="skipped-title" className="small muted" style={{ fontWeight: 600 }}>
            Skipped today
          </h2>
          <ul className="entry-list">
            {skipped.map((meal) => (
              <li key={meal} style={{ gridTemplateColumns: "1fr auto" }}>
                <span>{MEAL_LABEL[meal]}</span>
                <form action={unskipMeal}>
                  <input type="hidden" name="meal" value={meal} />
                  <input type="hidden" name="date" value={date} />
                  <button type="submit" className="btn btn-ghost btn-small" aria-label={`Show ${MEAL_LABEL[meal]} again`}>
                    Undo
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card" aria-labelledby="workouts-title">
        <div className="row-between">
          <h2 id="workouts-title">Workouts</h2>
          <span className="entry-kcal">{day.workoutKcal.toLocaleString("en-CA")} kcal</span>
        </div>
        <WorkoutList workouts={day.workouts} timeZone={profile.timezone} />
        {date <= today && <AddWorkoutToggle date={date} />}
      </section>
    </div>
  );
}

function MealCard({
  title,
  meal,
  items,
  date,
  yesterday,
}: {
  title: string;
  meal: string;
  items: FoodEntry[];
  date: string;
  yesterday: string;
}) {
  const total = sumNutrients(
    items.map((e) => ({ kcal: e.kcal, proteinG: e.protein_g, carbsG: e.carbs_g, fatG: e.fat_g, fiberG: e.fiber_g })),
  );
  const headingId = `meal-${meal}`;

  return (
    <section className="card meal-card" aria-labelledby={headingId}>
      <div className="row-between">
        <h2 id={headingId}>{title}</h2>
        <span className="entry-kcal">{Math.round(total.kcal)} kcal</span>
      </div>
      {items.length > 0 && (
        <div className="macro-chips" style={{ marginTop: "0.25rem" }}>
          <span className="chip chip-p">P {Math.round(total.proteinG)} g</span>
          <span className="chip chip-c">C {Math.round(total.carbsG)} g</span>
          <span className="chip chip-f">F {Math.round(total.fatG)} g</span>
        </div>
      )}

      {items.length === 0 ? (
        <p className="muted small" style={{ margin: "0.5rem 0" }}>
          Nothing logged.
        </p>
      ) : (
        <ul className="entry-list">
          {items.map((e) => (
            <li key={e.id}>
              <div>
                <div className="entry-name">{e.name}</div>
                <div className="small muted">
                  {formatAmount(e.quantity, e.unit_label, e.grams)} · P {Math.round(e.protein_g)} · C{" "}
                  {Math.round(e.carbs_g)} · F {Math.round(e.fat_g)}
                </div>
              </div>
              <span className="entry-kcal">{Math.round(e.kcal)}</span>
              <form action={deleteFoodEntry}>
                <input type="hidden" name="id" value={e.id} />
                <button type="submit" className="btn btn-ghost btn-small" aria-label={`Remove ${e.name}`}>
                  ✕
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <div className="row" style={{ marginTop: "0.5rem" }}>
        <Link className="btn btn-small" href={`/app/food/add?meal=${meal}&date=${date}`}>
          + Add food
        </Link>
        {items.length === 0 && (
          <form action={copyMeal}>
            <input type="hidden" name="meal" value={meal} />
            <input type="hidden" name="from" value={yesterday} />
            <input type="hidden" name="to" value={date} />
            <button type="submit" className="btn btn-ghost btn-small">
              Same as yesterday
            </button>
          </form>
        )}
        {items.length === 0 && (
          <form action={skipMeal}>
            <input type="hidden" name="meal" value={meal} />
            <input type="hidden" name="date" value={date} />
            <button type="submit" className="btn btn-ghost btn-small" aria-label={`Skip ${title} for this day`}>
              Skip
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
