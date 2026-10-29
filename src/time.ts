// Time helpers: time zones via Intl only (no libraries), and sampling instants through a day.

export interface ZonedParts {
  year: number; month: number; day: number;
  hour: number; minute: number; second: number;
}

export const STEPS = ["min", "hour", "day", "month", "year"] as const;
export type Step = (typeof STEPS)[number];
export const isStep = (v: unknown): v is Step => (STEPS as readonly unknown[]).includes(v);

export const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric",
    });
    formatters.set(tz, f);
  }
  return f;
}

export function zonedParts(t: Date, tz: string): ZonedParts {
  const v: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const p of formatter(tz).formatToParts(t)) v[p.type] = p.value;
  const n = (k: Intl.DateTimeFormatPartTypes) => Number(v[k]);
  return {
    year: n("year"), month: n("month"), day: n("day"),
    hour: n("hour") % 24, minute: n("minute"), second: n("second"),
  };
}

function wallAsUtc(t: Date, tz: string): number {
  const p = zonedParts(t, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

export function offsetMinutes(t: Date, tz: string): number {
  const ms = Math.floor(t.getTime() / 1000) * 1000;
  return (wallAsUtc(t, tz) - ms) / MINUTE_MS;
}

// Wall clock -> instant. Gap: shifts forward by the gap. Overlap: earlier instant.
// Out-of-range parts roll over like Date.UTC (day 0 is the last day of the previous month).
export function fromZoned(
  year: number, month: number, day: number, hour: number, minute: number, tz: string,
): Date {
  const utc = Date.UTC(year, month - 1, day, hour, minute);
  const before = offsetMinutes(new Date(utc - DAY_MS), tz);
  const after = offsetMinutes(new Date(utc + DAY_MS), tz);
  const matches = [before, after]
    .map((o) => utc - o * MINUTE_MS)
    .filter((t) => wallAsUtc(new Date(t), tz) === utc);
  if (matches.length) return new Date(Math.min(...matches));
  return new Date(utc - before * MINUTE_MS);
}

export function zonedDayStart(t: Date, tz: string): Date {
  const p = zonedParts(t, tz);
  return fromZoned(p.year, p.month, p.day, 0, 0, tz);
}

export function zonedDayEnd(t: Date, tz: string): Date {
  const p = zonedParts(t, tz);
  return fromZoned(p.year, p.month, p.day + 1, 0, 0, tz);
}

// Noon of the local day of t, or of the day `days` later.
export function zonedNoon(t: Date, tz: string, days = 0): Date {
  const p = zonedParts(t, tz);
  return fromZoned(p.year, p.month, p.day + days, 12, 0, tz);
}

// The local day of t as [start, end) in epoch ms.
export function zonedDayMs(t: Date, tz: string): [number, number] {
  return [zonedDayStart(t, tz).getTime(), zonedDayEnd(t, tz).getTime()];
}

export function zonedHours(t: Date, tz: string): number {
  const p = zonedParts(t, tz);
  return p.hour + p.minute / 60 + p.second / 3600;
}

export function addStep(t: Date, step: Step, dir: 1 | -1, tz: string): Date {
  if (step === "min") return new Date(t.getTime() + dir * MINUTE_MS);
  if (step === "hour") return new Date(t.getTime() + dir * HOUR_MS);
  const p = zonedParts(t, tz);
  if (step === "day") return fromZoned(p.year, p.month, p.day + dir, p.hour, p.minute, tz);
  // Month or year: same day and time, clamped to the month's length (29 Feb → 28 Feb).
  const idx = p.year * 12 + (p.month - 1) + dir * (step === "year" ? 12 : 1);
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return fromZoned(y, m, Math.min(p.day, dim), p.hour, p.minute, tz);
}

// Min and max UTC offsets (minutes) sampled on the 1st and 15th of each month.
export function yearOffsets(tz: string, year: number): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let m = 0; m < 12; m++) {
    for (const d of [1, 15]) {
      const o = offsetMinutes(new Date(Date.UTC(year, m, d, 12)), tz);
      min = Math.min(min, o);
      max = Math.max(max, o);
    }
  }
  return { min, max };
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Every `step` from start, then end itself.
export function sampleTimes(start: number, end: number, step: number): number[] {
  const times: number[] = [];
  for (let ms = start; ms < end; ms += step) times.push(ms);
  times.push(end);
  return times;
}

// The moment in [lo, hi] where pred flips (pred(lo) !== pred(hi)), to within a second: the first one known on hi's side.
export function bisectMs(lo: number, hi: number, pred: (ms: number) => boolean): number {
  const left = pred(lo);
  while (hi - lo > 1000) {
    const mid = Math.round((lo + hi) / 2);
    if (pred(mid) === left) lo = mid;
    else hi = mid;
  }
  return hi;
}
