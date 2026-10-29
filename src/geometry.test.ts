import { describe, expect, test } from "bun:test";
import { moonInfo, sunInfo, type MoonInfo, type Place, type SunInfo } from "./astro.ts";
import { Body } from "./vendor/astronomy.ts";
import { dialArc, dialPoint, horizonCenter, horizonX, horizonY, lightSegments, moonDiscPath, moonSegments, skyPath } from "./geometry.ts";
import { POZNAN, SYDNEY, TROMSO, place } from "./test-fixtures.ts";

const T = new Date("2026-11-01T14:25:00Z");

describe("dial", () => {
  test("dialPoint", () => {
    expect(dialPoint(12, 148)).toEqual([160, 12]);
    expect(dialPoint(6, 148)).toEqual([12, 160]);
    expect(dialPoint(0, 148)).toEqual([160, 308]);
  });
  test("dialArc flags and wrap", () => {
    expect(dialArc(6.8, 16.4, 118, 148)).toContain("A148,148 0 0 1");
    expect(dialArc(18.3, 4.9, 118, 148)).toContain("A148,148 0 0 1");
    expect(dialArc(1, 23, 118, 148)).toContain("A148,148 0 1 1");
    expect(dialArc(6.8, 16.4, 118, 148)).toMatch(/^M[\d.]+,[\d.]+ A148,148 0 0 1 [\d.]+,[\d.]+ L[\d.]+,[\d.]+ A118,118 0 0 0 [\d.]+,[\d.]+ Z$/);
  });
});

describe("segments", () => {
  test("Poznań light segments", () => {
    const segs = lightSegments(sunInfo(T, POZNAN), POZNAN.timeZone);
    expect(segs.map((s) => s.kind)).toEqual(["night", "astronomical", "nautical", "civil", "day", "civil", "nautical", "astronomical", "night"]);
    const day = segs.find((s) => s.kind === "day")!;
    expect(day.from).toBeCloseTo(6.81, 1);
    expect(day.to).toBeCloseTo(16.39, 1);
    expect(segs[0]!.from).toBe(0);
    expect(segs.at(-1)!.to).toBe(24);
  });
  test("Tromsø polar night", () => {
    const t = new Date("2026-12-21T11:00:00Z");
    const segs = lightSegments(sunInfo(t, TROMSO), TROMSO.timeZone);
    expect(segs.map((s) => s.kind)).toEqual(["night", "astronomical", "nautical", "civil", "nautical", "astronomical", "night"]);
    expect(segs[0]!.from).toBe(0);
    expect(segs.at(-1)!.to).toBe(24);
    expect(segs[3]!.from).toBeCloseTo(9.52, 1); // civil dawn 09:31
    expect(segs[3]!.to).toBeCloseTo(13.89, 1); // civil dusk 13:53
  });
  test("Poznań moon segments", () => {
    const segs = moonSegments(moonInfo(T, POZNAN), POZNAN.timeZone);
    expect(segs).toHaveLength(2);
    expect(segs[0]!.from).toBe(0);
    expect(segs[0]!.to).toBeCloseTo(13.63, 1);
    expect(segs[1]!.from).toBeCloseTo(22.2, 1);
    expect(segs[1]!.to).toBe(24);
  });
});

describe("horizon", () => {
  test("mapping", () => {
    expect(horizonX(180)).toBe(179);
    expect(horizonY(0)).toBe(120);
    expect(horizonY(90)).toBe(0);
    expect(horizonY(-90)).toBe(240);
  });
  test("skyPath wraps at north", () => {
    const d = skyPath(Body.Sun, T, POZNAN);
    expect(d.startsWith("M")).toBe(true);
    expect(d.match(/M/g)).toHaveLength(2);
  });
  test("centred on north: north is mid-chart, south at both edges", () => {
    expect(horizonX(0, 0)).toBe(179);
    expect(horizonX(270, 0)).toBe(89.5);
    expect(horizonX(90, 0)).toBe(268.5);
    expect(horizonX(180, 0)).toBe(0);
  });
  test("southern sun path is not cut when centred on north", () => {
    const d = skyPath(Body.Sun, T, SYDNEY, 0);
    expect(d.match(/M/g)).toHaveLength(2); // cut only at night, below the horizon (south)
  });
});


