// Reference values for Poznań, 2026-11-01 15:25 CET, checked against an independent sun and moon app.
import { describe, expect, test } from "bun:test";
import { dayEvents, moonInfo, phaseName, seasons, sunInfo, sunUpIntervals, type Place } from "./astro.ts";
import { Body, Observer, SearchAltitude } from "./vendor/astronomy.ts";
import { formatDate, formatTime } from "./format.ts";
import { zonedDayEnd, zonedDayStart } from "./time.ts";
import { lightSegments } from "./geometry.ts";
import { LISBON, NORTH_POLE as POLE, POZNAN, TROMSO } from "./test-fixtures.ts";

const NOW = new Date("2026-11-01T15:25:00+01:00");

// Reference twilight times straight from the engine (first crossing of each altitude in the local day),
// to check the app's own light bands against.
function twilight(day: Date, place: Place) {
  const [start, end] = [zonedDayStart(day, place.timeZone), zonedDayEnd(day, place.timeZone)];
  const at = (dir: 1 | -1, alt: number) => {
    const found = SearchAltitude(Body.Sun, new Observer(place.lat, place.lon, 0), dir, start, 1, alt);
    return found && found.date < end ? found.date : null;
  };
  return {
    astronomicalDawn: at(+1, -18), nauticalDawn: at(+1, -12), civilDawn: at(+1, -6),
    civilDusk: at(-1, -6), nauticalDusk: at(-1, -12), astronomicalDusk: at(-1, -18),
  };
}
const MIN = 60_000;

// Expected local time "YYYY-MM-DD HH:MM" in UTC+1/UTC+2 written as an ISO offset string.
function expectNear(actual: Date | null, expectedIso: string, toleranceMin = 1) {
  expect(actual).not.toBeNull();
  const diffMin = Math.abs(actual!.getTime() - new Date(expectedIso).getTime()) / MIN;
  if (diffMin > toleranceMin) {
    throw new Error(`expected ${expectedIso} ±${toleranceMin} min, got ${actual!.toISOString()} (off by ${diffMin.toFixed(1)} min)`);
  }
}

function expectAngle(actual: number | null, expected: number, tolerance = 1) {
  expect(actual).not.toBeNull();
  expect(Math.abs(actual! - expected)).toBeLessThanOrEqual(tolerance);
}

describe("sun, Poznań 2026-11-01", () => {
  const sun = sunInfo(NOW, POZNAN);

  test("sunrise 06:48 at 113°, sunset 16:23 at 247°", () => {
    expectNear(sun.rise, "2026-11-01T06:48+01:00");
    expectNear(sun.set, "2026-11-01T16:23+01:00");
    expectAngle(sun.riseAzimuth, 113);
    expectAngle(sun.setAzimuth, 247);
  });

  test("twilight times", () => {
    expectNear(twilight(NOW, POZNAN).astronomicalDawn, "2026-11-01T04:52+01:00");
    expectNear(twilight(NOW, POZNAN).nauticalDawn, "2026-11-01T05:32+01:00");
    expectNear(twilight(NOW, POZNAN).civilDawn, "2026-11-01T06:12+01:00");
    expectNear(twilight(NOW, POZNAN).civilDusk, "2026-11-01T16:59+01:00");
    expectNear(twilight(NOW, POZNAN).nauticalDusk, "2026-11-01T17:40+01:00");
    expectNear(twilight(NOW, POZNAN).astronomicalDusk, "2026-11-01T18:19+01:00");
  });

  test("daylight 9 h 35 min, Δ -4 min", () => {
    expect(Math.abs(sun.daylightMs! / MIN - (9 * 60 + 35))).toBeLessThanOrEqual(1);
    expect(Math.abs(sun.daylightDeltaMs! / MIN - -4)).toBeLessThanOrEqual(1);
  });

  test("no polar state in Poznań", () => {
    expect(sun.polar).toBeNull();
  });

  test("current position: altitude 6.9°, azimuth 235.1°, daylight", () => {
    expectAngle(sun.position.altitude, 6.9, 0.3);
    expectAngle(sun.position.azimuth, 235.1, 0.3);
    expect(sun.light).toBe("day");
  });
});

