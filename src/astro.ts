// Calculation layer: turns Astronomy Engine output into the data the UI shows.
// Times are Date objects; "day" means the calendar day in the place's IANA time zone.
import {
  Body,
  Equator,
  Horizon,
  Illumination,
  MoonPhase,
  NextMoonQuarter,
  Observer,
  SearchHourAngle,
  SearchMoonPhase,
  SearchMoonQuarter,
  SearchRiseSet,
  Seasons,
  type FlexibleDateTime,
} from "./vendor/astronomy.ts";
import { norm360, angleDiff } from "./angles.ts";
import { DAY_MS, MINUTE_MS, bisectMs, zonedDayMs, zonedDayStart, zonedNoon } from "./time.ts";

export interface Place {
  id: string;
  name: string;
  lat: number;
  lon: number;
  timeZone: string; // IANA zone
  source: "gps" | "search" | "manual";
  country?: string;
  accuracyM?: number;
}

export interface SkyPosition {
  altitude: number; // degrees, with atmospheric refraction
  azimuth: number; // degrees from north, clockwise
}

export interface RiseSet {
  rise: Date | null; // null when the event does not happen on this local day
  set: Date | null;
  riseAzimuth: number | null;
  setAzimuth: number | null;
}

export type LightState = "day" | "civil" | "nautical" | "astronomical" | "night";

// One light kind from `from` to `to` (instants for the sun's bands, wall-clock hours for the dial).
export interface Stretch<T> {
  kind: LightState;
  from: T;
  to: T;
}

export type MoonPhaseName =
  | "new"
  | "waxingCrescent"
  | "firstQuarter"
  | "waxingGibbous"
  | "full"
  | "waningGibbous"
  | "lastQuarter"
  | "waningCrescent";

export interface QuarterEvent {
  quarter: 0 | 1 | 2 | 3; // 0 new, 1 first quarter, 2 full, 3 last quarter
  time: Date;
}

export interface MoonInfo extends RiseSet {
  position: SkyPosition;
  phaseAngle: number; // 0 new, 90 first quarter, 180 full, 270 last quarter
  phaseName: MoonPhaseName;
  illumination: number; // fraction of disc lit, 0..1
  upAtDayStart: boolean; // moon above the horizon at the start of the local day
  ageMs: number; // time since previous new moon
  nextQuarters: QuarterEvent[]; // next four
}

export interface SunInfo extends RiseSet {
  position: SkyPosition;
  light: LightState;
  daylightMs: number | null;
  daylightDeltaMs: number | null; // change vs previous local day
  polar: "day" | "night" | null; // no sunrise and no sunset in the local day
  bands: Stretch<Date>[]; // light kinds covering the local day, in order
  rising: boolean; // altitude increasing at this moment
}

export interface SeasonsInfo {
  marchEquinox: Date;
  juneSolstice: Date;
  septemberEquinox: Date;
  decemberSolstice: Date;
}

function observer(place: Place): Observer {
  return new Observer(place.lat, place.lon, 0);
}

// refracted: false gives the geometric altitude, the basis the engine uses for twilight events.
export function position(body: Body, t: FlexibleDateTime, place: Place, refracted = true): SkyPosition {
  const obs = observer(place);
  const eq = Equator(body, t, obs, true, true);
  const hor = Horizon(t, obs, eq.ra, eq.dec, refracted ? "normal" : undefined);
  return { altitude: hor.altitude, azimuth: hor.azimuth };
}

// First event inside [dayStart, dayEnd), or null.
function withinDay(
  search: (start: Date, limitDays: number) => { date: Date } | null,
  day: Date,
  tz: string,
): Date | null {
  const [start, end] = zonedDayMs(day, tz);
  const found = search(new Date(start), (end - start) / DAY_MS);
  if (!found || found.date.getTime() >= end) return null;
  return found.date;
}

export function riseSet(body: Body, day: Date, place: Place): RiseSet {
  const obs = observer(place);
  const rise = withinDay((s, l) => SearchRiseSet(body, obs, +1, s, l), day, place.timeZone);
  const set = withinDay((s, l) => SearchRiseSet(body, obs, -1, s, l), day, place.timeZone);
  return {
    rise,
    set,
    riseAzimuth: rise ? position(body, rise, place).azimuth : null,
    setAzimuth: set ? position(body, set, place).azimuth : null,
  };
}