// The chart centre is where the sun stands highest that day: south (180) or north (0).
describe("horizonCenter", () => {
  const cases: [string, Place, string, 0 | 180][] = [
    ["Poznań, winter", POZNAN, "2026-11-01T12:00:00Z", 180],
    ["Poznań, summer", POZNAN, "2026-06-21T12:00:00Z", 180],
    ["Sydney", SYDNEY, "2026-11-01T02:00:00Z", 0],
    ["Sydney, June", SYDNEY, "2026-06-21T02:00:00Z", 0],
    ["Quito, June: sun north of the zenith", place("quito", -0.18, -78.47, "America/Guayaquil"), "2026-06-21T17:00:00Z", 0],
    ["Quito, December: sun south of the zenith", place("quito", -0.18, -78.47, "America/Guayaquil"), "2026-12-21T17:00:00Z", 180],
    ["Singapore, January", place("sg", 1.35, 103.82, "Asia/Singapore"), "2026-01-15T04:00:00Z", 180],
    ["Singapore, May", place("sg", 1.35, 103.82, "Asia/Singapore"), "2026-05-15T04:00:00Z", 0],
    ["Darwin, December: south of the tropic, sun north", place("darwin", -12.46, 130.84, "Australia/Darwin"), "2026-12-21T03:00:00Z", 180],
    ["Darwin, June", place("darwin", -12.46, 130.84, "Australia/Darwin"), "2026-06-21T03:00:00Z", 0],
    ["Kiribati, UTC+14", place("kiritimati", 1.87, -157.43, "Pacific/Kiritimati"), "2026-06-21T00:00:00Z", 0],
    ["North Pole, summer: fixed south", place("np", 90, 0, "Europe/Warsaw"), "2026-06-21T12:00:00Z", 180],
    ["North Pole, winter: fixed south", place("np", 90, 0, "Europe/Warsaw"), "2026-12-21T12:00:00Z", 180],
    ["South Pole, summer: fixed north", place("sp", -90, 0, "Antarctica/McMurdo"), "2026-12-21T12:00:00Z", 0],
    ["South Pole, winter: fixed north", place("sp", -90, 0, "Antarctica/McMurdo"), "2026-06-21T12:00:00Z", 0],
    ["Tromsø, polar night: still the meridian", TROMSO, "2026-12-21T12:00:00Z", 180],
  ];
  for (const [what, p, at, want] of cases) test(what, () => expect(horizonCenter(new Date(at), p)).toBe(want));
});

describe("moonDiscPath", () => {
  test("waning gibbous", () => {
    expect(moonDiscPath(0.53, 266.7, 60, 60, 54, false)).toBe("M60,6 A54,54 0 0 0 60,114 A3.2,54 0 0 0 60,6 Z");
    expect(moonDiscPath(0.53, 266.7, 60, 60, 54, true)).toBe("M60,6 A54,54 0 0 1 60,114 A3.2,54 0 0 1 60,6 Z");
  });
  test("other quadrants", () => {
    expect(moonDiscPath(0.8, 120, 60, 60, 54, false)).toBe("M60,6 A54,54 0 0 1 60,114 A32.4,54 0 0 1 60,6 Z");
    expect(moonDiscPath(0.2, 60, 60, 60, 54, false)).toBe("M60,6 A54,54 0 0 1 60,114 A32.4,54 0 0 0 60,6 Z");
    expect(moonDiscPath(0.2, 300, 60, 60, 54, false)).toBe("M60,6 A54,54 0 0 0 60,114 A32.4,54 0 0 1 60,6 Z");
  });
});