describe("moon, Poznań 2026-11-01", () => {
  const moon = moonInfo(NOW, POZNAN);

  test("moonset 13:38 at 306°, moonrise 22:12 at 58°", () => {
    expectNear(moon.set, "2026-11-01T13:38+01:00", 2);
    expectNear(moon.rise, "2026-11-01T22:12+01:00", 2);
    expectAngle(moon.setAzimuth, 306);
    expectAngle(moon.riseAzimuth, 58);
  });

  test("moonset at local midnight counts as up at day start (Poznań 2026-06-19)", () => {
    const m = moonInfo(new Date("2026-06-19T10:00:00Z"), POZNAN);
    expect(m.upAtDayStart).toBe(true);
  });

  test("moon was up at the start of the day", () => {
    expect(moon.upAtDayStart).toBe(true);
  });

  test("current position: altitude -11.0°, azimuth 327.1°", () => {
    expectAngle(moon.position.altitude, -11.0, 0.5);
    expectAngle(moon.position.azimuth, 327.1, 0.5);
  });

  test("waning gibbous, 53% lit, age 21 d 22 h 34 min", () => {
    expect(moon.phaseName).toBe("waningGibbous");
    expect(Math.round(moon.illumination * 100)).toBe(53);
    const expectedAge = ((21 * 24 + 22) * 60 + 34) * MIN;
    expect(Math.abs(moon.ageMs - expectedAge) / MIN).toBeLessThanOrEqual(5);
  });

  // Engine times are ~1 min earlier than the screenshot app.
  test("next four quarters", () => {
    expect(moon.nextQuarters.map((q) => q.quarter)).toEqual([3, 0, 1, 2]);
    expectNear(moon.nextQuarters[0]!.time, "2026-11-01T21:30+01:00", 2);
    expectNear(moon.nextQuarters[1]!.time, "2026-11-09T08:03+01:00", 2);
    expectNear(moon.nextQuarters[2]!.time, "2026-11-17T12:49+01:00", 2);
    expectNear(moon.nextQuarters[3]!.time, "2026-11-24T15:55+01:00", 2);
  });
});

describe("seasons 2026", () => {
  const s = seasons(2026);
  // Expected values are published USNO times (UTC). The screenshot app is 2–4 min off
  // (15:42, 10:21, 02:02, 21:48 local), so it is not used as the reference here.
  test("equinoxes and solstices", () => {
    expectNear(s.marchEquinox, "2026-03-20T14:46Z", 2);
    expectNear(s.juneSolstice, "2026-06-21T08:24Z", 2);
    expectNear(s.septemberEquinox, "2026-09-23T00:05Z", 2);
    expectNear(s.decemberSolstice, "2026-12-21T20:50Z", 2);
  });
});

describe("phase names", () => {
  test("principal phases only near the exact moment", () => {
    expect(phaseName(0.5)).toBe("new");
    expect(phaseName(359.5)).toBe("new");
    expect(phaseName(5)).toBe("waxingCrescent");
    expect(phaseName(45)).toBe("waxingCrescent");
    expect(phaseName(90)).toBe("firstQuarter");
    expect(phaseName(135)).toBe("waxingGibbous");
    expect(phaseName(180)).toBe("full");
    expect(phaseName(266.7)).toBe("waningGibbous"); // screenshot case
    expect(phaseName(270)).toBe("lastQuarter");
    expect(phaseName(315)).toBe("waningCrescent");
  });
});

const H = 3_600_000;

