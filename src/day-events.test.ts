// The list of the day's events must agree with the 24 h dial.
//
// Part 1, CASES: one line per situation, with what the dial and the list show (as on screen, English UI;
//   only the Sun's rows, the Moon is checked elsewhere).
//   Found a wrong day? Add a line with the place, the date and what you expect, then run `bun run test`.
// Part 2, sweep: for many places and days, the listed moments are exactly where the dial changes colour,
//   and at every dawn the sun is rising through that twilight's altitude, at every dusk sinking.
import { describe, expect, test } from "bun:test";
import { dayEvents, lightEvents, moonInfo, position, sunInfo, type LightState, type Place } from "./astro.ts";
import { Body } from "./vendor/astronomy.ts";
import { lightSegments } from "./geometry.ts";
import { fromZoned, zonedHours } from "./time.ts";
import { renderMain } from "./view/main-view.ts";
import { mainState, place } from "./test-fixtures.ts";

const PLACES = {
  northPole: place("North Pole", 90, 0, "Europe/Warsaw"),
  southPole: place("South Pole", -90, 0, "Europe/Warsaw"),
  alert: place("Alert", 82.5, -62.35, "America/Toronto"),
  longyearbyen: place("Longyearbyen", 78.22, 15.65, "Arctic/Longyearbyen"),
  tromso: place("Tromsø", 69.6492, 18.9553, "Europe/Oslo"),
  helsinki: place("Helsinki", 60.17, 24.94, "Europe/Helsinki"),
  salekhard: place("Salekhard", 66.53, 66.6, "Asia/Yekaterinburg"),
  poznan: place("Poznań", 52.4084, 16.9342, "Europe/Warsaw"),
  quito: place("Quito", -0.22985, -78.52495, "America/Guayaquil"),
  sydney: place("Sydney", -33.87, 151.21, "Australia/Sydney"),
  mcmurdo: place("McMurdo", -77.85, 166.67, "Antarctica/McMurdo"),
};
type PlaceKey = keyof typeof PLACES;

const DIAL_NAMES: Record<LightState, string> = {
  day: "day", civil: "civil", nautical: "nautical", astronomical: "astronomical", night: "night",
};
const hhmm = (h: number) => {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

// Noon of the date in the place's zone.
const noon = (p: Place, date: string) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return fromZoned(y, m, d, 12, 0, p.timeZone);
};

// The dial ring as text: "day 00:00–05:16, civil 05:16–24:00".
function dialText(p: Place, date: string): string {
  return lightSegments(sunInfo(noon(p, date), p), p.timeZone)
    .map((s) => `${DIAL_NAMES[s.kind]} ${hhmm(s.from)}–${hhmm(s.to)}`)
    .join(", ");
}

const render = (p: Place, date: string) => renderMain(mainState(p, noon(p, date), undefined, "en"));

// The Sun's rows of the list as shown: "04:53 Astronomical dawn, 05:32 Nautical dawn, …".
function eventsText(p: Place, date: string): string {
  const rows = [...render(p, date).matchAll(/<div class="event[^"]*"><b class="v when">([^<]+)<\/b><span class="(?:swatch|sym)[^"]*"[^>]*>[^<]*<\/span><span class="what">([^<]+)</g)];
  return rows.map((r) => `${r[1]} ${r[2]!.trim()}`).filter((r) => !r.includes("Moon")).join(", ");
}

interface Case {
  what: string;
  at: PlaceKey;
  date: string;
  dial: string;
  events: string;
}

