// Formatting helpers. All times are shown in the given IANA zone; text follows `lang` (Polish by default).
// Dates stay yyyy-mm-dd and times 24 h HH:MM in every language.
import type { LightState } from "./astro.ts";
import { messages, type Lang } from "./i18n.ts";
import { norm360 } from "./angles.ts";
import { MINUTE_MS, offsetMinutes, yearOffsets, zonedParts } from "./time.ts";

const pad = (n: number) => String(n).padStart(2, "0");
// Fixed decimals with the language's decimal separator.
export const formatNumber = (n: number, digits: number, lang: Lang) =>
  n.toFixed(digits).replace(".", messages(lang).decimal);

const roundToMinute = (t: Date): Date => new Date(Math.round(t.getTime() / MINUTE_MS) * MINUTE_MS);

// Clock reading truncated to the minute (what an <input type=time> holds).
export function formatClock(t: Date, tz: string): string {
  const p = zonedParts(t, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

// Event time rounded to the nearest minute.
export function formatTime(t: Date, tz: string): string {
  return formatClock(roundToMinute(t), tz);
}

export function formatDate(t: Date, tz: string): string {
  const p = zonedParts(t, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function formatDateTime(t: Date, tz: string): string {
  const r = roundToMinute(t);
  return `${formatDate(r, tz)} ${formatClock(r, tz)}`;
}

// Splits a duration, rounded to whole minutes, into d/h/min.
function split(ms: number) {
  const total = Math.round(Math.abs(ms) / MINUTE_MS);
  return { d: Math.floor(total / 1440), h: Math.floor(total / 60) % 24, min: total % 60 };
}

export function formatDuration(ms: number, lang: Lang): string {
  const u = messages(lang).units;
  const { d, h, min } = split(ms);
  const parts: string[] = [];
  if (d > 0) {
    parts.push(`${d} ${u.d}`);
    if (h > 0) parts.push(`${h} ${u.h}`);
  } else {
    if (h > 0) parts.push(`${h} ${u.h}`);
    if (min > 0) parts.push(`${min} ${u.min}`);
  }
  return parts.length ? parts.join(" ") : `0 ${u.min}`;
}

// Change in day length: "Δ −3 min 35 s", "Δ +58 s", "Δ −18 h 44 min" (no seconds past an hour), "Δ 0 s".
export function formatDelta(ms: number, lang: Lang): string {
  const u = messages(lang).units;
  const total = Math.round(Math.abs(ms) / 1000);
  const sign = total === 0 ? "" : ms < 0 ? "−" : "+";
  const h = Math.floor(total / 3600);
  const min = Math.floor(total / 60) % 60;
  const s = total % 60;
  const parts: string[] = [];
  if (h > 0) {
    const m = Math.round((total - h * 3600) / 60);
    parts.push(`${m === 60 ? h + 1 : h} ${u.h}`);
    if (m > 0 && m < 60) parts.push(`${m} ${u.min}`);
  } else {
    if (min > 0) parts.push(`${min} ${u.min}`);
    if (s > 0 || min === 0) parts.push(`${s} ${u.s}`);
  }
  return `Δ ${sign}${parts.join(" ")}`;
}

export function formatRelative(ms: number, lang: Lang): string {
  const m = messages(lang);
  if (Math.abs(ms) < MINUTE_MS) return m.now;
  return ms > 0 ? m.inTime(formatDuration(ms, lang)) : m.ago(formatDuration(ms, lang));
}

export function formatAge(ms: number, lang: Lang): string {
  const u = messages(lang).units;
  const { d, h, min } = split(ms);
  return `${d} ${u.d} ${h} ${u.h} ${min} ${u.min}`;
}

export function formatAltitude(deg: number, lang: Lang): string {
  return messages(lang).altitude(formatNumber(Math.abs(deg), 1, lang), deg < 0);
}

export function formatAzimuth(deg: number): string {
  return `${Math.round(deg) % 360}°`;
}

export function compassName(deg: number, lang: Lang): string {
  return messages(lang).compass[Math.floor(norm360(deg + 22.5) / 45)]!;
}

export function formatCoords(lat: number, lon: number, lang: Lang): string {
  const h = messages(lang).hemispheres;
  const n = (x: number) => formatNumber(Math.abs(x), 4, lang);
  return `${n(lat)}° ${lat < 0 ? h.s : h.n}, ${n(lon)}° ${lon < 0 ? h.w : h.e}`;
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "−" : "+";
  const a = Math.abs(minutes);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `UTC${sign}${h}${m ? ":" + pad(m) : ""}`;
}

export function offsetLabel(tz: string, at: Date, lang: Lang): string {
  const o = messages(lang).offset;
  const { min, max } = yearOffsets(tz, zonedParts(at, tz).year);
  const cur = offsetMinutes(at, tz);
  if (min === max) return o.fixed(formatOffset(cur));
  if (cur === max) return o.summerNow(formatOffset(cur), formatOffset(min));
  return o.winterNow(formatOffset(cur), formatOffset(max));
}

// Twilight is dawn while the sun climbs and dusk while it sinks (works at the poles too).
export function lightLabel(state: LightState, sunRising: boolean, lang: Lang): string {
  const l = messages(lang).light;
  if (state === "day") return l.day;
  if (state === "night") return l.night;
  return (sunRising ? l.dawn : l.dusk)[state];
}