// The standard sunrise/sunset altitude of the sun's centre.
const SUNRISE_ALT = -0.833;

// Light kind from the sun's GEOMETRIC altitude (no refraction), the same basis the engine uses
// for twilight events.
function lightState(geometricAltitude: number): LightState {
  if (geometricAltitude >= SUNRISE_ALT) return "day";
  if (geometricAltitude >= -6) return "civil";
  if (geometricAltitude >= -12) return "nautical";
  if (geometricAltitude >= -18) return "astronomical";
  return "night";
}

const geometricAltitude = (t: Date, place: Place): number => position(Body.Sun, t, place, false).altitude;

// Rise and set of one day in time order; up: the body comes up at that moment.
export function toggles(rs: RiseSet): { t: number; up: boolean }[] {
  const out = [];
  if (rs.rise) out.push({ t: rs.rise.getTime(), up: true });
  if (rs.set) out.push({ t: rs.set.getTime(), up: false });
  return out.sort((a, b) => a.t - b.t);
}

// Up intervals of the sun within the place's local day, from its rise/set events (upper limb, refracted).
function upIntervals(day: Date, place: Place, rs: RiseSet): [number, number][] {
  const [start, end] = zonedDayMs(day, place.timeZone);
  const events = toggles(rs);
  // Up at the start of the day if the first event is a set; with no events, as at noon.
  const up = events.length
    ? !events[0]!.up
    : lightState(geometricAltitude(zonedNoon(day, place.timeZone), place)) === "day";
  return upSpans(events.map((e) => e.t), up, start, end);
}

// Spans [from, to) where a body is up within [start, end), from the sorted moments it rises or sets
// (each one flips it) and whether it is up at `start`. Empty spans are left out.
export function upSpans(flips: number[], upAtStart: boolean, start: number, end: number): [number, number][] {
  const spans: [number, number][] = [];
  let up = upAtStart;
  let from = start;
  for (const t of [...flips, end]) {
    if (up && t > from) spans.push([from, t]);
    up = !up;
    from = t;
  }
  return spans;
}

// When the sun is up during the local day, matching the sunrise and sunset shown in the app.
export function sunUpIntervals(day: Date, place: Place): [Date, Date][] {
  return upIntervals(day, place, riseSet(Body.Sun, day, place)).map(([a, b]) => [new Date(a), new Date(b)]);
}

// Time the sun is up within the place's local day.
function daylight(day: Date, place: Place): { ms: number; rs: RiseSet; upAt: (t: number) => boolean } {
  const rs = riseSet(Body.Sun, day, place);
  const intervals = upIntervals(day, place, rs);
  const ms = intervals.reduce((sum, [a, b]) => sum + (b - a), 0);
  const upAt = (t: number) => intervals.some(([a, b]) => t >= a && t < b);
  return { ms, rs, upAt };
}

// Light kind at t: day while the sun is up per its rise/set events, otherwise the twilight kind from the
// geometric altitude, never "day" (the centre can sit just above the sunrise altitude while the sun is down).
function lightAt(t: number, place: Place, upAt: (t: number) => boolean): LightState {
  if (upAt(t)) return "day";
  const k = lightState(geometricAltitude(new Date(t), place));
  return k === "day" ? "civil" : k;
}

// Step for sampling the sky through a day (light bands, highest point, sky paths).
export const SAMPLE_MS = 10 * MINUTE_MS;