// prettier-ignore
const CASES: Case[] = [
  // Ordinary days
  { what: "ordinary day, every twilight", at: "poznan", date: "2026-11-01",
    dial: "night 00:00–04:52, astronomical 04:52–05:32, nautical 05:32–06:12, civil 06:12–06:48, day 06:48–16:23, civil 16:23–16:59, nautical 16:59–17:39, astronomical 17:39–18:19, night 18:19–24:00",
    events: "04:52 Astronomical dawn, 05:32 Nautical dawn, 06:12 Civil dawn, 06:48 Sunrise, 11:36 Sun transit, 16:23 Sunset, 16:59 Civil dusk, 17:39 Nautical dusk, 18:19 Astronomical dusk" },
  { what: "summer: astronomical twilight across midnight, no night", at: "poznan", date: "2026-06-21",
    dial: "astronomical 00:00–02:17, nautical 02:17–03:40, civil 03:40–04:30, day 04:30–21:18, civil 21:18–22:08, nautical 22:08–23:31, astronomical 23:31–24:00",
    events: "02:17 Nautical dawn, 03:40 Civil dawn, 04:30 Sunrise, 12:54 Sun transit, 21:18 Sunset, 22:08 Civil dusk, 23:31 Nautical dusk" },
  { what: "white nights: civil twilight across midnight", at: "tromso", date: "2026-05-01",
    dial: "civil 00:00–03:21, day 03:21–22:06, civil 22:06–24:00",
    events: "03:21 Sunrise, 12:41 Sun transit, 22:06 Sunset" },
  { what: "polar day in Tromsø", at: "tromso", date: "2026-06-21",
    dial: "day 00:00–24:00",
    events: "12:46 Sun never sets" },
  { what: "polar night in Tromsø: only civil twilight at noon", at: "tromso", date: "2026-12-21",
    dial: "night 00:00–06:28, astronomical 06:28–07:47, nautical 07:47–09:31, civil 09:31–13:53, nautical 13:53–15:38, astronomical 15:38–16:56, night 16:56–24:00",
    events: "06:28 Astronomical dawn, 07:47 Nautical dawn, 09:31 Civil dawn, 11:42 Sun never rises, 13:53 Civil dusk, 15:38 Nautical dusk, 16:56 Astronomical dusk" },
  { what: "brightest at noon is nautical twilight", at: "longyearbyen", date: "2026-12-21",
    dial: "night 00:00–07:37, astronomical 07:37–10:58, nautical 10:58–12:53, astronomical 12:53–16:14, night 16:14–24:00",
    events: "07:37 Astronomical dawn, 10:58 Nautical dawn, 11:55 Sun never rises, 12:53 Nautical dusk, 16:14 Astronomical dusk" },
  { what: "brightest at noon is astronomical twilight", at: "alert", date: "2026-12-21",
    dial: "night 00:00–08:09, astronomical 08:09–14:06, night 14:06–24:00",
    events: "08:09 Astronomical dawn, 11:08 Sun never rises, 14:06 Astronomical dusk" },
  { what: "equator", at: "quito", date: "2027-03-28",
    dial: "night 00:00–05:07, astronomical 05:07–05:31, nautical 05:31–05:55, civil 05:55–06:16, day 06:16–18:22, civil 18:22–18:43, nautical 18:43–19:07, astronomical 19:07–19:31, night 19:31–24:00",
    events: "05:07 Astronomical dawn, 05:31 Nautical dawn, 05:55 Civil dawn, 06:16 Sunrise, 12:19 Sun transit, 18:22 Sunset, 18:43 Civil dusk, 19:07 Nautical dusk, 19:31 Astronomical dusk" },
  { what: "southern hemisphere, winter", at: "sydney", date: "2026-06-21",
    dial: "night 00:00–05:31, astronomical 05:31–06:01, nautical 06:01–06:32, civil 06:32–07:00, day 07:00–16:54, civil 16:54–17:22, nautical 17:22–17:53, astronomical 17:53–18:23, night 18:23–24:00",
    events: "05:31 Astronomical dawn, 06:01 Nautical dawn, 06:32 Civil dawn, 07:00 Sunrise, 11:57 Sun transit, 16:54 Sunset, 17:22 Civil dusk, 17:53 Nautical dusk, 18:23 Astronomical dusk" },
  // Two stretches of one twilight in a day: last night's dusk runs past midnight, then the evening one
  { what: "two civil dusks in one day", at: "helsinki", date: "2026-07-12",
    dial: "civil 00:00–00:01, nautical 00:01–02:52, civil 02:52–04:17, day 04:17–22:34, civil 22:34–23:57, nautical 23:57–24:00",
    events: "00:01 Civil dusk, 02:52 Civil dawn, 04:17 Sunrise, 13:26 Sun transit, 22:34 Sunset, 23:57 Civil dusk" },
  { what: "first summer night below −6°: civil dusk after midnight and another in the evening", at: "salekhard", date: "2026-08-04",
    dial: "civil 00:00–00:15, nautical 00:15–01:06, civil 01:06–03:23, day 03:23–21:53, civil 21:53–23:56, nautical 23:56–24:00",
    events: "00:15 Civil dusk, 01:06 Civil dawn, 03:23 Sunrise, 12:40 Sun transit, 21:53 Sunset, 23:56 Civil dusk" },
  { what: "two astronomical dusks in one day", at: "poznan", date: "2026-07-30",
    dial: "astronomical 00:00–00:03, night 00:03–01:55, astronomical 01:55–03:28, nautical 03:28–04:27, civil 04:27–05:09, day 05:09–20:47, civil 20:47–21:29, nautical 21:29–22:27, astronomical 22:27–23:57, night 23:57–24:00",
    events: "00:03 Astronomical dusk, 01:55 Astronomical dawn, 03:28 Nautical dawn, 04:27 Civil dawn, 05:09 Sunrise, 12:59 Sun transit, 20:47 Sunset, 21:29 Civil dusk, 22:27 Nautical dusk, 23:57 Astronomical dusk" },
  { what: "two astronomical dawns in one day", at: "alert", date: "2026-02-20",
    dial: "night 00:00–00:38, astronomical 00:38–04:45, nautical 04:45–08:00, civil 08:00–14:50, nautical 14:50–18:07, astronomical 18:07–22:50, night 22:50–23:52, astronomical 23:52–24:00",
    events: "00:38 Astronomical dawn, 04:45 Nautical dawn, 08:00 Civil dawn, 11:23 Sun never rises, 14:50 Civil dusk, 18:07 Nautical dusk, 22:50 Astronomical dusk, 23:52 Astronomical dawn" },
  { what: "spring DST change (23 h day)", at: "poznan", date: "2026-03-29",
    dial: "night 00:00–04:34, astronomical 04:34–05:18, nautical 05:18–06:00, civil 06:00–06:34, day 06:34–19:21, civil 19:21–19:56, nautical 19:56–20:37, astronomical 20:37–21:21, night 21:21–24:00",
    events: "04:34 Astronomical dawn, 05:18 Nautical dawn, 06:00 Civil dawn, 06:34 Sunrise, 12:57 Sun transit, 19:21 Sunset, 19:56 Civil dusk, 20:37 Nautical dusk, 21:21 Astronomical dusk" },
  { what: "autumn DST change (25 h day)", at: "poznan", date: "2026-10-25",
    dial: "night 00:00–04:41, astronomical 04:41–05:20, nautical 05:20–06:00, civil 06:00–06:35, day 06:35–16:37, civil 16:37–17:12, nautical 17:12–17:52, astronomical 17:52–18:31, night 18:31–24:00",
    events: "04:41 Astronomical dawn, 05:20 Nautical dawn, 06:00 Civil dawn, 06:35 Sunrise, 11:36 Sun transit, 16:37 Sunset, 17:12 Civil dusk, 17:52 Nautical dusk, 18:31 Astronomical dusk" },

  // North Pole, autumn: day → civil → nautical → astronomical → night
  { what: "pole: polar day", at: "northPole", date: "2026-09-23",
    dial: "day 00:00–24:00",
    events: "13:52 Sun never sets" },
  { what: "pole: sunset, then civil twilight to the end of the day", at: "northPole", date: "2026-09-25",
    dial: "day 00:00–05:16, civil 05:16–24:00",
    events: "05:16 Sunset, 13:52 Sun transit" },
  { what: "pole: civil twilight all day", at: "northPole", date: "2026-09-30",
    dial: "civil 00:00–24:00",
    events: "13:50 Sun never rises" },
  { what: "pole: civil into nautical", at: "northPole", date: "2026-10-08",
    dial: "civil 00:00–14:05, nautical 14:05–24:00",
    events: "13:48 Sun never rises, 14:05 Civil dusk" },
  { what: "pole: nautical all day", at: "northPole", date: "2026-10-15",
    dial: "nautical 00:00–24:00",
    events: "13:46 Sun never rises" },
  { what: "pole: nautical into astronomical just before midnight", at: "northPole", date: "2026-10-24",
    dial: "nautical 00:00–23:59, astronomical 23:59–24:00",
    events: "13:44 Sun never rises, 23:59 Nautical dusk" },
  { what: "pole: astronomical all day", at: "northPole", date: "2026-11-04",
    dial: "astronomical 00:00–24:00",
    events: "12:44 Sun never rises" },
  { what: "pole: astronomical into night", at: "northPole", date: "2026-11-13",
    dial: "astronomical 00:00–09:24, night 09:24–24:00",
    events: "09:24 Astronomical dusk, 12:44 Sun never rises" },
  { what: "pole: polar night", at: "northPole", date: "2026-12-21",
    dial: "night 00:00–24:00",
    events: "12:58 Sun never rises" },

  // North Pole, spring: night → astronomical → nautical → civil → day
  { what: "pole: night into astronomical", at: "northPole", date: "2026-01-28",
    dial: "night 00:00–23:53, astronomical 23:53–24:00",
    events: "13:13 Sun never rises, 23:53 Astronomical dawn" },
  { what: "pole: astronomical into nautical", at: "northPole", date: "2026-02-17",
    dial: "astronomical 00:00–05:02, nautical 05:02–24:00",
    events: "05:02 Nautical dawn, 13:14 Sun never rises" },
  { what: "pole: nautical into civil", at: "northPole", date: "2026-03-05",
    dial: "nautical 00:00–09:29, civil 09:29–24:00",
    events: "09:29 Civil dawn, 13:11 Sun never rises" },
  { what: "pole: sunrise after civil twilight", at: "northPole", date: "2026-03-18",
    dial: "civil 00:00–13:17, day 13:17–24:00",
    events: "13:08 Sun transit, 13:17 Sunrise" },

  // South Pole: the seasons are the other way round
  { what: "South Pole: sunset", at: "southPole", date: "2026-03-22",
    dial: "day 00:00–18:17, civil 18:17–24:00",
    events: "13:07 Sun transit, 18:17 Sunset" },
  { what: "South Pole: sunrise", at: "southPole", date: "2026-09-20",
    dial: "civil 00:00–22:53, day 22:53–24:00",
    events: "13:53 Sun transit, 22:53 Sunrise" },
  { what: "McMurdo: polar night", at: "mcmurdo", date: "2026-06-21",
    dial: "night 00:00–08:33, astronomical 08:33–11:33, nautical 11:33–14:17, astronomical 14:17–17:17, night 17:17–24:00",
    events: "08:33 Astronomical dawn, 11:33 Nautical dawn, 12:55 Sun never rises, 14:17 Nautical dusk, 17:17 Astronomical dusk" },
];

