import { expect, test } from "bun:test";
import {
  formatTime, formatClock, formatDate, formatDateTime, formatDuration, formatRelative, formatDelta,
  formatAge, formatAltitude, formatAzimuth, compassName, formatCoords, formatOffset,
  offsetLabel, lightLabel,
} from "./format.ts";
import { messages } from "./i18n.ts";

const WAW = "Europe/Warsaw";
const MIN = 60000;

test("time and date in zone", () => {
  const t = new Date("2026-11-01T05:48:19Z");
  expect(formatTime(t, WAW)).toBe("06:48");
  expect(formatDate(t, WAW)).toBe("2026-11-01");
  expect(formatDateTime(new Date("2026-11-01T20:29:00Z"), WAW)).toBe("2026-11-01 21:29");
});

test("event times round to the nearest minute, clock truncates", () => {
  expect(formatTime(new Date("2026-11-01T05:48:40Z"), WAW)).toBe("06:49");
  expect(formatClock(new Date("2026-11-01T05:48:40Z"), WAW)).toBe("06:48");
  // 23:59:40 local rolls over to the next date
  expect(formatDateTime(new Date("2026-11-01T22:59:40Z"), WAW)).toBe("2026-11-02 00:00");
  expect(formatTime(new Date("2026-11-01T22:59:40Z"), WAW)).toBe("00:00");
});

test("durations", () => {
  expect(formatDuration(574.9 * MIN, "pl")).toBe("9 h 35 min");
  expect(formatDuration(58 * MIN, "pl")).toBe("58 min");
  expect(formatDuration(3 * 60 * MIN, "pl")).toBe("3 h");
  expect(formatDuration((51 * 60 + 20) * MIN, "pl")).toBe("2 d 3 h");
  expect(formatDuration(24 * 60 * MIN, "pl")).toBe("1 d");
  expect(formatDuration(0, "pl")).toBe("0 min");
});

test("relative", () => {
  expect(formatRelative(58 * MIN, "pl")).toBe("za 58 min");
  expect(formatRelative(-(8 * 60 + 37) * MIN, "pl")).toBe("8 h 37 min temu");
  expect(formatRelative(59000, "pl")).toBe("teraz");
  expect(formatRelative(-30000, "pl")).toBe("teraz");
});

test("age", () => {
  expect(formatAge(((21 * 24 + 22) * 60 + 34) * MIN, "pl")).toBe("21 d 22 h 34 min");
  expect(formatAge(5 * MIN, "pl")).toBe("0 d 0 h 5 min");
});

test("altitude and azimuth", () => {
  expect(formatAltitude(7.12, "pl")).toBe("7,1° nad horyzontem");
  expect(formatAltitude(-11.38, "pl")).toBe("11,4° pod horyzontem");
  expect(formatAzimuth(235.4)).toBe("235°");
  expect(formatAzimuth(359.6)).toBe("0°");
});

test("compass", () => {
  expect(compassName(0, "pl")).toBe("płn.");
  expect(compassName(359, "pl")).toBe("płn.");
  expect(compassName(45, "pl")).toBe("płn.-wsch.");
  expect(compassName(90, "pl")).toBe("wsch.");
  expect(compassName(135, "pl")).toBe("płd.-wsch.");
  expect(compassName(180, "pl")).toBe("płd.");
  expect(compassName(235.1, "pl")).toBe("płd.-zach.");
  expect(compassName(270, "pl")).toBe("zach.");
  expect(compassName(327.1, "pl")).toBe("płn.-zach.");
});

test("coords", () => {
  expect(formatCoords(52.4084, 16.9342, "pl")).toBe("52,4084° N, 16,9342° E");
  expect(formatCoords(-33.45, -70.66, "pl")).toBe("33,4500° S, 70,6600° W");
});

test("offsets", () => {
  expect(formatOffset(60)).toBe("UTC+1");
  expect(formatOffset(-480)).toBe("UTC−8");
  expect(formatOffset(330)).toBe("UTC+5:30");
  expect(formatOffset(0)).toBe("UTC+0");
  expect(formatOffset(-210)).toBe("UTC−3:30");
});

test("offset label", () => {
  expect(offsetLabel(WAW, new Date("2026-01-15T12:00:00Z"), "pl")).toBe("UTC+1, latem UTC+2");
  expect(offsetLabel(WAW, new Date("2026-07-15T12:00:00Z"), "pl")).toBe("UTC+2 (czas letni), zimą UTC+1");
  expect(offsetLabel("America/Santiago", new Date("2026-11-01T14:25:00Z"), "pl")).toBe("UTC−3 (czas letni), zimą UTC−4");
  expect(offsetLabel("Europe/Moscow", new Date("2026-11-01T14:25:00Z"), "pl")).toBe("UTC+3, bez zmiany czasu");
});

