import type { Place } from "./astro.ts";
import { detectLang, isLang, type ErrorCode, type Lang } from "./i18n.ts";
import { readItem, readJson, writeItem, type KeyValueStore } from "./places.ts";
import type { Step } from "./time.ts";

export interface AppState {
  instant: Date;
  followNow: boolean; // keep instant at the current time
  step: Step;
  place: Place | null;
  screen: "main" | "location";
  slide: 0 | 1; // carousel: 0 dial, 1 horizon
  message: ErrorCode | null; // shown when there is no place
  direction: Direction; // "When is the Sun at this bearing…"
  lang: Lang;
}

// URL hash of the location screen.
export const LOCATION_HASH = "#location";
export const screenFromHash = (hash: string): AppState["screen"] => (hash === LOCATION_HASH ? "location" : "main");

// Whether the 30 s timer should move to the current time and re-render.
// Skipped while the user edits a form control or swipes, so focus and input are kept.
export function shouldTick(state: AppState, formControlFocused: boolean, scrolling: boolean): boolean {
  return state.followNow && state.screen === "main" && !formControlFocused && !scrolling;
}

// Arrow keys on the main screen move the time by the chosen step: right/up forward, left/down back.
// Not while a form control has focus (arrows edit it) or with a modifier (browser shortcuts).
export function arrowStep(key: string, modifier: boolean, formControlFocused: boolean): 1 | -1 | null {
  if (modifier || formControlFocused) return null;
  if (key === "ArrowRight" || key === "ArrowUp") return 1;
  if (key === "ArrowLeft" || key === "ArrowDown") return -1;
  return null;
}

export interface Direction {
  azimuth: number; // 0..359
  tolerance: Tolerance;
}

export const TOLERANCES = [2, 5, 10, 20] as const;
export type Tolerance = (typeof TOLERANCES)[number];
export const isTolerance = (v: unknown): v is Tolerance => (TOLERANCES as readonly unknown[]).includes(v);
export const DEFAULT_DIRECTION: Direction = { azimuth: 180, tolerance: 5 };
const DIR_KEY = "clock.direction.v1";

export function loadDirection(store: KeyValueStore): Direction {
  const data = readJson(store, DIR_KEY);
  if (typeof data !== "object" || data === null) return { ...DEFAULT_DIRECTION };
  const { azimuth, tolerance } = data as Record<string, unknown>;
  if (typeof azimuth === "number" && Number.isInteger(azimuth) && azimuth >= 0 && azimuth <= 359 && isTolerance(tolerance)) {
    return { azimuth, tolerance };
  }
  return { ...DEFAULT_DIRECTION };
}

export function saveDirection(store: KeyValueStore, d: Direction): void {
  writeItem(store, DIR_KEY, JSON.stringify({ azimuth: d.azimuth, tolerance: d.tolerance }));
}

const LANG_KEY = "clock.lang.v1";

// Stored language, or the browser's when nothing valid is stored.
export function loadLang(store: KeyValueStore, navigatorLanguages: readonly string[]): Lang {
  const v = readItem(store, LANG_KEY);
  return isLang(v) ? v : detectLang(navigatorLanguages);
}

export function saveLang(store: KeyValueStore, lang: Lang): void {
  writeItem(store, LANG_KEY, lang);
}
