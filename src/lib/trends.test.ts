import { describe, expect, it } from "vitest";
import {
  barsFor,
  dailyPoints,
  dayLabel,
  goalFor,
  isMet,
  listFor,
  periodFor,
  periodLabel,
  statsFor,
  summaryLine,
  type SummaryRow,
  type TargetVersion,
} from "./trends";

const today = "2026-10-09"; // a Friday
const versions: TargetVersion[] = [
  { effective_from: "2026-10-01", steps: 8000, active_kcal: 400, kcal: 2000 },
  { effective_from: "2026-10-06", steps: 10000, active_kcal: 450, kcal: 2200 },
];

describe("periodFor", () => {
  it("runs weeks Sunday to Saturday", () => {
    expect(periodFor("week", today)).toMatchObject({ from: "2026-10-04", to: "2026-10-10", prev: "2026-09-27", next: "2026-10-11" });
  });
  it("covers the whole month", () => {
    expect(periodFor("month", "2026-02-14")).toMatchObject({ from: "2026-02-01", to: "2026-02-28", prev: "2026-01-01", next: "2026-03-01" });
  });
  it("makes 3 Months the 13 weeks ending this week", () => {
    const p = periodFor("3m", today);
    expect(p.to).toBe("2026-10-10");
    expect(p.from).toBe("2026-07-12");
  });
  it("covers the calendar year", () => {
    expect(periodFor("year", today)).toMatchObject({ from: "2026-01-01", to: "2026-12-31", prev: "2025-01-01" });
  });
});

describe("labels", () => {
  it("names days like the reference app", () => {
    expect(dayLabel(today, today)).toBe("Today");
    expect(dayLabel("2026-10-08", today)).toBe("Yesterday");
    expect(dayLabel("2026-10-07", today)).toBe("Wed, Oct 7");
  });
  it("names periods", () => {
    expect(periodLabel("week", periodFor("week", today), today)).toBe("Oct 4–10");
    expect(periodLabel("week", periodFor("week", "2026-09-30"), today)).toBe("Sep 27 – Oct 3");
    expect(periodLabel("month", periodFor("month", today), today)).toBe("October 2026");
  });
});

describe("goals", () => {
  it("uses the target version in force that day", () => {
    expect(goalFor("steps", "2026-10-05", versions)).toBe(8000);
    expect(goalFor("steps", "2026-10-06", versions)).toBe(10000);
    expect(goalFor("eaten", "2026-09-20", versions)).toBe(2000); // before any target: earliest
  });
  it("counts eaten as met only when on target (90–110%)", () => {
    expect(isMet("eaten", 2100, 2000, true)).toBe(true);
    expect(isMet("eaten", 2500, 2000, true)).toBe(false);
    expect(isMet("steps", 10200, 10000, true)).toBe(true);
    expect(isMet("steps", 0, 10000, false)).toBe(false);
  });
});

describe("week view", () => {
  const rows: SummaryRow[] = [
    { local_date: "2026-10-04", steps: 12000, intake_kcal: 2150, workout_kcal: 0 },
    { local_date: "2026-10-05", steps: 3000, intake_kcal: 0, workout_kcal: 0 },
    { local_date: "2026-10-07", steps: 9000, intake_kcal: 1500, workout_kcal: 300 },
    { local_date: "2026-10-09", steps: 10500, intake_kcal: 2200, workout_kcal: 0 },
  ];
  const p = periodFor("week", today);
  const points = dailyPoints("steps", p.from, p.to, rows, versions, 70);

  it("has 7 bars, no bar for Saturday (future), S..S labels", () => {
    const bars = barsFor("week", points, today);
    expect(bars.map((b) => b.label).join("")).toBe("SMTWTFS");
    expect(bars[6].value).toBeNull();
    expect(bars[0].met).toBe(true); // 12,000 >= 8,000
  });

  it("averages only days with steps entered", () => {
    const s = statsFor(points, today);
    expect(s.loggedDays).toBe(4);
    expect(s.average).toBe(Math.round((12000 + 3000 + 9000 + 10500) / 4));
    expect(s.metDays).toBe(2);
    expect(summaryLine("steps", "week", s)).toBe("You hit your goal on 2 days and took a total of 34,500 steps.");
  });

  it("lists past days newest first, linking to the day view", () => {
    const list = listFor("steps", "week", points, today);
    expect(list[0]).toMatchObject({ label: "Today", value: 10500, href: "/app/trends/steps?range=day&date=2026-10-09" });
    expect(list).toHaveLength(6);
    expect(list.find((r) => r.key === "2026-10-06")?.value).toBeNull(); // nothing entered
  });

  it("computes burned from steps and workouts", () => {
    const burned = dailyPoints("burned", p.from, p.to, rows, versions, 70);
    expect(burned.find((d) => d.date === "2026-10-07")?.value).toBe(Math.round(9000 * 0.04) + 300);
  });
});

describe("longer ranges", () => {
  const rows: SummaryRow[] = [
    { local_date: "2026-09-01", steps: 6000, intake_kcal: 1800, workout_kcal: 0 },
    { local_date: "2026-09-02", steps: 8000, intake_kcal: 2000, workout_kcal: 0 },
    { local_date: "2026-10-01", steps: 10000, intake_kcal: 2000, workout_kcal: 0 },
  ];
  it("year bars are monthly averages with no bar for empty or future months", () => {
    const p = periodFor("year", today);
    const bars = barsFor("year", dailyPoints("steps", p.from, p.to, rows, versions, 70), today);
    expect(bars).toHaveLength(12);
    expect(bars[8].value).toBe(7000); // September
    expect(bars[9].value).toBe(10000);
    expect(bars[10].value).toBeNull();
    const list = listFor("steps", "year", dailyPoints("steps", p.from, p.to, rows, versions, 70), today);
    expect(list[0].label).toBe("October");
    expect(list.map((r) => r.label)).toEqual(["October", "September"]); // empty months left out
  });
  it("3 Months has 13 weekly bars", () => {
    const p = periodFor("3m", today);
    expect(barsFor("3m", dailyPoints("steps", p.from, p.to, rows, versions, 70), today)).toHaveLength(13);
  });
});
