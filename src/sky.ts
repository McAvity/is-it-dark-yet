// The "Sky" section below the main screen: light for photos today, tonight's darkness and planets,
// the Moon's distance, coming events and a few reference values. All from Astronomy Engine.
import {
  ApsisKind,
  Body,
  Constellation,
  Equator,
  GeoMoon,
  Illumination,
  KM_PER_AU,
  NextLunarApsis,
  NextLunarEclipse,
  Observer,
  SearchLocalSolarEclipse,
  SearchLunarApsis,
  SearchLunarEclipse,
  SearchMaxElongation,
  SearchMoonPhase,
  SearchRiseSet,
  SiderealTime,
} from "./vendor/astronomy.ts";
import { highest, position, upSpans, type Place } from "./astro.ts";
import { DAY_MS, MINUTE_MS, bisectMs, zonedDayMs, zonedHours, zonedNoon } from "./time.ts";

export type Span = [number, number]; // [from, to) in ms

// Consecutive stretches of one kind over [start, end), from sampling every `step` and bisecting each
// change to about a second. After a change the rest of the step is checked again, so a stretch shorter
// than the step (blue hour near the equator) is not lost.
export function stretches<K>(start: number, end: number, step: number, kindAt: (ms: number) => K): { kind: K; from: number; to: number }[] {
  const out: { kind: K; from: number; to: number }[] = [];
  let from = start;
  let kind = kindAt(start);
  for (let a = start; a < end; a += step) {
    const probe = Math.min(a + step, end - 1);
    let lo = a;
    while (kindAt(probe) !== kind) {
      const edge = bisectMs(lo, probe, (t) => kindAt(t) === kind);
      out.push({ kind, from, to: edge });
      from = edge;
      kind = kindAt(edge);
      lo = edge;
    }
  }
  out.push({ kind, from, to: end });
  return out;
}

// [from, to) spans where `kind` holds, from stretches.
const spansOf = <K>(list: { kind: K; from: number; to: number }[], kind: K): Span[] =>
  list.filter((s) => s.kind === kind && s.to > s.from).map((s) => [s.from, s.to]);

// Parts of `a` not covered by any span of `b`; both sorted and non-overlapping.
export function subtract(a: Span[], b: Span[]): Span[] {
  const out: Span[] = [];
  for (const [from, to] of a) {
    let cur = from;
    for (const [bf, bt] of b) {
      if (bt <= cur || bf >= to) continue;
      if (bf > cur) out.push([cur, bf]);
      cur = Math.max(cur, bt);
    }
    if (cur < to) out.push([cur, to]);
  }
  return out;
}

const observer = (place: Place) => new Observer(place.lat, place.lon, 0);
const sunGeometric = (ms: number, place: Place) => position(Body.Sun, new Date(ms), place, false).altitude;

// ---- Light for photos: blue hour (sun from −6° to −4°) and golden hour (−4° to +6°), refracted altitude.

export const BLUE_FROM = -6;
export const GOLDEN_FROM = -4;
export const GOLDEN_TO = 6;

export type PhotoKind = "blue" | "golden";

export interface PhotoLight {
  kind: PhotoKind;
  from: Date;
  to: Date;
  morning: boolean; // before the sun stands highest
}

function photoKind(alt: number): PhotoKind | null {
  if (alt >= BLUE_FROM && alt < GOLDEN_FROM) return "blue";
  if (alt >= GOLDEN_FROM && alt < GOLDEN_TO) return "golden";
  return null;
}

const PHOTO_STEP = 5 * MINUTE_MS;

// Blue and golden hours in the place's local day, in time order.
export function photoLight(t: Date, place: Place): PhotoLight[] {
  const [start, end] = zonedDayMs(t, place.timeZone);
  const noon = highest(Body.Sun, t, place).getTime();
  return stretches(start, end, PHOTO_STEP, (ms) => photoKind(position(Body.Sun, new Date(ms), place).altitude))
    .filter((s): s is { kind: PhotoKind; from: number; to: number } => s.kind !== null && s.to > s.from)
    .map((s) => ({ kind: s.kind, from: new Date(s.from), to: new Date(s.to), morning: (s.from + s.to) / 2 < noon }));
}

