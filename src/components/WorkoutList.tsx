import type { Workout } from "@/lib/day";
import { deleteWorkout } from "@/app/app/actions";

/**
 * The day's logged workouts: when it was logged, what, how long, calories burned,
 * and a ✕ to remove it. Server Component — the remove button is a plain form,
 * so it works even before the page's JavaScript has loaded.
 */
export function WorkoutList({
  workouts,
  timeZone,
  readOnly = false,
}: {
  workouts: Workout[];
  timeZone: string;
  /** Coaches see the list without remove buttons. */
  readOnly?: boolean;
}) {
  if (workouts.length === 0) {
    return (
      <p className="muted small" style={{ margin: "0.5rem 0" }}>
        No workouts logged.
      </p>
    );
  }

  const time = new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZone });
  const totalMinutes = workouts.reduce((s, w) => s + w.minutes, 0);
  const totalKcal = workouts.reduce((s, w) => s + w.active_kcal, 0);

  return (
    <>
      <ul className="entry-list">
        {workouts.map((w) => (
          <li key={w.id} style={readOnly ? { gridTemplateColumns: "1fr auto" } : undefined}>
            <div>
              <div className="entry-name">{w.type}</div>
              <div className="small muted">
                {time.format(new Date(w.created_at))} · {w.minutes} min
                {w.source === "hevy" ? " · from Hevy" : ""}
              </div>
            </div>
            <span className="entry-kcal">{w.active_kcal} kcal</span>
            {!readOnly && (
            <form action={deleteWorkout}>
              <input type="hidden" name="id" value={w.id} />
              <button type="submit" className="btn btn-ghost btn-small" aria-label={`Remove ${w.type}, ${w.minutes} minutes`}>
                ✕
              </button>
            </form>
            )}
          </li>
        ))}
      </ul>
      <p className="small muted" style={{ margin: "0.5rem 0 0" }}>
        Total: {totalMinutes} min · {totalKcal.toLocaleString("en-CA")} kcal burned
      </p>
    </>
  );
}
