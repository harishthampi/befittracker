import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";

export const metadata = { title: "Set up" };

/** Screens O1–O4. Already-onboarded people are sent on to their home. */
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name, onboarded_at")
    .eq("id", user.id)
    .single();

  if (profile?.onboarded_at) redirect(profile.role === "instructor" ? "/coach" : "/app");

  return (
    <main id="main" className="narrow">
      <h1>Let&apos;s set you up</h1>
      <p className="muted">Two minutes. You can change everything later.</p>
      <OnboardingForm existingRole={profile?.role ?? null} displayName={profile?.display_name ?? ""} />
    </main>
  );
}
