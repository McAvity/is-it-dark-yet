import { expect, test } from "bun:test";
import { position, sunInfo } from "./astro.ts";
import { sunDirectionWindows } from "./direction.ts";
import { formatTime } from "./format.ts";
import { Body } from "./vendor/astronomy.ts";
import { POZNAN, TROMSO } from "./test-fixtures.ts";
import { angleDiff } from "./angles.ts";

const DAY = new Date("2026-11-01T11:00:00Z");
const minutes = (t: Date) => t.getTime() / 60000;

test("azimuth 200 in Poznań: one window, exact at 12:53, about 21° up", () => {
  const w = sunDirectionWindows(DAY, POZNAN, 200, 0.5);
  expect(w.length).toBe(1);
  const exact = w[0]!.exact!;
  expect(exact).not.toBeNull();
  const ref = new Date("2026-11-01T11:53:00Z");
  expect(Math.abs(minutes(exact) - minutes(ref))).toBeLessThanOrEqual(1);
  expect(formatTime(exact, "Europe/Warsaw")).toMatch(/^12:5[345]$/);
  expect(Math.abs(w[0]!.exactAltitude! - 21)).toBeLessThanOrEqual(1);
  expect(w[0]!.from < exact && exact < w[0]!.to).toBe(true);
});

test("north in Poznań in November: no window", () => {
  expect(sunDirectionWindows(DAY, POZNAN, 0, 5)).toEqual([]);
});

test("azimuth 113 ±2: window starts at sunrise (upper limb, as in the rise/set rows)", () => {
  const w = sunDirectionWindows(DAY, POZNAN, 113, 2);
  expect(w.length).toBeGreaterThanOrEqual(1);
  const rise = sunInfo(DAY, POZNAN).rise!;
  expect(Math.abs(minutes(w[0]!.from) - minutes(rise))).toBeLessThanOrEqual(1);
  expect(formatTime(w[0]!.from, "Europe/Warsaw")).toBe(formatTime(rise, "Europe/Warsaw"));
  if (w[0]!.exact) expect(Math.abs(minutes(w[0]!.exact) - minutes(rise))).toBeLessThanOrEqual(10);
});

test("azimuth 247 ±2: window ends at sunset", () => {
  const w = sunDirectionWindows(DAY, POZNAN, 247, 2);
  const set = sunInfo(DAY, POZNAN).set!;
  expect(Math.abs(minutes(w.at(-1)!.to) - minutes(set))).toBeLessThanOrEqual(1);
});

test("wrap-around: azimuth 359 ±5 under the midnight sun in Tromsø", () => {
  const day = new Date("2026-06-21T10:00:00Z");
  const w = sunDirectionWindows(day, TROMSO, 359, 5);
  expect(w.length).toBeGreaterThanOrEqual(1);
  for (const win of w) {
    for (const t of [win.from, win.to, new Date((win.from.getTime() + win.to.getTime()) / 2)]) {
      const p = position(Body.Sun, t, TROMSO);
      expect(Math.abs(angleDiff(p.azimuth, 359))).toBeLessThanOrEqual(5.01);
      expect(p.altitude).toBeGreaterThan(-1);
    }
  }
});

test("normalises azimuth and clamps tolerance", () => {
  const a = sunDirectionWindows(DAY, POZNAN, 560, 0);
  const b = sunDirectionWindows(DAY, POZNAN, 200, 0.5);
  expect(a.map((x) => x.from.getTime())).toEqual(b.map((x) => x.from.getTime()));
  const wide = sunDirectionWindows(DAY, POZNAN, 200, 90);
  const w45 = sunDirectionWindows(DAY, POZNAN, 200, 45);
  expect(wide.map((x) => x.from.getTime())).toEqual(w45.map((x) => x.from.getTime()));
});

test("one call is fast", () => {
  sunDirectionWindows(DAY, POZNAN, 200, 5); // warm up
  const t0 = performance.now();
  sunDirectionWindows(DAY, POZNAN, 180, 5);
  expect(performance.now() - t0).toBeLessThan(200);
});
