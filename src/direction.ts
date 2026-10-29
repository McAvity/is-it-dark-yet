// When the sun shines from a given compass direction during the place's local day.
import { position, sunUpIntervals, type Place } from "./astro.ts";
import { angleDiff, norm360 } from "./angles.ts";
import { MINUTE_MS, bisectMs, sampleTimes, zonedDayMs } from "./time.ts";
import { Body } from "./vendor/astronomy.ts";

export interface DirectionWindow {
  from: Date;
  to: Date;
  exact: Date | null; // sun azimuth equals the target (null when the window ends before it gets there)
  exactAltitude: number | null; // refracted altitude of the sun's centre at `exact`
}

const STEP_MS = 2 * MINUTE_MS;

interface Sample { ms: number; alt: number; d: number } // d: signed azimuth difference, [-180, 180)

// The sun's azimuth goes through the target between a and b (not the jump on the opposite side).
const crosses = (a: Sample, b: Sample) => (a.d < 0) !== (b.d < 0) && Math.abs(a.d) < 90 && Math.abs(b.d) < 90;

// Intervals where the sun is up (between its sunrise and sunset, as shown in the app) and its
// azimuth is within `tolerance` of `azimuth`, clipped to the local day.
export function sunDirectionWindows(day: Date, place: Place, azimuth: number, tolerance: number): DirectionWindow[] {
  const target = norm360(azimuth);
  const tol = Math.min(45, Math.max(0.5, tolerance));
  const [start, end] = zonedDayMs(day, place.timeZone);
  const up = sunUpIntervals(day, place).map(([a, b]) => [a.getTime(), b.getTime()] as const);
  if (!up.length) return [];

  const at = (ms: number): Sample => {
    const p = position(Body.Sun, new Date(ms), place);
    return { ms, alt: p.altitude, d: angleDiff(p.azimuth, target) };
  };
  const near = (s: Sample) => Math.abs(s.d) <= tol;
  // The sample where pred flips between a and b, to within a second.
  const bisect = (a: Sample, b: Sample, pred: (s: Sample) => boolean) => at(bisectMs(a.ms, b.ms, (ms) => pred(at(ms))));

  // Samples, plus every crossing of the target so a window shorter than one step is not missed.
  const raw = sampleTimes(start, end, STEP_MS).map(at);
  const samples: Sample[] = [raw[0]!];
  const crossings: Sample[] = [];
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1]!;
    const b = raw[i]!;
    if (crosses(a, b)) {
      const c = bisect(a, b, (s) => s.d < 0);
      crossings.push(c);
      samples.push(c);
    }
    samples.push(b);
  }

  // Azimuth windows over the whole day, regardless of altitude.
  const az: [number, number][] = [];
  let from: number | null = near(samples[0]!) ? start : null;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    if (near(a) === near(b)) continue;
    const edge = bisect(a, b, near).ms;
    if (near(b)) from = edge;
    else if (from !== null) {
      az.push([from, edge]);
      from = null;
    }
  }
  if (from !== null) az.push([from, end]);

  // Keep the parts while the sun is up.
  const windows: DirectionWindow[] = [];
  for (const [a, b] of az) {
    for (const [u, v] of up) {
      const f = Math.max(a, u);
      const t = Math.min(b, v);
      if (f >= t) continue;
      const c = crossings.find((x) => x.ms >= f && x.ms <= t);
      windows.push({ from: new Date(f), to: new Date(t), exact: c ? new Date(c.ms) : null, exactAltitude: c ? c.alt : null });
    }
  }
  return windows;
}