// Light bands covering the local day. Day = sun up per rise/set events; twilight kinds from the
// geometric altitude. Sampled every 10 min, boundaries refined by bisection to about a second.
// Sampling (not one event per kind) copes with days where a twilight boundary is crossed twice.
function lightBands(day: Date, place: Place, upAt: (t: number) => boolean): SunInfo["bands"] {
  const [start, end] = zonedDayMs(day, place.timeZone);
  const kindAt = (t: number) => lightAt(t, place, upAt);
  const bands: SunInfo["bands"] = [];
  let from = start;
  let kind = kindAt(start);
  for (let a = start; a < end; a += SAMPLE_MS) {
    // Probe just before midnight on the last step so a change in its final minutes is not missed.
    const probe = Math.min(a + SAMPLE_MS, end - 1);
    const kb = kindAt(probe);
    if (kb === kind) continue;
    const edge = bisectMs(a, probe, (t) => kindAt(t) === kind);
    bands.push({ kind, from: new Date(from), to: new Date(edge) });
    from = edge;
    kind = kb;
  }
  bands.push({ kind, from: new Date(from), to: new Date(end) });
  return bands;
}

export type TwilightKind = "civil" | "nautical" | "astronomical";

const LIGHT_DEPTH: Record<LightState, number> = { night: 0, astronomical: 1, nautical: 2, civil: 3, day: 4 };

// What the sun crosses on its way up into each depth (index = LIGHT_DEPTH), or down out of it.
const LEVELS: (TwilightKind | "day" | null)[] = [null, "astronomical", "nautical", "civil", "day"];

// Dawn and dusk carry the twilight kind; the other kinds have none.
type Twilit<K extends string> = { kind: "dawn" | "dusk"; twilight: TwilightKind } | { kind: K; twilight?: never };

export type LightEvent<T> = { at: T } & Twilit<"rise" | "set">;

// The moments the light changes in the local day, from an ordered list of stretches covering it
// (bands as instants, dial segments as hours). Rising into astronomical twilight is the astronomical
// dawn, into nautical the nautical dawn, into civil the civil dawn, into day the sunrise; sinking out of
// each the other way round: sunset, civil dusk, nautical dusk, astronomical dusk.
export function lightEvents<T>(stretches: Stretch<T>[]): LightEvent<T>[] {
  const out: LightEvent<T>[] = [];
  for (let i = 1; i < stretches.length; i++) {
    const a = LIGHT_DEPTH[stretches[i - 1]!.kind];
    const b = LIGHT_DEPTH[stretches[i]!.kind];
    const at = stretches[i]!.from;
    // A jump over several kinds (never seen, but cheap to handle) gives every crossing at one moment.
    if (b > a) for (let l = a + 1; l <= b; l++) out.push(crossing(at, LEVELS[l]!, true));
    else for (let l = a; l > b; l--) out.push(crossing(at, LEVELS[l]!, false));
  }
  return out;
}

function crossing<T>(at: T, level: TwilightKind | "day", up: boolean): LightEvent<T> {
  if (level === "day") return { at, kind: up ? "rise" : "set" };
  return { at, kind: up ? "dawn" : "dusk", twilight: level };
}

// kind: rise, set, dawn, dusk: the moment it happens. transit: it stands highest (crosses the meridian).
// up / down: above / below the horizon the whole day; this row replaces the transit row.
export type DayEvent = {
  body: "sun" | "moon";
  time: Date;
  azimuth: number;
} & Twilit<"rise" | "set" | "transit" | "up" | "down">;

const ENGINE = { sun: Body.Sun, moon: Body.Moon } as const;

// The body's upper meridian crossing in the local day, or null (the Moon skips one day a month).
function transit(body: Body, day: Date, place: Place): Date | null {
  const [start, end] = zonedDayMs(day, place.timeZone);
  const found = SearchHourAngle(body, observer(place), 0, new Date(start), +1).time.date;
  return found.getTime() < end ? found : null;
}

// When the body stands highest in the local day: its transit, else the highest 10 min sample.
export function highest(body: Body, day: Date, place: Place): Date {
  const found = transit(body, day, place);
  if (found) return found;
  const [start, end] = zonedDayMs(day, place.timeZone);
  let best = { ms: start, alt: -Infinity };
  for (let ms = start; ms < end; ms += SAMPLE_MS) {
    const alt = position(body, new Date(ms), place).altitude;
    if (alt > best.alt) best = { ms, alt };
  }
  return new Date(best.ms);
}

