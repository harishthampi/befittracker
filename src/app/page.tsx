import Link from "next/link";

/** Welcome page (screen A1). Signed-in visitors go straight to /app via the links. */
export default function Welcome() {
  return (
    <main id="main" className="narrow stack">
      <p className="brand" style={{ fontSize: "1.6rem" }}>
        BeFit<span>Tracker</span>
      </p>
      <h1>Eat well, move more, keep the streak.</h1>
      <p className="muted">
        Log your five meals with real nutrition data, track steps and water, and see your day at a glance.
      </p>
      <Link className="btn btn-block" href="/sign-up">
        Get started
      </Link>
      <Link className="btn btn-ghost btn-block" href="/sign-in">
        I have an account
      </Link>
    </main>
  );
}