test("names and light", () => {
  expect(messages("pl").phases.waxingCrescent).toBe("przybywający sierp");
  expect(messages("pl").phases.full).toBe("pełnia");
  expect(messages("pl").quarters).toEqual(["Nów", "Pierwsza kwadra", "Pełnia", "Ostatnia kwadra"]);
  expect(lightLabel("day", true, "pl")).toBe("Dzień");
  expect(lightLabel("night", false, "pl")).toBe("Noc");
  expect(lightLabel("civil", true, "pl")).toBe("Świt cywilny");
  expect(lightLabel("civil", false, "pl")).toBe("Zmierzch cywilny");
  expect(lightLabel("nautical", true, "pl")).toBe("Świt żeglarski");
  expect(lightLabel("astronomical", false, "pl")).toBe("Zmierzch astronomiczny");
});

test("English: decimal point, relative times, compass", () => {
  expect(formatAltitude(7.12, "en")).toBe("7.1° above the horizon");
  expect(formatAltitude(-11.38, "en")).toBe("11.4° below the horizon");
  expect(formatRelative(58 * MIN, "en")).toBe("in 58 min");
  expect(formatRelative(-(8 * 60 + 37) * MIN, "en")).toBe("8 h 37 min ago");
  expect(formatRelative(0, "en")).toBe("now");
  expect(formatCoords(52.4084, 16.9342, "en")).toBe("52.4084° N, 16.9342° E");
  expect(compassName(225, "en")).toBe("SW");
});

test("German durations and relative times", () => {
  expect(formatRelative(-(8 * 60 + 37) * MIN, "de")).toBe("vor 8 Std. 37 Min.");
  expect(formatRelative(58 * MIN, "de")).toBe("in 58 Min.");
  expect(formatDuration((51 * 60 + 20) * MIN, "de")).toBe("2 T. 3 Std.");
  expect(formatAltitude(7.12, "de")).toBe("7,1° über dem Horizont");
  expect(compassName(90, "de")).toBe("O");
  expect(formatCoords(-33.45, -70.66, "de")).toBe("33,4500° S, 70,6600° W");
});

test("French compass, relative times and altitude", () => {
  expect(compassName(225, "fr")).toBe("SO");
  expect(compassName(270, "fr")).toBe("O");
  expect(formatRelative(-(8 * 60 + 37) * MIN, "fr")).toBe("il y a 8 h 37 min");
  expect(formatRelative(58 * MIN, "fr")).toBe("dans 58 min");
  expect(formatAltitude(7.12, "fr")).toBe("7,1° au-dessus de l'horizon");
  expect(formatAge(((21 * 24 + 22) * 60 + 34) * MIN, "fr")).toBe("21 j 22 h 34 min");
  expect(formatCoords(-33.45, -70.66, "fr")).toBe("33,4500° S, 70,6600° O");
});

test("offset labels in en/fr/de", () => {
  const winter = new Date("2026-01-15T12:00:00Z");
  const summer = new Date("2026-07-15T12:00:00Z");
  const now = new Date("2026-11-01T14:25:00Z");
  const LIS = "Europe/Lisbon";
  expect(offsetLabel(LIS, winter, "en")).toBe("UTC+0, summer UTC+1");
  expect(offsetLabel(LIS, summer, "en")).toBe("UTC+1 (summer time), winter UTC+0");
  expect(offsetLabel("Europe/Moscow", now, "en")).toBe("UTC+3, no DST");
  expect(offsetLabel(LIS, winter, "fr")).toBe("UTC+0, en été UTC+1");
  expect(offsetLabel(LIS, summer, "fr")).toBe("UTC+1 (heure d'été), en hiver UTC+0");
  expect(offsetLabel("Europe/Moscow", now, "fr")).toBe("UTC+3, sans changement d'heure");
  expect(offsetLabel(LIS, winter, "de")).toBe("UTC+0, im Sommer UTC+1");
  expect(offsetLabel(LIS, summer, "de")).toBe("UTC+1 (Sommerzeit), im Winter UTC+0");
  expect(offsetLabel("Europe/Moscow", now, "de")).toBe("UTC+3, keine Zeitumstellung");
});

test("light labels in other languages", () => {
  expect(lightLabel("civil", true, "en")).toBe("Civil dawn");
  expect(lightLabel("astronomical", false, "en")).toBe("Astronomical dusk");
  expect(lightLabel("nautical", false, "fr")).toBe("Crépuscule nautique");
  expect(lightLabel("civil", true, "fr")).toBe("Aube civile");
  expect(lightLabel("civil", false, "de")).toBe("Bürgerl. Abenddämmerung");
  expect(lightLabel("day", true, "de")).toBe("Tag");
});

test("formatDelta: sign, minutes and seconds, no seconds past an hour", () => {
  expect(formatDelta(-(3 * 60 + 35) * 1000, "pl")).toBe("Δ −3 min 35 s");
  expect(formatDelta(58_400, "pl")).toBe("Δ +58 s");
  expect(formatDelta(120_000, "pl")).toBe("Δ +2 min");
  expect(formatDelta(-(18 * 3600 + 44 * 60 + 10) * 1000, "pl")).toBe("Δ −18 h 44 min");
  expect(formatDelta((2 * 3600 + 59 * 60 + 50) * 1000, "pl")).toBe("Δ +3 h");
  expect(formatDelta(300, "pl")).toBe("Δ 0 s");
  expect(formatDelta(-(3 * 60 + 35) * 1000, "de")).toBe("Δ −3 Min. 35 Sek.");
});
