import Link from "next/link";

export const metadata = { title: "Forgot password" };

/**
 * Accounts use usernames, not emails, so there's no reset link to send. The app owner resets
 * passwords with scripts/reset-password.mjs (see the go-live guide).
 */
export default function ForgotPasswordPage() {
  return (
    <main id="main" className="narrow stack">
      <h1>Forgot your password?</h1>
      <p>
        BeFitTracker uses usernames instead of email, so it can&apos;t send a reset link. Ask the person who runs your
        BeFitTracker to reset it for you. It takes them a minute.
      </p>
      <p className="muted small">
        Once you&apos;re back in, you can choose a new password under <strong>Account</strong>.
      </p>
      <Link href="/sign-in" className="btn btn-ghost btn-block">
        Back to sign in
      </Link>
    </main>
  );
}