// ---- Tonight

export type PlanetName = "mercury" | "venus" | "mars" | "jupiter" | "saturn";
const PLANETS: [PlanetName, Body][] = [
  ["mercury", Body.Mercury], ["venus", Body.Venus], ["mars", Body.Mars], ["jupiter", Body.Jupiter], ["saturn", Body.Saturn],
];

export interface PlanetTonight {
  name: PlanetName;
  from: Date; // first and last moment it is up while the sky is dark enough (sun below −6°)
  to: Date;
  magnitude: number;
  constellation: string; // the engine's Latin name, e.g. "Virgo"
}

export interface Night {
  from: Date; // the bar: sunset to sunrise, or noon to noon when the sun does not set or rise
  to: Date;
  night: Span[]; // sun below −18° (astronomical night)
  moonUp: Span[];
  dark: Span[]; // night with the Moon down
  planets: PlanetTonight[];
}

const NIGHT_STEP = 10 * MINUTE_MS;
// The sky is dark enough for planets once the sun is below this (start of nautical twilight).
const PLANET_SUN = -6;

// "Tonight" from noon to noon: in the morning (before local noon) the night that is ending.
export function nightNoons(t: Date, tz: string): [number, number] {
  const a = zonedNoon(t, tz, zonedHours(t, tz) < 12 ? -1 : 0);
  return [a.getTime(), zonedNoon(a, tz, 1).getTime()];
}