describe("North Pole around the September equinox", () => {
  test("2026-09-24: polar day, sun up the whole day", () => {
    const sun = sunInfo(new Date("2026-09-24T06:12:00Z"), POLE);
    expect(sun.polar).toBe("day");
    expect(sun.light).toBe("day");
    expect(sun.daylightMs).toBe(24 * H);
  });

  test("2026-09-25: last sunset 05:16, then civil twilight", () => {
    const sun = sunInfo(new Date("2026-09-25T06:12:00Z"), POLE); // 08:12 local
    expect(sun.rise).toBeNull();
    expect(sun.set).not.toBeNull();
    expect(sun.polar).toBeNull();
    expect(sun.light).toBe("civil");
    expect(Math.abs(sun.daylightMs! / H - 5.27)).toBeLessThan(0.02);
    expect(Math.abs(sun.daylightDeltaMs! / H - (5.27 - 24))).toBeLessThan(0.02);
  });

  test("2026-09-26: no events, civil twilight all day", () => {
    const sun = sunInfo(new Date("2026-09-26T06:12:00Z"), POLE);
    expect(sun.polar).toBe("night");
    expect(sun.light).toBe("civil");
    expect(sun.bands.map((b) => b.kind)).toEqual(["civil"]);
    expect(sun.daylightMs).toBe(0);
    expect(sun.rising).toBe(false); // sun sinking towards the polar night
  });

  test("Poznań: rising in the morning, sinking in the afternoon", () => {
    expect(sunInfo(new Date("2026-11-01T06:00:00+01:00"), POZNAN).rising).toBe(true);
    expect(sunInfo(NOW, POZNAN).rising).toBe(false);
  });

  test("Poznań fixture has no all-day state", () => {
    expect(sunInfo(NOW, POZNAN).bands.length).toBeGreaterThan(1);
  });
});

describe("light kinds are continuous from one day to the next", () => {
  for (const place of [POLE, { ...POLE, id: "south", lat: -90 }, TROMSO]) {
    test(`${place.id}: 2026-09-01 … 2026-11-30`, () => {
      let prevLast: string | null = null;
      for (let d = 0; d < 91; d++) {
        const t = new Date(Date.UTC(2026, 8, 1 + d, 10));
        const segs = lightSegments(sunInfo(t, place), place.timeZone);
        if (prevLast !== null) expect(`${formatDate(t, place.timeZone)} ${segs[0]!.kind}`).toBe(`${formatDate(t, place.timeZone)} ${prevLast}`);
        prevLast = segs[segs.length - 1]!.kind;
      }
    });
  }

  test("North Pole 2026-10-09 is nautical twilight all day", () => {
    expect(sunInfo(new Date("2026-10-09T08:17:00Z"), POLE).bands.map((b) => b.kind)).toEqual(["nautical"]);
    expect(sunInfo(new Date("2026-10-09T08:17:00Z"), POLE).light).toBe("nautical");
  });
});

describe("edge cases", () => {
  test("polar night: no sunrise or sunset in Tromsø in December", () => {
    const sun = sunInfo(new Date("2026-12-21T12:00:00+01:00"), TROMSO);
    expect(sun.rise).toBeNull();
    expect(sun.set).toBeNull();
    expect(sun.daylightMs).toBe(0);
    expect(sun.polar).toBe("night");
  });

  test("midnight sun: Tromsø in June", () => {
    expect(sunInfo(new Date("2026-06-21T12:00:00+02:00"), TROMSO).polar).toBe("day");
  });

  test("Lisbon sunrise falls on the local date", () => {
    const sun = sunInfo(new Date("2026-11-01T12:00:00Z"), LISBON);
    expect(formatDate(sun.rise!, "Europe/Lisbon")).toBe(formatDate(new Date("2026-11-01T12:00:00Z"), "Europe/Lisbon"));
    expect(sun.rise!.getTime()).toBeLessThan(sun.set!.getTime());
  });

  test("25 h day in Warsaw: sunrise and sunset inside the zoned day", () => {
    const d = new Date("2026-10-25T12:00:00+01:00");
    const sun = sunInfo(d, POZNAN);
    const start = zonedDayStart(d, "Europe/Warsaw");
    const end = zonedDayEnd(d, "Europe/Warsaw");
    for (const e of [sun.rise, sun.set]) {
      expect(e).not.toBeNull();
      expect(e! >= start && e! < end).toBe(true);
    }
  });

  test("some day in a lunar month has no moonrise", () => {
    let missing = 0;
    for (let d = 1; d <= 30; d++) {
      const m = moonInfo(new Date(Date.UTC(2026, 10, d, 11)), POZNAN);
      if (m.rise === null) missing++;
    }
    expect(missing).toBeGreaterThanOrEqual(1);
  });
});

