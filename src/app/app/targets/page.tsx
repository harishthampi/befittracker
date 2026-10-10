import Link from "next/link";
import { requireUserProfile, targetsFor } from "@/lib/profile";
import { TargetsForm } from "./TargetsForm";

export const metadata = { title: "Targets" };

/** Screen O4 / P1 — review targets after onboarding, and edit them any time later. */
export default async function TargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; clamped?: string }>;
}) {
  const { supabase, user, today } = await requireUserProfile();
  const params = await searchParams;
  const targets = await targetsFor(supabase, user.id, today);

  return (
    <div className="stack">
      <h1>Your daily targets</h1>
      {params.welcome && (
        <p className="alert alert-ok" role="status">
          We calculated these from your details (Mifflin-St Jeor formula). Adjust anything, or{" "}
          <Link href="/app">go to your dashboard</Link>.
        </p>
      )}
      {params.clamped && (
        <p className="alert alert-warn" role="alert">
          Your goal maths came out below the safe minimum, so we set the minimum instead. Talk to a doctor before eating
          less than this.
        </p>
      )}
      {targets ? (
        <TargetsForm initial={targets} />
      ) : (
        <p className="alert">
          No targets yet. <Link href="/onboarding">Finish setting up</Link>.
        </p>
      )}
    </div>
  );
}
