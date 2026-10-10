import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const metadata = { title: "Account" };

/** Account page for Users and Gym Instructors: username, role, change password, sign out. */
export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/account");
  const { data: profile } = await supabase.from("profiles").select("role, username, display_name").eq("id", user.id).single();
  const home = profile?.role === "instructor" ? "/coach" : "/app";

  return (
    <main id="main" className="narrow stack">
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <Link href={home} className="btn btn-ghost btn-small" aria-label="Back">
          ←
        </Link>
        <h1 style={{ margin: 0 }}>Account</h1>
      </div>

      <section className="card">
        <dl className="account-list">
          <dt>Username</dt>
          <dd>{profile?.username ?? user.email}</dd>
          <dt>Name</dt>
          <dd>{profile?.display_name ?? "—"}</dd>
          <dt>Account type</dt>
          <dd>{profile?.role === "instructor" ? "Gym Instructor" : "User"}</dd>
        </dl>
      </section>

      <section className="card">
        <h2>Change password</h2>
        <ChangePasswordForm />
      </section>

      <form action={signOut}>
        <button type="submit" className="btn btn-ghost btn-block">
          Sign out
        </button>
      </form>
    </main>
  );
}
