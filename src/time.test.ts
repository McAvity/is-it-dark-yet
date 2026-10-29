import { expect, test } from "bun:test";
import {
  addStep, deviceTimeZone, fromZoned, offsetMinutes, yearOffsets,
  zonedDayEnd, zonedDayStart, zonedHours, zonedParts,
} from "./time.ts";

const W = "Europe/Warsaw";
const dayLen = (y: number, m: number, d: number, tz: string) => {
  const t = fromZoned(y, m, d, 12, 0, tz);
  return (zonedDayEnd(t, tz).getTime() - zonedDayStart(t, tz).getTime()) / 3.6e6;
};

test("zonedParts", () => {
  expect(zonedParts(new Date("2026-11-01T14:25:00Z"), W)).toMatchObject({
    year: 2026, month: 11, day: 1, hour: 15, minute: 25,
  });
});

test("offsetMinutes", () => {
  expect(offsetMinutes(new Date("2026-01-15T12:00:00Z"), W)).toBe(60);
  expect(offsetMinutes(new Date("2026-07-15T12:00:00Z"), W)).toBe(120);
});

test("fromZoned basic", () => {
  expect(fromZoned(2026, 11, 1, 15, 25, W).toISOString()).toBe("2026-11-01T14:25:00.000Z");
  expect(fromZoned(2026, 11, 1, 15, 25, "Europe/Lisbon").toISOString()).toBe("2026-11-01T15:25:00.000Z");
  expect(fromZoned(2026, 1, 1, 12, 0, "Asia/Kolkata").toISOString()).toBe("2026-01-01T06:30:00.000Z");
});

test("fromZoned gap and overlap", () => {
  expect(fromZoned(2026, 3, 29, 2, 30, W).toISOString()).toBe("2026-03-29T01:30:00.000Z");
  expect(fromZoned(2026, 10, 25, 2, 30, W).toISOString()).toBe("2026-10-25T00:30:00.000Z");
});

test("day length", () => {
  expect(dayLen(2026, 3, 29, W)).toBe(23);
  expect(dayLen(2026, 10, 25, W)).toBe(25);
  expect(dayLen(2026, 11, 1, W)).toBe(24);
  expect(dayLen(2026, 4, 5, "Australia/Sydney")).toBe(25);
  expect(dayLen(2026, 10, 4, "Australia/Sydney")).toBe(23);
  expect(dayLen(2026, 11, 1, "America/Los_Angeles")).toBe(25);
});

test("addStep", () => {
  const t = fromZoned(2026, 10, 24, 15, 25, W);
  const n = zonedParts(addStep(t, "day", 1, W), W);
  expect(n).toMatchObject({ day: 25, hour: 15, minute: 25 });
  const before = fromZoned(2026, 10, 25, 1, 30, W);
  expect(addStep(before, "hour", 1, W).getTime() - before.getTime()).toBe(3600000);
  expect(addStep(before, "min", -1, W).getTime() - before.getTime()).toBe(-60000);
  expect(zonedParts(addStep(fromZoned(2026, 3, 31, 12, 0, W), "month", -1, W), W))
    .toMatchObject({ year: 2026, month: 2, day: 28, hour: 12, minute: 0 });
  expect(zonedParts(addStep(fromZoned(2026, 12, 15, 12, 0, W), "month", 1, W), W))
    .toMatchObject({ year: 2027, month: 1, day: 15 });
  expect(zonedParts(addStep(fromZoned(2026, 11, 1, 15, 25, W), "year", 1, W), W))
    .toMatchObject({ year: 2027, month: 11, day: 1, hour: 15, minute: 25 });
  expect(zonedParts(addStep(fromZoned(2028, 2, 29, 12, 0, W), "year", -1, W), W))
    .toMatchObject({ year: 2027, month: 2, day: 28, hour: 12 });
});

test("yearOffsets", () => {
  expect(yearOffsets("Europe/Lisbon", 2026)).toEqual({ min: 0, max: 60 });
  expect(yearOffsets("Asia/Kolkata", 2026)).toEqual({ min: 330, max: 330 });
  expect(yearOffsets("America/Santiago", 2026)).toEqual({ min: -240, max: -180 });
});

test("zonedHours", () => {
  expect(zonedHours(new Date("2026-11-01T14:25:00Z"), W)).toBeCloseTo(15.4167, 3);
});

test("deviceTimeZone", () => {
  expect(deviceTimeZone().length).toBeGreaterThan(0);
});