test("sunUpIntervals: Poznań 2026-11-01 is one interval from sunrise to sunset", () => {
  const P: Place = { id: "p", name: "P", lat: 52.4084, lon: 16.9342, timeZone: "Europe/Warsaw", source: "manual" };
  const day = new Date("2026-11-01T11:00:00Z");
  const sun = sunInfo(day, P);
  expect(sunUpIntervals(day, P)).toEqual([[sun.rise!, sun.set!]]);
});

describe("day events", () => {
  // The cases and the dial check are in day-events.test.ts; this one checks against the engine.
  test("Poznań: twilight moments are the engine's twilight events, then sunrise/sunset and the moon", () => {
    const sun = sunInfo(NOW, POZNAN);
    const moon = moonInfo(NOW, POZNAN);
    const tw = twilight(NOW, POZNAN);
    const ev = dayEvents(NOW, POZNAN, sun, moon);
    const want: [string, Date | null][] = [
      ["sun dawn astronomical", tw.astronomicalDawn], ["sun dawn nautical", tw.nauticalDawn], ["sun dawn civil", tw.civilDawn],
      ["sun rise", sun.rise], ["sun set", sun.set],
      ["sun dusk civil", tw.civilDusk], ["sun dusk nautical", tw.nauticalDusk], ["sun dusk astronomical", tw.astronomicalDusk],
      ["moon rise", moon.rise], ["moon set", moon.set],
    ];
    for (const [name, time] of want) {
      const e = ev.find((x) => `${x.body} ${x.kind}${x.twilight ? ` ${x.twilight}` : ""}` === name);
      expect(e, name).toBeDefined();
      expect(Math.abs(e!.time.getTime() - time!.getTime()), name).toBeLessThan(2000);
    }
    const transits = ev.filter((e) => e.kind === "transit");
    expect(transits.map((e) => e.body)).toEqual(["moon", "sun"]); // the moon is highest at 05:21
    const sunTransit = transits.find((e) => e.body === "sun")!;
    expect(Math.round(sunTransit.azimuth)).toBe(180);
    expect(formatTime(sunTransit.time, POZNAN.timeZone)).toBe("11:36");
    expect(ev).toHaveLength(want.length + 2);
    expect(ev.map((e) => e.time.getTime())).toEqual(ev.map((e) => e.time.getTime()).sort((a, b) => a - b));
    expect(Math.round(ev.find((e) => e.kind === "rise" && e.body === "sun")!.azimuth)).toBe(Math.round(sun.riseAzimuth!));
  });

  test("polar night: one row for the sun, at its highest, below the horizon", () => {
    const day = new Date("2026-12-21T11:00:00Z");
    const ev = dayEvents(day, TROMSO, sunInfo(day, TROMSO), moonInfo(day, TROMSO)).filter((e) => e.body === "sun");
    const down = ev.filter((e) => e.kind === "down");
    expect(down).toHaveLength(1);
    expect(Math.round(down[0]!.azimuth)).toBe(180);
    expect(ev.some((e) => e.kind === "rise" || e.kind === "set")).toBe(false);
    expect(ev.filter((e) => e.kind === "dawn")).toHaveLength(3);
  });

  test("polar day: the sun never sets", () => {
    const day = new Date("2026-06-21T11:00:00Z");
    const ev = dayEvents(day, TROMSO, sunInfo(day, TROMSO), moonInfo(day, TROMSO)).filter((e) => e.body === "sun");
    expect(ev.map((e) => e.kind)).toEqual(["up"]);
  });
});
