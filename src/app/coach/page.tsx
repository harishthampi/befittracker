import Link from "next/link";
import { requireInstructor, friendly, type CoachClient } from "@/lib/coach-server";
import { flagsFor, lastLogged, kcalStatus, type ClientDay } from "@/lib/coaching";
import { addDays, todayIn } from "@/lib/dates";
import { dayLabel, goalFor, type TargetVersion } from "@/lib/trends";
import { ScopeChips } from "@/components/coaching/ScopeChips";

export const metadata = { title: "Clients" };

const STATUS_TEXT = { under: "Under", on: "On target", over: "Over" } as const;

/**
 * Instructor home: every active client with today's numbers and off-track flags.
 * Flagged clients come first. Values a client doesn't share show as "Not shared".
 */
export default async function CoachHome() {
  const { supabase, user, profile } = await requireInstructor();

  const { data: clientRows, error } = await supabase.rpc("coach_clients");
  const clients = (clientRows ?? []) as CoachClient[];

  // Fetch the last 7 days for every client in parallel, plus targets and unread notes in one go each.
  const ids = clients.map((c) => c.client_id);
  const [dailies, targets, unread] = await Promise.all([
    Promise.all(
      clients.map((c) => {
        const today = todayIn(c.timezone);
        return supabase.rpc("coach_daily", { p_client: c.client_id, p_from: addDays(today, -6), p_to: today });
      }),
    ),
    ids.length
      ? supabase.from("targets").select("user_id, effective_from, steps, active_kcal, kcal").in("user_id", ids)
      : Promise.resolve({ data: [] }),
    clients.length
      ? supabase
          .from("coach_notes")
          .select("link_id")
          .is("read_at", null)
          .neq("author_id", user.id)
          .in("link_id", clients.map((c) => c.link_id))
      : Promise.resolve({ data: [] }),
  ]);

  const rows = clients.map((c, i) => {
    const today = todayIn(c.timezone);
    const days = (dailies[i].data ?? []) as ClientDay[];
    const versions = ((targets.data ?? []) as (TargetVersion & { user_id: string })[]).filter((t) => t.user_id === c.client_id);
    const has = (s: string) => c.scopes.includes(s as never);
    const kcalTarget = versions.length ? goalFor("eaten", today, versions) : undefined;
    const stepGoal = versions.length ? goalFor("steps", today, versions) : undefined;
    const t = days.find((d) => d.local_date === today);
    const flags = flagsFor(days, today, { nutrition: has("nutrition"), activity: has("activity"), kcalTarget, stepGoal });
    const unreadCount = ((unread.data ?? []) as { link_id: string }[]).filter((n) => n.link_id === c.link_id).length;
    return { c, today, t, flags, kcalTarget, stepGoal, last: lastLogged(days), unreadCount, has };
  });
  rows.sort((a, b) => b.flags.length - a.flags.length || a.c.display_name.localeCompare(b.c.display_name));

  const n = (x: number | null | undefined) => (x == null ? "—" : Math.round(Number(x)).toLocaleString("en-CA"));

  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <h1 style={{ marginBottom: 0 }}>Hi {profile.display_name ?? "coach"}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {clients.length === 0 ? "No clients yet." : `${clients.length} client${clients.length === 1 ? "" : "s"} · today's numbers in each client's own time zone`}
          </p>
        </div>
      </div>

      {error && (
        <p className="alert alert-error" role="alert">
          {friendly(error.message, "Couldn't load your clients. Try refreshing.")}
        </p>
      )}

      {clients.length === 0 && !error && (
        <section className="card">
          <h2>Invite your first client</h2>
          <p className="muted">
            Create a code, send it to your client, and they enter it in BeFitTracker under <strong>Coach</strong>. They
            choose what to share with you, and can change it or stop at any time.
          </p>
          <Link href="/coach/invite" className="btn">
            Create an invite code
          </Link>
        </section>
      )}

      <ul className="client-list">
        {rows.map(({ c, today, t, flags, kcalTarget, stepGoal, last, unreadCount, has }) => (
          <li key={c.link_id}>
            <Link href={`/coach/clients/${c.link_id}`} className="card client-card">
              <div className="row-between" style={{ alignItems: "flex-start" }}>
                <div>
                  <h2 style={{ margin: 0 }}>
                    {c.display_name}
                    {unreadCount > 0 && (
                      <span className="new-tag" aria-label={`${unreadCount} unread notes`}>
                        {unreadCount} new
                      </span>
                    )}
                  </h2>
                  <div className="small muted">Last log: {last ? dayLabel(last, today) : "never"}</div>
                </div>
                <ScopeChips scopes={c.scopes} />
              </div>

              {flags.length > 0 && (
                <ul className="flag-list" aria-label="Off-track flags">
                  {flags.map((f) => (
                    <li key={f.key}>⚠ {f.text}</li>
                  ))}
                </ul>
              )}

              <div className="client-stats">
                <div>
                  <div className="small muted">Steps today</div>
                  {has("activity") ? (
                    <div className="stat">
                      {n(t?.steps ?? 0)}
                      {stepGoal ? <span className="muted small"> / {n(stepGoal)}</span> : null}
                    </div>
                  ) : (
                    <div className="muted small">Not shared</div>
                  )}
                </div>
                <div>
                  <div className="small muted">Burned</div>
                  {has("activity") ? <div className="stat">{n(t?.burned_kcal ?? 0)} <span className="muted small">kcal</span></div> : <div className="muted small">Not shared</div>}
                </div>
                <div>
                  <div className="small muted">Eaten</div>
                  {has("nutrition") ? (
                    <div className="stat">
                      {n(t?.intake_kcal ?? 0)}
                      {kcalTarget ? <span className="muted small"> / {n(kcalTarget)}</span> : <span className="muted small"> kcal</span>}
                      {/* "Under" is normal partway through the day, so only On target and Over are shown. */}
                      {kcalTarget && Number(t?.intake_kcal ?? 0) > 0 && kcalStatus(Number(t?.intake_kcal), kcalTarget) !== "under" && (
                        <span className={`state state-${kcalStatus(Number(t?.intake_kcal), kcalTarget) === "on" ? "on" : "warn"}`} style={{ marginLeft: 6 }}>
                          {STATUS_TEXT[kcalStatus(Number(t?.intake_kcal), kcalTarget)]}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="muted small">Not shared</div>
                  )}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
