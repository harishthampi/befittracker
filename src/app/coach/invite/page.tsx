import { requireInstructor } from "@/lib/coach-server";
import { formatCode, SCOPE_INFO, type Scope } from "@/lib/coaching";
import { cancelInvite } from "@/app/coaching-actions";
import { siteUrl } from "@/lib/safe-redirect";
import { CopyButton } from "@/components/coaching/CopyButton";
import { InviteForm } from "./InviteForm";

export const metadata = { title: "Invite a client" };

/** Create invite codes and manage the ones not used yet. Codes work once and expire after 7 days. */
export default async function InvitePage() {
  const { supabase, user } = await requireInstructor();
  const { data } = await supabase
    .from("coach_links")
    .select("id, invite_code, requested_scopes, expires_at, created_at")
    .eq("instructor_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const invites = (data ?? []) as { id: string; invite_code: string; requested_scopes: Scope[]; expires_at: string }[];
  const now = Date.now();
  const fmt = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" });

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <h1>Invite a client</h1>
      <section className="card">
        <InviteForm />
      </section>

      <section className="card" aria-labelledby="open-title">
        <h2 id="open-title">Open invites</h2>
        {invites.length === 0 ? (
          <p className="muted small">No open invites. Codes disappear once a client uses them.</p>
        ) : (
          <ul className="entry-list">
            {invites.map((inv) => {
              const expired = new Date(inv.expires_at).getTime() < now;
              const code = formatCode(inv.invite_code);
              const message = `Join me on BeFitTracker: open ${siteUrl()}/app/coach and enter code ${code}`;
              return (
                <li key={inv.id} style={{ gridTemplateColumns: "1fr auto" }}>
                  <div>
                    <div className="invite-code" style={{ opacity: expired ? 0.5 : 1 }}>
                      {code}
                    </div>
                    <div className="small muted">
                      {expired ? "Expired" : `Expires ${fmt.format(new Date(inv.expires_at))}`} · asks for{" "}
                      {inv.requested_scopes.map((s) => SCOPE_INFO[s]?.label ?? s).join(", ")}
                    </div>
                  </div>
                  <div className="row" style={{ gap: "0.25rem" }}>
                    {!expired && <CopyButton text={message} label="Copy message" />}
                    <form action={cancelInvite}>
                      <input type="hidden" name="id" value={inv.id} />
                      <button type="submit" className="btn btn-ghost btn-small" aria-label={`Cancel code ${code}`}>
                        {expired ? "Remove" : "Cancel"}
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>How your client joins</h2>
        <ol className="small" style={{ paddingLeft: "1.2rem", margin: 0 }}>
          <li>They sign up in BeFitTracker as a <strong>User</strong>.</li>
          <li>They open the <strong>Coach</strong> tab and enter your code.</li>
          <li>They see your name and what you asked for, untick anything they'd rather keep private, and accept.</li>
          <li>They appear in your client list straight away. Either of you can end coaching at any time.</li>
        </ol>
      </section>
    </div>
  );
}
