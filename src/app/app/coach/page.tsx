import Link from "next/link";
import { requireUserProfile, targetsFor } from "@/lib/profile";
import { friendly, type Note, type Proposal } from "@/lib/coach-server";
import { formatCode, normalizeCode, SCOPE_INFO, type Scope } from "@/lib/coaching";
import { endCoaching, respondProposal } from "@/app/coaching-actions";
import { NotesThread } from "@/components/coaching/NotesThread";
import { NoteForm } from "@/components/coaching/NoteForm";
import { ScopeChips } from "@/components/coaching/ScopeChips";
import { AcceptForm, SharingForm } from "./forms";

export const metadata = { title: "Coach" };

interface MyCoach {
  link_id: string;
  instructor_name: string;
  scopes: Scope[];
  approved_at: string;
}

/**
 * Client's Coach page: join a coach with a code, see and answer their notes and target
 * suggestions, change what's shared, or stop sharing.
 */
export default async function MyCoachPage({ searchParams }: { searchParams: Promise<{ code?: string; joined?: string }> }) {
  const { supabase, user, today } = await requireUserProfile();
  const sp = await searchParams;
  const code = sp.code ? normalizeCode(sp.code) : "";

  const { data: coachRows, error } = await supabase.rpc("my_coaches");
  const coaches = (coachRows ?? []) as MyCoach[];

  // Opening this page counts as reading your coaches' notes.
  await Promise.all(coaches.map((c) => supabase.rpc("mark_notes_read", { p_link: c.link_id })));

  const linkIds = coaches.map((c) => c.link_id);
  const [preview, notes, proposals, current] = await Promise.all([
    code.length === 8 ? supabase.rpc("preview_invite", { p_code: code }) : Promise.resolve(null),
    linkIds.length ? supabase.from("coach_notes").select("*").in("link_id", linkIds).order("created_at") : Promise.resolve({ data: [] }),
    linkIds.length
      ? supabase.from("target_proposals").select("*").in("link_id", linkIds).eq("status", "pending")
      : Promise.resolve({ data: [] }),
    targetsFor(supabase, user.id, today),
  ]);
  const invite = (preview?.data as { instructor_name: string; requested_scopes: Scope[]; expires_at: string }[] | null)?.[0];
  const { data: me } = await supabase.from("profiles").select("timezone").eq("id", user.id).single();
  const tz = me?.timezone ?? "America/Toronto";
  const n = (x: number) => Math.round(x).toLocaleString("en-CA");

  return (
    <div className="stack">
      <h1>Coach</h1>

      {error && (
        <p className="alert alert-error" role="alert">
          {friendly(error.message, "Couldn't load your coaches. Try refreshing.")}
        </p>
      )}
      {sp.joined && (
        <p className="alert alert-ok" role="status">
          You&apos;re connected. Your coach can now see what you chose to share.
        </p>
      )}

      {/* ---------- Joining ---------- */}
      {code && !invite && (
        <p className="alert alert-error" role="alert">
          {code.length === 8 ? "That code is invalid or has expired. Ask your coach for a new one." : "Codes are 8 letters and numbers."}
        </p>
      )}
      {invite ? (
        <section className="card" aria-labelledby="join-title">
          <h2 id="join-title">Join {invite.instructor_name}?</h2>
          <p className="muted small">
            Code {formatCode(code)}. {invite.instructor_name} will see only what you tick below, and can send you notes and
            suggested targets. You decide whether to accept any suggestion.
          </p>
          <AcceptForm code={code} requested={invite.requested_scopes} />
          <p className="small" style={{ marginTop: "0.75rem" }}>
            <Link href="/app/coach">Not now</Link>
          </p>
        </section>
      ) : (
        <section className="card" aria-labelledby="code-title">
          <h2 id="code-title">{coaches.length ? "Join another coach" : "Have a code from your coach?"}</h2>
          <form method="get" action="/app/coach" className="row" style={{ flexWrap: "nowrap" }}>
            <label htmlFor="code" className="visually-hidden">
              Invite code
            </label>
            <input id="code" name="code" placeholder="ABCD-2345" autoComplete="off" autoCapitalize="characters" maxLength={9} required style={{ textTransform: "uppercase", letterSpacing: "0.1em" }} />
            <button type="submit" className="btn">
              Continue
            </button>
          </form>
          {coaches.length === 0 && (
            <p className="hint">Nothing is shared until you see who the code belongs to and agree.</p>
          )}
        </section>
      )}

      {/* ---------- Each coach ---------- */}
      {coaches.map((c) => {
        const pending = ((proposals.data ?? []) as Proposal[]).find((p) => p.link_id === c.link_id);
        const thread = ((notes.data ?? []) as Note[]).filter((x) => x.link_id === c.link_id);
        const since = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(c.approved_at));
        return (
          <div key={c.link_id} className="stack">
            <section className="card" aria-labelledby={`coach-${c.link_id}`}>
              <div className="row-between">
                <div>
                  <h2 id={`coach-${c.link_id}`} style={{ margin: 0 }}>{c.instructor_name}</h2>
                  <div className="small muted">Your coach since {since}</div>
                </div>
                <ScopeChips scopes={c.scopes} />
              </div>
            </section>

            {pending && (
              <section className="card proposal" aria-labelledby={`prop-${pending.id}`}>
                <h2 id={`prop-${pending.id}`}>{c.instructor_name} suggests new targets</h2>
                {pending.message && <p style={{ whiteSpace: "pre-wrap" }}>&ldquo;{pending.message}&rdquo;</p>}
                <table className="compare">
                  <thead>
                    <tr><th scope="col"></th><th scope="col">Now</th><th scope="col">Suggested</th></tr>
                  </thead>
                  <tbody>
                    {([
                      ["Calories", current?.kcal, pending.kcal, "kcal"],
                      ["Protein", current?.protein_g, pending.protein_g, "g"],
                      ["Carbs", current?.carbs_g, pending.carbs_g, "g"],
                      ["Fat", current?.fat_g, pending.fat_g, "g"],
                      ["Steps", current?.steps, pending.steps, ""],
                    ] as const).map(([label, now, next, unit]) => (
                      <tr key={label}>
                        <th scope="row">{label}</th>
                        <td>{now == null ? "—" : `${n(now)} ${unit}`}</td>
                        <td className={now !== next ? "changed" : undefined}>{n(next)} {unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="row" style={{ marginTop: "0.75rem" }}>
                  <form action={respondProposal}>
                    <input type="hidden" name="id" value={pending.id} />
                    <input type="hidden" name="accept" value="yes" />
                    <button type="submit" className="btn">Accept from today</button>
                  </form>
                  <form action={respondProposal}>
                    <input type="hidden" name="id" value={pending.id} />
                    <input type="hidden" name="accept" value="no" />
                    <button type="submit" className="btn btn-ghost">Decline</button>
                  </form>
                </div>
                <p className="hint">Accepting starts the new targets today; your past days keep their old targets.</p>
              </section>
            )}

            <section className="card" aria-labelledby={`notes-${c.link_id}`}>
              <h2 id={`notes-${c.link_id}`}>Notes</h2>
              <NotesThread notes={thread} me={user.id} otherName={c.instructor_name} timeZone={tz} today={today} />
              <NoteForm link={c.link_id} placeholder={`Reply to ${c.instructor_name}…`} />
            </section>

            <details className="card">
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>What {c.instructor_name} can see</summary>
              <div style={{ marginTop: "0.75rem" }}>
                <SharingForm link={c.link_id} scopes={c.scopes} />
              </div>
              <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "1rem 0" }} />
              <p className="small muted">
                Stop sharing removes {c.instructor_name}&apos;s access to all your data immediately. Your notes stay with you.
              </p>
              <form action={endCoaching}>
                <input type="hidden" name="link" value={c.link_id} />
                <button type="submit" className="btn btn-ghost" style={{ color: "var(--danger)", borderColor: "var(--danger)" }}>
                  Stop sharing with {c.instructor_name}
                </button>
              </form>
            </details>
          </div>
        );
      })}

      <p className="small muted">
        Sharing options: {Object.values(SCOPE_INFO).map((s) => `${s.label} (${s.detail.toLowerCase()})`).join("; ")}.
      </p>
    </div>
  );
}
