/**
 * Day handling. All logging is keyed by the person's own calendar day
 * ("local date", YYYY-MM-DD) in their profile time zone.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in a given IANA time zone, as YYYY-MM-DD. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Accepts a ?date= value only if it is a real YYYY-MM-DD date; otherwise returns the fallback. */
export function parseDateParam(value: string | undefined | null, fallback: string): string {
  if (!value || !ISO_DATE.test(value)) return fallback;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? fallback : value;
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Thu, Oct 8" style label for headers. */
export function formatDay(date: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
