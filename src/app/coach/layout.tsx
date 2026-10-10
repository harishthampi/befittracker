import Link from "next/link";

/** Shell for the instructor area: brand, Clients / Invite links, sign out. Designed for desktop and phone. */
export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="topbar" style={{ maxWidth: 960 }}>
        <Link href="/coach" className="brand">
          BeFit<span>Tracker</span> <span className="muted small" style={{ fontWeight: 600 }}>Coach</span>
        </Link>
        <nav className="row" aria-label="Instructor">
          <Link href="/coach" className="btn btn-ghost btn-small">
            Clients
          </Link>
          <Link href="/coach/invite" className="btn btn-small">
            + Invite
          </Link>
          <Link href="/account" className="btn btn-ghost btn-small">
            Account
          </Link>
        </nav>
      </header>
      <main id="main" className="container" style={{ maxWidth: 960, paddingBottom: "3rem" }}>
        {children}
      </main>
    </>
  );
}