// Rise and set moments of a body in [start, end), in time order.
function flips(body: Body, place: Place, start: number, end: number): { t: number; up: boolean }[] {
  const obs = observer(place);
  const out: { t: number; up: boolean }[] = [];
  for (const dir of [+1, -1] as const) {
    let from = start;
    for (;;) {
      const found = SearchRiseSet(body, obs, dir, new Date(from), (end - from) / DAY_MS);
      if (!found || found.date.getTime() >= end) break;
      out.push({ t: found.date.getTime(), up: dir > 0 });
      from = found.date.getTime() + MINUTE_MS;
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

// When a body is up in [start, end), consistent with the rise and set times shown elsewhere.
function bodyUp(body: Body, place: Place, start: number, end: number): Span[] {
  const f = flips(body, place, start, end);
  const upAtStart = f.length ? !f[0]!.up : position(body, new Date(start), place).altitude > 0;
  return upSpans(f.map((e) => e.t), upAtStart, start, end);
}

export function night(t: Date, place: Place): Night {
  const [start, end] = nightNoons(t, place.timeZone);
  const sun = flips(Body.Sun, place, start, end);
  const set = sun.find((e) => !e.up);
  const rise = set && sun.find((e) => e.up && e.t > set.t);
  const sunAlt = new Map<number, number>();
  const sunAt = (ms: number) => {
    let v = sunAlt.get(ms);
    if (v === undefined) sunAlt.set(ms, (v = sunGeometric(ms, place)));
    return v;
  };
  const nightSpans = spansOf(stretches(start, end, NIGHT_STEP, (ms) => sunAt(ms) < -18), true);
  const moonUp = bodyUp(Body.Moon, place, start, end);
  const obs = observer(place);
  const planets: PlanetTonight[] = [];
  for (const [name, body] of PLANETS) {
    const seen = spansOf(
      stretches(start, end, NIGHT_STEP, (ms) => sunAt(ms) < PLANET_SUN && position(body, new Date(ms), place).altitude > 0),
      true,
    );
    if (!seen.length) continue;
    const from = seen[0]![0];
    const to = seen[seen.length - 1]![1];
    const mid = new Date((from + to) / 2);
    const eq = Equator(body, mid, obs, false, true); // J2000, as Constellation expects
    planets.push({ name, from: new Date(from), to: new Date(to), magnitude: Illumination(body, mid).mag, constellation: Constellation(eq.ra, eq.dec).name });
  }
  planets.sort((a, b) => a.from.getTime() - b.from.getTime());
  return {
    from: new Date(set ? set.t : start),
    to: new Date(rise ? rise.t : end),
    night: nightSpans,
    moonUp,
    dark: subtract(nightSpans, moonUp),
    planets,
  };
}

// ---- The Moon

export interface MoonDistance {
  km: number;
  perigee: { time: Date; km: number };
  apogee: { time: Date; km: number };
}

export const moonKm = (t: Date): number => GeoMoon(t).Length() * KM_PER_AU;

export function moonDistance(t: Date): MoonDistance {
  const a = SearchLunarApsis(t);
  const b = NextLunarApsis(a);
  const [peri, apo] = a.kind === ApsisKind.Pericenter ? [a, b] : [b, a];
  return {
    km: moonKm(t),
    perigee: { time: peri.time.date, km: peri.dist_km },
    apogee: { time: apo.time.date, km: apo.dist_km },
  };
}

// ---- Coming events

// A full moon this close counts as a supermoon (about 90% of the way from apogee to perigee).
export const SUPERMOON_KM = 362_000;

export type Upcoming =
  | { kind: "supermoon"; time: Date; km: number }
  | { kind: "elongation"; body: "mercury" | "venus"; time: Date; morning: boolean; degrees: number }
  | { kind: "lunarEclipse"; type: "penumbral" | "partial" | "total"; time: Date }
  | { kind: "solarEclipse"; type: "partial" | "annular" | "total"; time: Date; obscuration: number };

function nextSupermoon(t: Date): Upcoming | null {
  let from = t;
  for (let i = 0; i < 26; i++) {
    const full = SearchMoonPhase(180, from, 40);
    if (!full) return null;
    const km = moonKm(full.date);
    if (km <= SUPERMOON_KM) return { kind: "supermoon", time: full.date, km };
    from = new Date(full.date.getTime() + DAY_MS);
  }
  return null;
}

// The next lunar eclipse with the Moon above the horizon at its peak.
function nextLunarEclipse(t: Date, place: Place): Upcoming | null {
  let e = SearchLunarEclipse(t);
  for (let i = 0; i < 20; i++) {
    if (position(Body.Moon, e.peak.date, place).altitude > 0) {
      return { kind: "lunarEclipse", type: e.kind as "penumbral" | "partial" | "total", time: e.peak.date };
    }
    e = NextLunarEclipse(e.peak);
  }
  return null;
}

// Coming events seen from the place, soonest first: the next supermoon, lunar and solar eclipse,
// and the best view of Mercury and of Venus.
export function upcoming(t: Date, place: Place): Upcoming[] {
  const out: Upcoming[] = [];
  const moon = nextSupermoon(t);
  if (moon) out.push(moon);
  for (const [name, body] of [["mercury", Body.Mercury], ["venus", Body.Venus]] as const) {
    const e = SearchMaxElongation(body, t);
    out.push({ kind: "elongation", body: name, time: e.time.date, morning: e.visibility === "morning", degrees: e.elongation });
  }
  const lunar = nextLunarEclipse(t, place);
  if (lunar) out.push(lunar);
  const solar = SearchLocalSolarEclipse(t, observer(place));
  out.push({ kind: "solarEclipse", type: solar.kind as "partial" | "annular" | "total", time: solar.peak.time.date, obscuration: solar.obscuration });
  return out.sort((a, b) => a.time.getTime() - b.time.getTime());
}

// ---- Reference values

export interface Reference {
  sunConstellation: string;
  moonConstellation: string;
  siderealHours: number; // local apparent sidereal time, 0..24
}

export function reference(t: Date, place: Place): Reference {
  const obs = observer(place);
  const where = (body: Body) => {
    const eq = Equator(body, t, obs, false, true);
    return Constellation(eq.ra, eq.dec).name;
  };
  return {
    sunConstellation: where(Body.Sun),
    moonConstellation: where(Body.Moon),
    siderealHours: (((SiderealTime(t) + place.lon / 15) % 24) + 24) % 24,
  };
}