describe("day events cases", () => {
  for (const c of CASES) {
    test(`${c.what} (${PLACES[c.at].name}, ${c.date})`, () => {
      const p = PLACES[c.at];
      expect(dialText(p, c.date)).toBe(c.dial);
      expect(eventsText(p, c.date)).toBe(c.events);
    });
  }
});

// ---- Part 2: sweep ----

const MINUTE_H = 1 / 60 + 1e-6;
// What is wrong on this day, if anything: the listed sun events (from the light bands) against the
// colour changes the dial draws (the same rule applied to the drawn segments, in wall-clock hours).
function problems(p: Place, day: Date): string[] {
  const sun = sunInfo(day, p);
  const events = dayEvents(day, p, sun, moonInfo(day, p)).filter((e) => e.body === "sun");
  const list = events.filter((e) => e.kind !== "up" && e.kind !== "down" && e.kind !== "transit");
  const dial = lightEvents(lightSegments(sun, p.timeZone));
  const out: string[] = [];
  const name = (e: { kind: string; twilight?: string }) => `${e.kind}${e.twilight ? ` ${e.twilight}` : ""}`;
  const show = (xs: { kind: string; twilight?: string; h: number }[]) => xs.map((x) => `${hhmm(x.h)} ${name(x)}`).join(", ") || "—";
  const a = list.map((e) => ({ ...e, h: zonedHours(e.time, p.timeZone) }));
  const b = dial.map((e) => ({ ...e, h: e.at }));
  const same = a.length === b.length && a.every((x, i) => name(x) === name(b[i]!) && Math.abs(x.h - b[i]!.h) <= MINUTE_H);
  if (!same) out.push(`list ${show(a)}, dial ${show(b)}`);
  // One row at the moment the sun stands highest: up/down when it neither rises nor sets, else its transit.
  const high = events.filter((e) => e.kind === "up" || e.kind === "down" || e.kind === "transit");
  const want = sun.polar === "day" ? "up" : sun.polar === "night" ? "down" : "transit";
  if (high.length !== 1 || high[0]!.kind !== want) out.push(`highest rows ${high.map((e) => e.kind).join(", ") || "none"}, want ${want}`);
  // At a dawn the sun is rising through that altitude, at a dusk sinking (sunrise and sunset likewise).
  const altitude = (ms: number) => position(Body.Sun, new Date(ms), p).altitude;
  for (const e of list) {
    const ms = e.time.getTime();
    const up = e.kind === "rise" || e.kind === "dawn";
    const slope = altitude(ms + 60_000) - altitude(ms - 60_000);
    if (Math.sign(slope) !== (up ? 1 : -1)) out.push(`${hhmm(zonedHours(e.time, p.timeZone))} ${name(e)}: the sun is ${up ? "sinking" : "rising"}`);
  }
  return out;
}

describe("day events match the dial, every day of 2026", () => {
  const polar: PlaceKey[] = ["northPole", "southPole", "alert", "longyearbyen", "mcmurdo"];
  for (const key of Object.keys(PLACES) as PlaceKey[]) {
    const p = PLACES[key];
    const every = polar.includes(key) ? 1 : 3;
    test(`${p.name} (every ${every === 1 ? "day" : `${every} days`})`, () => {
      const found: string[] = [];
      for (let i = 0; i < 365; i += every) {
        const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
        for (const msg of problems(p, noon(p, date))) found.push(`${date} ${msg}`);
      }
      expect(found).toEqual([]);
    });
  }
});
