import { expect, test } from "bun:test";
import {
  Favorites, gpsPlace, memoryStore, isValidTimeZone, loadSelected, parseCoordinate,
  saveSelected, searchPlaces, timeZoneList,
} from "./places.ts";
import { deviceTimeZone } from "./time.ts";
import type { Place } from "./astro.ts";

const poznan: Place = {
  id: "x", name: " Poznań ", lat: 52.4084, lon: 16.9342, timeZone: "Europe/Warsaw", source: "manual",
};

test("favorites add/dedupe/rename/remove", () => {
  const s = memoryStore();
  const f = new Favorites(s);
  const a = f.add(poznan);
  expect(a.name).toBe("Poznań");
  expect(a.id).not.toBe("x");
  expect(f.list()).toHaveLength(1);
  expect(f.add({ ...poznan, lat: 52.40841 })).toEqual(a);
  expect(f.list()).toHaveLength(1);
  f.rename(a.id, " Dom ");
  expect(new Favorites(s).list()[0]!.name).toBe("Dom");
  f.rename(a.id, "  ");
  expect(f.list()[0]!.name).toBe("Dom");
  f.rename("nope", "x");
  f.remove(a.id);
  expect(f.list()).toEqual([]);
});

test("favorites empty name and corrupt data", () => {
  // No name is stored empty; views show the default name in the UI language.
  expect(new Favorites(memoryStore()).add({ ...poznan, name: " " }).name).toBe("");
  expect(new Favorites(memoryStore({ "clock.favorites.v1": "{not json" })).list()).toEqual([]);
  expect(new Favorites(memoryStore({ "clock.favorites.v1": '{"a":1}' })).list()).toEqual([]);
  const mixed = JSON.stringify([poznan, { ...poznan, timeZone: "Mars/X" }, { lat: "a" }, null]);
  expect(new Favorites(memoryStore({ "clock.favorites.v1": mixed })).list()).toHaveLength(1);
});

test("stored places with bad id, name or source are ignored", () => {
  const good = { id: "x", name: "A", lat: 52, lon: 17, timeZone: "Europe/Warsaw", source: "manual" };
  const list = (o: object) => new Favorites(memoryStore({ "clock.favorites.v1": JSON.stringify([o]) })).list();
  expect(list(good)).toHaveLength(1);
  expect(list({ ...good, name: 5 })).toEqual([]);
  expect(list({ ...good, id: 7 })).toEqual([]);
  expect(list({ ...good, source: "bogus" })).toEqual([]);
  expect(loadSelected(memoryStore({ "clock.selected.v1": JSON.stringify({ ...good, name: 5 }) }))).toBeNull();
});

test("selected", () => {
  const s = memoryStore();
  expect(loadSelected(s)).toBeNull();
  saveSelected(s, poznan);
  expect(loadSelected(s)).toEqual(poznan);
  expect(loadSelected(memoryStore({ "clock.selected.v1": "{bad" }))).toBeNull();
  expect(loadSelected(memoryStore({ "clock.selected.v1": "5" }))).toBeNull();
  expect(loadSelected(memoryStore({ "clock.selected.v1": "null" }))).toBeNull();
});

test("parseCoordinate", () => {
  expect(parseCoordinate("52,4084", "lat")).toBe(52.4084);
  expect(parseCoordinate("52.4084", "lat")).toBe(52.4084);
  expect(parseCoordinate("91", "lat")).toBe("lat-range");
  expect(parseCoordinate("abc", "lat")).toBe("lat-range");
  expect(parseCoordinate("-122.4194", "lon")).toBe(-122.4194);
  expect(parseCoordinate("181", "lon")).toBe("lon-range");
  expect(parseCoordinate("", "lon")).toBe("lon-range");
});

test("time zones", () => {
  expect(isValidTimeZone("Europe/Warsaw")).toBe(true);
  expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  expect(timeZoneList()).toContain("Europe/Warsaw");
});

const ERR = "search-failed";
const jsonRes = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as unknown as Response;

test("searchPlaces", async () => {
  let calls: string[] = [];
  const fake = (body: unknown, ok = true) =>
    async (u: string) => { calls.push(u); return jsonRes(body, ok); };
  expect(await searchPlaces(" S ", fake({}), "pl")).toEqual([]);
  expect(calls).toHaveLength(0);

  const sf = { name: "San Francisco", country: "Stany Zjednoczone", latitude: 37.7749, longitude: -122.4194, timezone: "America/Los_Angeles" };
  const r = await searchPlaces("San", fake({ results: [sf, { ...sf, timezone: "Mars/Olympus" }] }), "pl");
  expect(calls[0]).toBe("https://geocoding-api.open-meteo.com/v1/search?name=San&count=8&language=pl&format=json");
  expect(r).toEqual([{
    id: "search:37.7749,-122.4194", name: "San Francisco", country: "Stany Zjednoczone",
    lat: 37.7749, lon: -122.4194, timeZone: "America/Los_Angeles", source: "search",
  }]);
  expect(await searchPlaces("San", fake({}), "pl")).toEqual([]);
  await expect(searchPlaces("San", async () => { throw new Error("net"); }, "pl")).rejects.toThrow(ERR);
  await expect(searchPlaces("San", fake({}, false), "pl")).rejects.toThrow(ERR);
  await searchPlaces("Zielona Góra", fake({}), "pl");
  expect(calls[calls.length - 1]).toContain("&language=pl&");
  await searchPlaces("Lisbon", fake({}), "de");
  expect(calls[calls.length - 1]).toBe("https://geocoding-api.open-meteo.com/v1/search?name=Lisbon&count=8&language=de&format=json");
  await searchPlaces("Zielona Góra", fake({}), "pl");
  expect(calls[calls.length - 1]).toContain("name=Zielona%20G%C3%B3ra&");
});

const geo = (r: { ok: true } | { code: number }) =>
  ({
    getCurrentPosition: (ok: PositionCallback, err: PositionErrorCallback) =>
      "ok" in r
        ? ok({ coords: { latitude: 52.4, longitude: 16.9, accuracy: 12.6 } } as GeolocationPosition)
        : err({ code: r.code } as GeolocationPositionError),
  }) as unknown as Geolocation;

test("gpsPlace", async () => {
  expect(await gpsPlace(geo({ ok: true }))).toEqual({
    id: "gps", name: "", lat: 52.4, lon: 16.9,
    timeZone: deviceTimeZone(), source: "gps", accuracyM: 13,
  });
  await expect(gpsPlace(geo({ code: 1 }))).rejects.toThrow("gps-denied");
  await expect(gpsPlace(geo({ code: 2 }))).rejects.toThrow("gps-failed");
});

test("favorites work without crypto.randomUUID (plain HTTP)", () => {
  const original = crypto.randomUUID;
  // @ts-expect-error simulate an insecure context
  crypto.randomUUID = undefined;
  try {
    const f = new Favorites(memoryStore());
    const a = f.add({ id: "x", name: "A", lat: 1, lon: 1, timeZone: "UTC", source: "manual" });
    const b = f.add({ id: "y", name: "B", lat: 2, lon: 2, timeZone: "UTC", source: "manual" });
    expect(a.id).toMatch(/^[0-9a-f-]{16,}$/);
    expect(a.id).not.toBe(b.id);
    expect(f.list().length).toBe(2);
  } finally {
    crypto.randomUUID = original;
  }
});

test("places.ts returns no Polish text", async () => {
  const src = await Bun.file(new URL("./places.ts", import.meta.url)).text();
  expect(src).not.toMatch(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/);
});
