// Place storage, search and GPS. No user-visible text here: errors are ErrorCode values the views translate.
import type { Place } from "./astro.ts";
import type { ErrorCode, Lang } from "./i18n.ts";
import { MINUTE_MS, deviceTimeZone } from "./time.ts";

export type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

// A store that lasts as long as the page (fallback when localStorage is blocked; tests).
export function memoryStore(init: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(init));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const FAV_KEY = "clock.favorites.v1";
const SEL_KEY = "clock.selected.v1";

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function timeZoneList(): string[] {
  return Intl.supportedValuesOf("timeZone");
}

function validPlace(p: unknown): p is Place {
  if (typeof p !== "object" || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.lat === "number" && Number.isFinite(o.lat) &&
    typeof o.lon === "number" && Number.isFinite(o.lon) &&
    typeof o.timeZone === "string" && isValidTimeZone(o.timeZone) &&
    typeof o.id === "string" && typeof o.name === "string" &&
    (o.source === "gps" || o.source === "search" || o.source === "manual")
  );
}

// Storage never throws here: blocked storage reads as empty, a write to blocked or full storage is dropped.
export function readItem(store: KeyValueStore, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

export function writeItem(store: KeyValueStore, key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch {
    // storage unavailable or full: ignore
  }
}

// Parsed JSON, or null when missing or corrupt.
export function readJson(store: KeyValueStore, key: string): unknown {
  const raw = readItem(store, key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const r4 = (n: number) => Math.round(n * 1e4);
// Same spot: coordinates equal to 4 decimals and the same zone.
export const samePlace = (a: Place, b: Place) =>
  r4(a.lat) === r4(b.lat) && r4(a.lon) === r4(b.lon) && a.timeZone === b.timeZone;

// crypto.randomUUID exists only in secure contexts (HTTPS, localhost); getRandomValues works over plain HTTP too.
function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export class Favorites {
  constructor(private store: KeyValueStore) {}

  list(): Place[] {
    const data = readJson(this.store, FAV_KEY);
    return Array.isArray(data) ? data.filter(validPlace) : [];
  }

  private save(items: Place[]): void {
    writeItem(this.store, FAV_KEY, JSON.stringify(items));
  }

  // A place without a name is stored with name ""; views show a default name in the UI language.
  add(p: Place): Place {
    const items = this.list();
    const existing = items.find((f) => samePlace(f, p));
    if (existing) return existing;
    const added: Place = { ...p, id: newId(), name: p.name.trim() };
    this.save([...items, added]);
    return added;
  }

  rename(id: string, name: string): void {
    const trimmed = name.trim();
    const items = this.list();
    const item = items.find((f) => f.id === id);
    if (!item) return;
    if (trimmed) item.name = trimmed;
    this.save(items);
  }

  remove(id: string): void {
    this.save(this.list().filter((f) => f.id !== id));
  }
}

export function loadSelected(store: KeyValueStore): Place | null {
  const data = readJson(store, SEL_KEY);
  return validPlace(data) ? data : null;
}

export function saveSelected(store: KeyValueStore, p: Place): void {
  writeItem(store, SEL_KEY, JSON.stringify(p));
}

// The coordinate, or the error code when it is not a number in range.
export function parseCoordinate(text: string, kind: "lat" | "lon"): number | ErrorCode {
  const max = kind === "lat" ? 90 : 180;
  const t = text.trim().replace(",", ".");
  const n = t === "" ? NaN : Number(t);
  if (!Number.isFinite(n) || Math.abs(n) > max) return kind === "lat" ? "lat-range" : "lon-range";
  return n;
}

// Rejections carry an ErrorCode as the message.
const fail = (code: ErrorCode) => new Error(code);

// Shorter queries are not searched.
export const MIN_QUERY = 2;

interface GeoResult {
  name?: unknown; country?: unknown; latitude?: unknown; longitude?: unknown; timezone?: unknown;
}

// Only what search needs from fetch, so tests can pass a plain function.
export type FetchFn = (url: string) => Promise<Response>;

// Rejects with Error("search-failed"). lang: language of the returned names and countries.
export async function searchPlaces(query: string, fetchFn: FetchFn, lang: Lang): Promise<Place[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=${lang}&format=json`;
  let body: { results?: GeoResult[] };
  try {
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    body = await res.json();
  } catch {
    throw fail("search-failed");
  }
  const places: Place[] = [];
  for (const r of Array.isArray(body?.results) ? body.results : []) {
    if (
      typeof r.name !== "string" || typeof r.latitude !== "number" ||
      typeof r.longitude !== "number" || typeof r.timezone !== "string" ||
      !isValidTimeZone(r.timezone)
    ) continue;
    const p: Place = {
      id: `search:${r.latitude},${r.longitude}`,
      name: r.name,
      lat: r.latitude,
      lon: r.longitude,
      timeZone: r.timezone,
      source: "search",
    };
    if (typeof r.country === "string") p.country = r.country;
    places.push(p);
  }
  return places;
}

// Resolves with an unnamed place (name ""). Rejects with Error("gps-denied") or Error("gps-failed").
export function gpsPlace(geo: Geolocation): Promise<Place> {
  return new Promise((resolve, reject) => {
    geo.getCurrentPosition(
      (pos) =>
        resolve({
          id: "gps",
          name: "",
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          timeZone: deviceTimeZone(),
          source: "gps",
          accuracyM: Math.round(pos.coords.accuracy),
        }),
      (err) => reject(fail(err.code === 1 ? "gps-denied" : "gps-failed")),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: MINUTE_MS },
    );
  });
}
