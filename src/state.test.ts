import { describe, expect, test } from "bun:test";
import { DEFAULT_DIRECTION, arrowStep, loadDirection, loadLang, saveDirection, saveLang, shouldTick, type AppState } from "./state.ts";
import { memoryStore } from "./places.ts";

const base: AppState = {
  instant: new Date("2026-11-01T14:25:00Z"), followNow: true, step: "hour",
  place: null, screen: "main", slide: 0, message: null, direction: { azimuth: 180, tolerance: 5 }, lang: "pl",
};

test("ticks when following now on the main screen", () => {
  expect(shouldTick(base, false, false)).toBe(true);
});

test("skips while a form control has focus", () => {
  expect(shouldTick(base, true, false)).toBe(false);
});

test("skips while the carousel scrolls", () => {
  expect(shouldTick(base, false, true)).toBe(false);
});

test("skips when not following now or not on main", () => {
  expect(shouldTick({ ...base, followNow: false }, false, false)).toBe(false);
  expect(shouldTick({ ...base, screen: "location" }, false, false)).toBe(false);
});

describe("direction storage", () => {
  const store = (v: string | null) => memoryStore(v === null ? {} : { "clock.direction.v1": v });

  test("missing or corrupt value gives the default", () => {
    for (const v of [null, "{", "null", "[]", '{"azimuth":"a","tolerance":5}', '{"azimuth":10,"tolerance":7}', '{"azimuth":400,"tolerance":5}']) {
      expect(loadDirection(store(v))).toEqual(DEFAULT_DIRECTION);
    }
    expect(DEFAULT_DIRECTION).toEqual({ azimuth: 180, tolerance: 5 });
  });

  test("saves and loads", () => {
    const s = store(null);
    saveDirection(s, { azimuth: 200, tolerance: 10 });
    expect(JSON.parse(s.data.get("clock.direction.v1")!)).toEqual({ azimuth: 200, tolerance: 10 });
    expect(loadDirection(s)).toEqual({ azimuth: 200, tolerance: 10 });
  });

  test("a throwing store gives the default and save does not throw", () => {
    const bad = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(loadDirection(bad)).toEqual(DEFAULT_DIRECTION);
    expect(() => saveDirection(bad, DEFAULT_DIRECTION)).not.toThrow();
  });
});

describe("language storage", () => {
  const store = (v: string | null) => memoryStore(v === null ? {} : { "clock.lang.v1": v });

  test("missing or corrupt value gives the detected language", () => {
    for (const v of [null, "", "xx", "toString", "PL", '"de"', "{", "null"]) {
      expect(loadLang(store(v), ["fr-CA", "en"])).toBe("fr");
      expect(loadLang(store(v), ["es"])).toBe("en");
    }
  });

  test("saves and loads", () => {
    const s = store(null);
    saveLang(s, "de");
    expect(s.data.get("clock.lang.v1")).toBe("de");
    expect(loadLang(s, ["pl"])).toBe("de");
  });

  test("a throwing store gives the detected language and save does not throw", () => {
    const bad = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(loadLang(bad, ["pl-PL"])).toBe("pl");
    expect(() => saveLang(bad, "en")).not.toThrow();
  });
});

describe("arrowStep", () => {
  test("right and up step forward, left and down back", () => {
    expect(arrowStep("ArrowRight", false, false)).toBe(1);
    expect(arrowStep("ArrowUp", false, false)).toBe(1);
    expect(arrowStep("ArrowLeft", false, false)).toBe(-1);
    expect(arrowStep("ArrowDown", false, false)).toBe(-1);
  });
  test("other keys, modifiers and focused form controls do nothing", () => {
    expect(arrowStep("Enter", false, false)).toBe(null);
    expect(arrowStep("ArrowRight", true, false)).toBe(null);
    expect(arrowStep("ArrowLeft", false, true)).toBe(null);
  });
});
