import Link from "next/link";
import { SignUpForm } from "./SignUpForm";

export const metadata = { title: "Create account" };
// Read SIGNUP_CODE on each visit (not at build time), so changing it takes effect without a rebuild.
export const dynamic = "force-dynamic";

/** Screen A2 — create an account (User or Gym Instructor) with a username and password. */
export default function SignUpPage() {
  // Server-side check: the code itself never reaches the browser, only whether one is needed.
  const needsCode = Boolean((process.env.SIGNUP_CODE ?? "").trim());
  return (
    <main id="main" className="narrow">
      <h1>Create your account</h1>
      <p className="muted">Free for friends and family.</p>
      <SignUpForm needsCode={needsCode} />
      <p className="small" style={{ marginTop: "1.5rem" }}>
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </main>
  );
}
