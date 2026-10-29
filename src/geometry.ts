// Pure geometry for the 24 h dial, the horizon chart and the moon disc.
// Everything returns numbers or SVG path strings; the UI places them in inline SVG.
import { norm360, toRad } from "./angles.ts";
import { SAMPLE_MS, highest, position, toggles, upSpans, type MoonInfo, type Place, type Stretch, type SunInfo } from "./astro.ts";
import { sampleTimes, zonedDayMs, zonedHours } from "./time.ts";
import { Body } from "./vendor/astronomy.ts";

export const DIAL_CENTER = 160;
export const HORIZON_W = 358;
export const HORIZON_Y = 120; // the horizon line; the chart runs from the zenith at 0 to the nadir at 2 × this

const r1 = (n: number): number => Math.round(n * 10) / 10 + 0; // +0 turns -0 into 0
const fmt = (n: number): string => String(r1(n));

// Point at `hour` on the dial (0 at the bottom, clockwise), `r` from the centre and `w` along the tangent.
export function dialPoint(hour: number, r: number, w = 0): [number, number] {
  const a = toRad((hour / 24) * 360 + 180);
  return [r1(DIAL_CENTER + r * Math.sin(a) + w * Math.cos(a)), r1(DIAL_CENTER - r * Math.cos(a) + w * Math.sin(a))];
}

// Dial point as "x,y" for SVG.
const pt = (hour: number, r: number, w = 0) => dialPoint(hour, r, w).join(",");

// Arrowhead points at `hour`, tip at radius `tip`, 9 long and 11 wide; out = +1 points inward from
// outside, -1 outward from inside.
export function dialArrow(hour: number, tip: number, out: 1 | -1): string {
  const base = tip + out * 9;
  return `${pt(hour, tip)} ${pt(hour, base, 5.5)} ${pt(hour, base, -5.5)}`;
}

export function dialArc(fromHour: number, toHour: number, rIn: number, rOut: number): string {
  if (toHour - fromHour >= 24 - 1e-9) return dialRing(fromHour, rIn, rOut);
  const span = (((toHour - fromHour) % 24) + 24) % 24;
  const large = span > 12 ? 1 : 0;
  return `M${pt(fromHour, rOut)} A${rOut},${rOut} 0 ${large} 1 ${pt(toHour, rOut)} L${pt(toHour, rIn)} A${rIn},${rIn} 0 ${large} 0 ${pt(fromHour, rIn)} Z`;
}

// A full 24 h band: start and end coincide, so draw each ring as two half arcs.
function dialRing(hour: number, rIn: number, rOut: number): string {
  const [o1, o2, i1, i2] = [pt(hour, rOut), pt(hour + 12, rOut), pt(hour, rIn), pt(hour + 12, rIn)];
  return `M${o1} A${rOut},${rOut} 0 0 1 ${o2} A${rOut},${rOut} 0 0 1 ${o1} L${i1} A${rIn},${rIn} 0 0 0 ${i2} A${rIn},${rIn} 0 0 0 ${i1} Z`;
}

export function lightSegments(sun: SunInfo, tz: string): Stretch<number>[] {
  const out: Stretch<number>[] = [];
  let prev = 0;
  sun.bands.forEach((b, i) => {
    // Wall-clock hours can step backwards in the repeated DST hour; clamp so boundaries never decrease.
    const to = i === sun.bands.length - 1 ? 24 : Math.max(prev, zonedHours(b.to, tz));
    if (to > prev) {
      const last = out[out.length - 1];
      if (last && last.kind === b.kind) last.to = to;
      else out.push({ kind: b.kind, from: prev, to });
    }
    prev = to;
  });
  return out;
}

export function moonSegments(moon: MoonInfo, tz: string): { from: number; to: number }[] {
  // Sort by instant (the wall clock repeats an hour on DST fall-back days), then clamp
  // each boundary to be no earlier than the previous one.
  const hours: number[] = [];
  for (const e of toggles(moon)) hours.push(Math.max(hours.at(-1) ?? 0, zonedHours(new Date(e.t), tz)));
  return upSpans(hours, moon.upAtDayStart, 0, 24).map(([from, to]) => ({ from, to }));
}

// center: the azimuth drawn mid-chart (180 south, 0 north); the opposite direction sits at both edges.
export function horizonX(az: number, center = 180): number {
  const rel = norm360(az - center + 180);
  return r1((rel / 360) * HORIZON_W);
}

// The chart is centred where the sun stands highest that local day. That is on the meridian, so south (180)
// or north (0); in the tropics it flips during the year. At the poles every direction is the same one,
// so it is fixed: south at the North Pole, north at the South Pole.
export function horizonCenter(t: Date, place: Place): 0 | 180 {
  if (place.lat >= 89.9999) return 180;
  if (place.lat <= -89.9999) return 0;
  const az = position(Body.Sun, highest(Body.Sun, t, place), place).azimuth;
  return Math.cos(toRad(az)) > 0 ? 0 : 180;
}

export function horizonY(alt: number): number {
  // Full ±90°: zenith at the top, then the horizon, nadir at the bottom.
  return r1(((90 - alt) / 90) * HORIZON_Y);
}

export function skyPath(body: Body, t: Date, place: Place, center = 180): string {
  const [start, end] = zonedDayMs(t, place.timeZone);
  let d = "";
  let prevX: number | null = null;
  for (const ms of sampleTimes(start, end, SAMPLE_MS)) {
    const p = position(body, new Date(ms), place);
    const x = horizonX(p.azimuth, center);
    // Crossing the chart edge: start a new stroke instead of a line across the whole chart.
    const jump = prevX === null || Math.abs(x - prevX) > HORIZON_W / 2;
    d += `${d ? " " : ""}${jump ? "M" : "L"}${x},${horizonY(p.altitude)}`;
    prevX = x;
  }
  return d;
}

export function moonDiscPath(illumination: number, phaseAngle: number, cx: number, cy: number, r: number, southern: boolean): string {
  const waxing = phaseAngle < 180;
  const gibbous = illumination > 0.5;
  const rx = r1(r * Math.abs(2 * illumination - 1));
  let s1 = waxing ? 1 : 0;
  let s2 = waxing ? (gibbous ? 1 : 0) : gibbous ? 0 : 1;
  if (southern) {
    s1 = 1 - s1;
    s2 = 1 - s2;
  }
  return `M${fmt(cx)},${fmt(cy - r)} A${r},${r} 0 0 ${s1} ${fmt(cx)},${fmt(cy + r)} A${rx},${r} 0 0 ${s2} ${fmt(cx)},${fmt(cy - r)} Z`;
}
