// Places and states shared by the tests.
import type { Place } from "./astro.ts";
import type { Lang } from "./i18n.ts";
import type { AppState, Direction } from "./state.ts";

export const place = (name: string, lat: number, lon: number, timeZone: string): Place =>
  ({ id: name, name, lat, lon, timeZone, source: "manual" });

export const POZNAN = place("Poznań", 52.4084, 16.9342, "Europe/Warsaw");
export const TROMSO = place("Tromsø", 69.6492, 18.9553, "Europe/Oslo");
export const LISBON = place("Lisbon", 38.7223, -9.1393, "Europe/Lisbon");
export const SYDNEY = place("Sydney", -33.8688, 151.2093, "Australia/Sydney");
export const NORTH_POLE = place("North Pole", 90, 0, "Europe/Warsaw");

// The main screen's state for a place and an instant (Poznań's reference moment: 2026-11-01 15:25).
export function mainState(
  p: Place, instant = new Date("2026-11-01T14:25:00Z"), direction: Direction = { azimuth: 200, tolerance: 5 }, lang: Lang = "pl",
): AppState & { place: Place } {
  return { instant, followNow: false, step: "hour", place: p, screen: "main", slide: 0, message: null, direction, lang };
}