// Everything that happens to the light, the Sun and the Moon in the local day, in time order.
export function dayEvents(t: Date, place: Place, sun: SunInfo, moon: MoonInfo): DayEvent[] {
  const at = (body: DayEvent["body"], time: Date) => position(ENGINE[body], time, place).azimuth;
  const out: DayEvent[] = lightEvents(sun.bands).map(({ at: time, ...e }) => ({ body: "sun", ...e, time, azimuth: at("sun", time) }));
  const highRow = (body: DayEvent["body"], allDay: "up" | "down" | null) => {
    const time = allDay ? highest(ENGINE[body], t, place) : transit(ENGINE[body], t, place);
    if (time) out.push({ body, kind: allDay ?? "transit", time, azimuth: at(body, time) });
  };
  highRow("sun", sun.polar === "day" ? "up" : sun.polar === "night" ? "down" : null);
  if (moon.rise) out.push({ body: "moon", kind: "rise", time: moon.rise, azimuth: at("moon", moon.rise) });
  if (moon.set) out.push({ body: "moon", kind: "set", time: moon.set, azimuth: at("moon", moon.set) });
  highRow("moon", moon.rise || moon.set ? null : moon.upAtDayStart ? "up" : "down");
  // Stable sort: events at one moment keep their order (a jump over kinds, sun before moon).
  return out.sort((a, b) => a.time.getTime() - b.time.getTime());
}

export function sunInfo(t: Date, place: Place): SunInfo {
  const today = daylight(t, place);
  const rs = today.rs;
  const pos = position(Body.Sun, t, place);
  return {
    ...rs,
    position: pos,
    light: lightAt(t.getTime(), place, today.upAt),
    bands: lightBands(t, place, today.upAt),
    polar: !rs.rise && !rs.set ? (today.upAt(t.getTime()) ? "day" : "night") : null,
    daylightMs: today.ms,
    daylightDeltaMs: today.ms - daylight(zonedNoon(t, place.timeZone, -1), place).ms,
    rising: position(Body.Sun, new Date(t.getTime() + SAMPLE_MS), place).altitude > pos.altitude,
  };
}

// Principal phases are named only near the exact moment (1° of phase ≈ 2 h);
// otherwise the intermediate name is used. The reference app shows
// "waning gibbous" 6 h before last quarter.
const PRINCIPAL_WINDOW_DEG = 1;

export function phaseName(angle: number): MoonPhaseName {
  const a = norm360(angle);
  const near = (target: number) => Math.abs(angleDiff(a, target)) <= PRINCIPAL_WINDOW_DEG;
  if (near(0)) return "new";
  if (near(90)) return "firstQuarter";
  if (near(180)) return "full";
  if (near(270)) return "lastQuarter";
  if (a < 90) return "waxingCrescent";
  if (a < 180) return "waxingGibbous";
  if (a < 270) return "waningGibbous";
  return "waningCrescent";
}

export function moonInfo(t: Date, place: Place): MoonInfo {
  const angle = MoonPhase(t);
  const prevNew = SearchMoonPhase(0, t, -35);
  const quarters: QuarterEvent[] = [];
  let mq = SearchMoonQuarter(t);
  for (let i = 0; i < 4; i++) {
    quarters.push({ quarter: mq.quarter as QuarterEvent["quarter"], time: mq.time.date });
    mq = NextMoonQuarter(mq);
  }
  const rs = riseSet(Body.Moon, t, place);
  // The first event of the day tells the state at its start: a set means the moon was up.
  const first = toggles(rs)[0];
  return {
    ...rs,
    position: position(Body.Moon, t, place),
    upAtDayStart: first
      ? !first.up
      : position(Body.Moon, zonedDayStart(t, place.timeZone), place).altitude > 0,
    phaseAngle: angle,
    phaseName: phaseName(angle),
    illumination: Illumination(Body.Moon, t).phase_fraction,
    ageMs: prevNew ? t.getTime() - prevNew.date.getTime() : NaN,
    nextQuarters: quarters,
  };
}

export function seasons(year: number): SeasonsInfo {
  const s = Seasons(year);
  return {
    marchEquinox: s.mar_equinox.date,
    juneSolstice: s.jun_solstice.date,
    septemberEquinox: s.sep_equinox.date,
    decemberSolstice: s.dec_solstice.date,
  };
}
