import { describe, expect, test } from "bun:test";
import { moonInfo, position, riseSet } from "./astro.ts";
import { moonDistance, night, nightNoons, photoLight, reference, stretches, subtract, upcoming } from "./sky.ts";
import { Body, Observer, SearchAltitude } from "./vendor/astronomy.ts";
import { formatDate, formatTime } from "./format.ts";
import { place, TROMSO, SYDNEY } from "./test-fixtures.ts";

const WARSAW = place("Warszawa", 52.23, 21.01, "Europe/Warsaw");
const EVENING = new Date("2026-10-31T21:00:00+01:00");
const MIN = 60_000;
const near = (a: Date | number, b: Date | number, min = 1) =>
  expect(Math.abs(new Date(a).getTime() - new Date(b).getTime()) / MIN).toBeLessThanOrEqual(min);
const hm = (ms: number | Date) => formatTime(new Date(ms), "Europe/Warsaw");

describe("stretches", () => {
  test("finds a stretch shorter than the step", () => {
    const kind = (ms: number) => (ms < 1_000_000 ? "a" : ms < 1_200_000 ? "b" : "c");
    const out = stretches(0, 3_000_000, 600_000, kind).map((s) => s.kind);
    expect(out).toEqual(["a", "b", "c"]);
  });
});

describe("subtract", () => {
  test("cuts spans out", () => {
    expect(subtract([[0, 10], [20, 30]], [[5, 22]])).toEqual([[0, 5], [22, 30]]);
    expect(subtract([[0, 10]], [])).toEqual([[0, 10]]);
    expect(subtract([[0, 10]], [[0, 10]])).toEqual([]);
  });
});

describe("photo light, Warsaw 2026-10-31", () => {
  const list = photoLight(EVENING, WARSAW);

  test("blue then golden in the morning, golden then blue in the evening", () => {
    expect(list.map((p) => `${p.morning ? "am" : "pm"} ${p.kind}`)).toEqual(["am blue", "am golden", "pm golden", "pm blue"]);
  });

  test("boundaries sit at −6°, −4° and +6°", () => {
    const alt = (d: Date) => position(Body.Sun, d, WARSAW).altitude;
    const [b1, g1, g2, b2] = list;
    expect(alt(b1!.from)).toBeCloseTo(-6, 1);
    expect(alt(g1!.from)).toBeCloseTo(-4, 1);
    expect(alt(g1!.to)).toBeCloseTo(6, 1);
    expect(alt(g2!.from)).toBeCloseTo(6, 1);
    expect(alt(b2!.to)).toBeCloseTo(-6, 1);
    expect(`${hm(g2!.from)}–${hm(g2!.to)}`).toBe("15:20–16:35");
  });
});

describe("tonight", () => {
  test("in the morning it is the night that is ending", () => {
    const [a] = nightNoons(new Date("2026-11-01T02:00:00+01:00"), "Europe/Warsaw");
    expect(new Date(a).toISOString()).toBe("2026-10-31T11:00:00.000Z");
    const [b] = nightNoons(EVENING, "Europe/Warsaw");
    expect(b).toBe(a);
  });

  const n = night(EVENING, WARSAW);

  test("dark from astronomical dusk until moonrise", () => {
    expect(n.dark.length).toBe(1);
    const [from, to] = n.dark[0]!;
    const dusk = SearchAltitude(Body.Sun, new Observer(WARSAW.lat, WARSAW.lon, 0), -1, new Date("2026-10-31T12:00:00+01:00"), 1, -18)!;
    near(from, dusk.date);
    near(to, riseSet(Body.Moon, EVENING, WARSAW).rise!);
    expect(`${hm(from)}–${hm(to)}`).toBe("18:04–20:27");
  });

  test("the bar runs from sunset to sunrise", () => {
    expect(hm(n.from)).toBe(hm(riseSet(Body.Sun, EVENING, WARSAW).set!));
    expect(formatDate(n.to, "Europe/Warsaw")).toBe("2026-11-01");
  });

  test("planets in the dark sky, in the order they appear", () => {
    expect(n.planets.map((p) => p.name)).toEqual(["saturn", "mars", "jupiter", "venus"]);
    const venus = n.planets.find((p) => p.name === "venus")!;
    expect(venus.magnitude).toBeLessThan(-3.5);
    expect(venus.constellation).toBe("Virgo");
  });

  test("no astronomical night in a Tromsø summer", () => {
    const tromso = night(new Date("2026-06-21T23:00:00+02:00"), TROMSO);
    expect(tromso.night).toEqual([]);
    expect(tromso.dark).toEqual([]);
  });

  test("a full moon up all night leaves no dark window", () => {
    // Full moon 2026-11-24 15:54 CET: up from evening to morning.
    const full = night(new Date("2026-11-24T22:00:00+01:00"), WARSAW);
    expect(full.night.length).toBeGreaterThan(0);
    expect(full.dark).toEqual([]);
  });
});

describe("the Moon's distance", () => {
  test("now and the next apogee and perigee", () => {
    const d = moonDistance(EVENING);
    expect(Math.round(d.km / 1000)).toBe(369);
    expect(formatDate(d.apogee.time, "Europe/Warsaw")).toBe("2026-11-13");
    expect(formatDate(d.perigee.time, "Europe/Warsaw")).toBe("2026-11-25");
    expect(d.perigee.km).toBeLessThan(d.km);
    expect(d.apogee.km).toBeGreaterThan(d.km);
  });
});

describe("coming events from Warsaw", () => {
  const list = upcoming(EVENING, WARSAW);
  const day = (i: number) => formatDate(list[i]!.time, "Europe/Warsaw");

  test("soonest first", () => {
    expect(list.map((e) => e.kind)).toEqual(["elongation", "supermoon", "elongation", "lunarEclipse", "solarEclipse"]);
    expect([0, 1, 2, 3, 4].map(day)).toEqual(["2026-11-21", "2026-11-24", "2027-01-03", "2027-02-21", "2027-08-02"]);
  });

  test("details", () => {
    const solar = list[4]!;
    expect(solar.kind === "solarEclipse" && solar.type).toBe("partial");
    expect(solar.kind === "solarEclipse" && Math.round(solar.obscuration * 100)).toBe(30);
    const venus = list[2]!;
    expect(venus.kind === "elongation" && venus.body === "venus" && venus.morning).toBe(true);
  });

  test("a lunar eclipse is listed only when the Moon is up at its peak", () => {
    for (const e of upcoming(EVENING, SYDNEY)) {
      if (e.kind === "lunarEclipse") expect(position(Body.Moon, e.time, SYDNEY).altitude).toBeGreaterThan(0);
    }
  });
});

describe("reference values", () => {
  test("constellations and sidereal time", () => {
    const r = reference(EVENING, WARSAW);
    expect(r.sunConstellation).toBe("Libra");
    expect(r.moonConstellation).toBe("Gemini");
    expect(r.siderealHours).toBeGreaterThanOrEqual(0);
    expect(r.siderealHours).toBeLessThan(24);
    expect(Math.round(r.siderealHours * 60)).toBe(5); // 00:05
  });
});

test("moonInfo still agrees on the phase used by the supermoon search", () => {
  expect(moonInfo(new Date("2026-11-24T15:54:00+01:00"), WARSAW).phaseName).toBe("full");
});