describe("full-day bands", () => {
  test("dialArc(0, 24) draws a full ring", () => {
    const d = dialArc(0, 24, 118, 148);
    expect(d.match(/A148,148/g)).toHaveLength(2);
    expect(d.match(/A118,118/g)).toHaveLength(2);
    expect(d).toContain("160,308");
  });
  test("a single all-day band gives one full-day segment", () => {
    const sun = sunInfo(new Date("2026-12-21T11:00:00Z"), TROMSO);
    const whole = (kind: SunInfo["light"]) => ({ ...sun, bands: [{ kind, from: new Date("2026-12-20T23:00:00Z"), to: new Date("2026-12-21T23:00:00Z") }] });
    expect(lightSegments(whole("day"), TROMSO.timeZone)).toEqual([{ kind: "day", from: 0, to: 24 }]);
    expect(lightSegments(whole("civil"), TROMSO.timeZone)).toEqual([{ kind: "civil", from: 0, to: 24 }]);
    const [seg] = lightSegments(whole("night"), TROMSO.timeZone);
    expect(dialArc(seg!.from, seg!.to, 118, 148).match(/A148,148/g)).toHaveLength(2);
  });
});

describe("DST fall-back day (Europe/Warsaw 2026-10-25)", () => {
  const day = new Date("2026-10-25T11:00:00Z");
  test("real day keeps order", () => {
    const segs = lightSegments(sunInfo(day, POZNAN), POZNAN.timeZone);
    expect(segs[0]!.from).toBe(0);
    expect(segs.at(-1)!.to).toBe(24);
    for (let i = 0; i < segs.length; i++) {
      expect(segs[i]!.to).toBeGreaterThan(segs[i]!.from);
      if (i > 0) expect(segs[i]!.from).toBe(segs[i - 1]!.to);
    }
    const m = moonSegments(moonInfo(day, POZNAN), POZNAN.timeZone);
    for (let i = 0; i < m.length; i++) {
      expect(m[i]!.to).toBeGreaterThan(m[i]!.from);
      if (i > 0) expect(m[i]!.from).toBeGreaterThanOrEqual(m[i - 1]!.to);
    }
  });
  test("events inside the repeated hour keep instant order", () => {
    const a = new Date("2026-10-25T00:30:00Z"); // 02:30 CEST
    const b = new Date("2026-10-25T01:10:00Z"); // 02:10 CET
    const start = new Date("2026-10-24T22:00:00Z");
    const end = new Date("2026-10-25T23:00:00Z");
    const sun = {
      bands: [
        { kind: "night", from: start, to: a },
        { kind: "civil", from: a, to: b },
        { kind: "night", from: b, to: end },
      ],
    } as unknown as SunInfo;
    const segs = lightSegments(sun, "Europe/Warsaw");
    expect(segs[0]!.from).toBe(0);
    expect(segs.at(-1)!.to).toBe(24);
    for (let i = 1; i < segs.length; i++) expect(segs[i]!.from).toBeGreaterThanOrEqual(segs[i - 1]!.to);
    expect(segs.find((s) => s.kind === "day")).toBeUndefined();

    const moon = { rise: a, set: b, upAtDayStart: false } as unknown as MoonInfo;
    // rise (02:30) then set (clamped to 02:30): zero-length, dropped.
    expect(moonSegments(moon, "Europe/Warsaw")).toEqual([]);
    const moon2 = { rise: b, set: a, upAtDayStart: true } as unknown as MoonInfo;
    const m2 = moonSegments(moon2, "Europe/Warsaw");
    // set (00:30Z) first, then rise (01:10Z, wall 02:10 clamped to 02:30): ascending, non-overlapping.
    expect(m2).toEqual([{ from: 0, to: 2.5 }, { from: 2.5, to: 24 }]);
  });
});
