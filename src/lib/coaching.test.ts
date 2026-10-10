import { describe, expect, it } from "vitest";
import { cleanScopes, flagsFor, formatCode, lastLogged, normalizeCode, type ClientDay } from "./coaching";

const today = "2026-10-09";
const day = (local_date: string, over: Partial<ClientDay> = {}): ClientDay => ({
  local_date,
  steps: 0,
  intake_kcal: 0,
  workout_kcal: 0,
  burned_kcal: 0,
  ...over,
});
const all = { nutrition: true, activity: true, kcalTarget: 2000, stepGoal: 8000 };

describe("flagsFor", () => {
  it("flags 2+ days without food, not counting today", () => {
    const days = [day("2026-10-06", { intake_kcal: 1900, steps: 9000 }), day("2026-10-09", { steps: 9000 })];
    const keys = flagsFor(days, today, all).map((f) => f.key);
    expect(keys).toContain("no-food");
    expect(flagsFor(days, today, all).find((f) => f.key === "no-food")?.text).toBe("No food logged for 2 days");
  });

  it("does not flag when yesterday has food", () => {
    const days = [day("2026-10-08", { intake_kcal: 1900, steps: 9000 })];
    expect(flagsFor(days, today, all).map((f) => f.key)).not.toContain("no-food");
  });

  it("flags calories far off target on 3 of 5 logged days", () => {
    const days = ["03", "04", "05", "06", "07"].map((d, i) => day(`2026-10-${d}`, { intake_kcal: i < 3 ? 2700 : 2000, steps: 9000 }));
    days.push(day("2026-10-08", { intake_kcal: 2000, steps: 9000 }));
    // last 5 logged: 8th, 7th, 6th, 5th(2700), 4th(2700) -> only 2 off
    expect(flagsFor(days, today, all).map((f) => f.key)).not.toContain("off-calories");
    days.push(day("2026-10-09", { intake_kcal: 3000, steps: 9000 }));
    // now: 9th(3000), 8th, 7th, 6th, 5th(2700) -> 2 off; still none
    expect(flagsFor(days, today, all).map((f) => f.key)).not.toContain("off-calories");
    const heavy = ["05", "06", "07", "08", "09"].map((d) => day(`2026-10-${d}`, { intake_kcal: 1200, steps: 9000 }));
    expect(flagsFor(heavy, today, all).find((f) => f.key === "off-calories")?.text).toBe("Calories 20%+ off target on 5 of 5 days");
  });

  it("flags missed step goal on 5+ of the days with steps", () => {
    const days = ["03", "04", "05", "06", "07", "08", "09"].map((d) => day(`2026-10-${d}`, { steps: 3000, intake_kcal: 2000 }));
    expect(flagsFor(days, today, all).map((f) => f.key)).toContain("low-steps");
  });

  it("flags a quiet client once instead of piling on", () => {
    const keys = flagsFor([day("2026-10-02", { intake_kcal: 2000 })], today, all).map((f) => f.key);
    expect(keys).toEqual(["no-activity"]);
  });

  it("only uses scopes the client shares", () => {
    const days = [day("2026-10-09", { steps: 9000, intake_kcal: null })];
    expect(flagsFor(days, today, { nutrition: false, activity: true })).toEqual([]);
  });
});

describe("helpers", () => {
  it("finds the last logged day", () => {
    expect(lastLogged([day("2026-10-05", { steps: 10 }), day("2026-10-07"), day("2026-10-06", { intake_kcal: 5 })])).toBe("2026-10-06");
    expect(lastLogged([])).toBeNull();
  });
  it("formats and normalises invite codes", () => {
    expect(formatCode("ABCD2345")).toBe("ABCD-2345");
    expect(normalizeCode(" abcd-2345 ")).toBe("ABCD2345");
  });
  it("keeps only known scopes in order", () => {
    expect(cleanScopes(["goals", "photos", "activity"])).toEqual(["activity", "goals"]);
  });
});
