"use client";

import { useActionState, useEffect, useState } from "react";
import { completeOnboarding } from "./actions";
import type { FormState } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { FormMessage } from "@/components/FormMessage";
import { ACTIVITY_LABEL, type ActivityLevel } from "@/lib/nutrition";

/** The onboarding form. Asks for the role only when sign-up didn't set one (Google accounts). */
export function OnboardingForm({
  existingRole,
  displayName,
}: {
  /** Role chosen at sign-up, or null for Google accounts that still need to pick one. */
  existingRole: "user" | "instructor" | null;
  displayName: string;
}) {
  const needsRole = existingRole === null;
  const [state, action] = useActionState<FormState, FormData>(completeOnboarding, {});
  const [role, setRole] = useState<"user" | "instructor">("user");
  const [units, setUnits] = useState<"metric" | "imperial">("metric");
  const [timezone, setTimezone] = useState("America/Toronto");

  // Use the browser's time zone so "today" matches the person's own day.
  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto");
  }, []);

  // Body stats are only for Users. Instructors (chosen at sign-up or just now) skip straight to their area.
  const isUser = (existingRole ?? role) === "user";

  return (
    <form action={action} className="stack">
      <input type="hidden" name="timezone" value={timezone} />

      {needsRole && (
        <fieldset className="card" style={{ border: "1px solid var(--border)" }}>
          <legend className="visually-hidden">Role</legend>
          <h2>I am a…</h2>
          <div className="segmented">
            <input type="radio" id="ob-user" name="role" value="user" checked={role === "user"} onChange={() => setRole("user")} />
            <label htmlFor="ob-user">
              User<span>Track my food and activity</span>
            </label>
            <input type="radio" id="ob-instructor" name="role" value="instructor" checked={role === "instructor"} onChange={() => setRole("instructor")} />
            <label htmlFor="ob-instructor">
              Gym Instructor<span>Follow my clients</span>
            </label>
          </div>
          <p className="hint">This can&apos;t be changed later.</p>
        </fieldset>
      )}

      <div className="card">
        <div className="field">
          <label htmlFor="display_name">First name</label>
          <input id="display_name" name="display_name" defaultValue={displayName} maxLength={80} autoComplete="given-name" />
        </div>
      </div>

      {isUser && (
        <>
          <div className="card">
            <h2>About you</h2>
            <p className="small muted">Used only to calculate your daily calorie and macro targets.</p>
            <div className="field">
              <label htmlFor="birth_date">Date of birth</label>
              <input id="birth_date" name="birth_date" type="date" required autoComplete="bday" />
            </div>
            <fieldset className="field" style={{ border: 0, padding: 0 }}>
              <legend style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.25rem" }}>Sex (for the calorie formula)</legend>
              <div className="segmented">
                <input type="radio" id="sex-f" name="sex" value="female" defaultChecked />
                <label htmlFor="sex-f">Female</label>
                <input type="radio" id="sex-m" name="sex" value="male" />
                <label htmlFor="sex-m">Male</label>
              </div>
            </fieldset>

            <fieldset className="field" style={{ border: 0, padding: 0 }}>
              <legend style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.25rem" }}>Units</legend>
              <div className="segmented">
                <input type="radio" id="u-metric" name="units" value="metric" checked={units === "metric"} onChange={() => setUnits("metric")} />
                <label htmlFor="u-metric">cm / kg</label>
                <input type="radio" id="u-imperial" name="units" value="imperial" checked={units === "imperial"} onChange={() => setUnits("imperial")} />
                <label htmlFor="u-imperial">ft-in / lb</label>
              </div>
            </fieldset>

            {units === "metric" ? (
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="height_cm">Height (cm)</label>
                  <input id="height_cm" name="height_cm" type="number" inputMode="decimal" min={100} max={250} step="0.1" required />
                </div>
                <div className="field">
                  <label htmlFor="weight_kg">Weight (kg)</label>
                  <input id="weight_kg" name="weight_kg" type="number" inputMode="decimal" min={30} max={300} step="0.1" required />
                </div>
              </div>
            ) : (
              <div className="grid-2">
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label htmlFor="height_ft">Height (ft)</label>
                    <input id="height_ft" name="height_ft" type="number" inputMode="numeric" min={3} max={8} required />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label htmlFor="height_in">(in)</label>
                    <input id="height_in" name="height_in" type="number" inputMode="numeric" min={0} max={11} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="weight_lb">Weight (lb)</label>
                  <input id="weight_lb" name="weight_lb" type="number" inputMode="decimal" min={66} max={660} step="0.1" required />
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="field">
              <label htmlFor="activity_level">Activity level</label>
              <select id="activity_level" name="activity_level" defaultValue="light" required>
                {(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((a) => (
                  <option key={a} value={a}>
                    {ACTIVITY_LABEL[a]}
                  </option>
                ))}
              </select>
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.25rem" }}>Goal</legend>
              <div className="segmented" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <input type="radio" id="g-lose" name="goal" value="lose" />
                <label htmlFor="g-lose">Lose</label>
                <input type="radio" id="g-maintain" name="goal" value="maintain" defaultChecked />
                <label htmlFor="g-maintain">Maintain</label>
                <input type="radio" id="g-gain" name="goal" value="gain" />
                <label htmlFor="g-gain">Gain</label>
              </div>
            </fieldset>
          </div>
        </>
      )}

      <FormMessage state={state} />
      <SubmitButton pending="Calculating…">{isUser ? "Calculate my targets" : "Continue"}</SubmitButton>
    </form>
  );
}
