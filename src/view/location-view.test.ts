import { describe, expect, test } from "bun:test";
import type { Place } from "../astro.ts";
import { renderLocation, type LocationViewModel } from "./location-view.ts";

const SF: Place = {
  id: "search:37.77493,-122.41942", name: "San Francisco", country: "USA",
  lat: 37.77493, lon: -122.41942, timeZone: "America/Los_Angeles", source: "search",
};
const GPS: Place = {
  id: "gps", name: "Moja lokalizacja", lat: 52.4084, lon: 16.9342, timeZone: "Europe/Warsaw", source: "gps", accuracyM: 12,
};
const ZAKOPANE: Place = { id: "f1", name: "Zakopane", lat: 49.2992, lon: 19.9496, timeZone: "Europe/Warsaw", source: "search" };

function vm(over: Partial<LocationViewModel> = {}): LocationViewModel {
  return {
    query: "",
    results: [],
    searching: false,
    searchError: null,
    gps: null,
    gpsError: null,
    favorites: [],
    editingId: null,
    manual: { name: "", lat: "", lon: "", timeZone: "Europe/Warsaw", error: null },
    selected: null,
    instant: new Date("2026-11-01T14:25:00Z"),
    lang: "pl",
    ...over,
  };
}

describe("renderLocation", () => {
  test("search result shows zone, offset and local time", () => {
    const html = renderLocation(vm({ query: "San", results: [SF] }));
    expect(html).toContain("San Francisco");
    expect(html).toContain("USA, 37,7749° N, 122,4194° W");
    expect(html).toContain("America/Los_Angeles, UTC−8, latem UTC−7");
    expect(html).toContain(">06:25<");
    expect(html).toContain('data-action="pick" data-index="0"');
    expect(html).toContain('data-action="fav-add" data-index="0"');
    expect(html).toContain('name="q" value="San"');
  });

  test("footer links to the privacy notice, the license texts and the source", () => {
    const html = renderLocation(vm({ lang: "en" }));
    expect(html).toContain('<footer class="about"><a href="https://github.com/McAvity/is-it-dark-yet#privacy">Privacy</a><a href="./licenses.txt">Licenses</a><a href="https://github.com/McAvity/is-it-dark-yet">Source code</a></footer>');
  });

  test("results credit the search service and its data (CC BY 4.0); no results, no credit", () => {
    expect(renderLocation(vm({ query: "San", results: [SF] }))).toContain(
      '<p class="k hint credit">Wyszukiwanie: <a href="https://open-meteo.com/">Open-Meteo</a>, <a href="https://www.geonames.org/">GeoNames</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)</p>');
    expect(renderLocation(vm({ query: "San" }))).not.toContain("open-meteo.com");
  });

  test("result already in favorites has a filled star", () => {
    const html = renderLocation(vm({ results: [SF], favorites: [{ ...SF, id: "x" }] }));
    expect(html).toContain('aria-label="Usuń San Francisco z ulubionych" aria-pressed="true"');
  });

  test("selected GPS place shows Wybrane", () => {
    const html = renderLocation(vm({ gps: GPS, selected: GPS }));
    const gps = html.slice(html.indexOf("Z GPS"), html.indexOf("Ulubione"));
    expect(gps).toContain("Wybrane");
    expect(gps).toContain("52,4084° N, 16,9342° E, ±12 m");
    expect(gps).toContain('name="gps-name"');
    expect(gps).toContain('data-action="gps-save"');
    expect(gps).toContain('data-action="gps-refresh"');
    expect(gps).toContain('data-action="pick" data-id="gps"');
  });

  test("GPS card without a fix offers GPS and shows the error", () => {
    const html = renderLocation(vm({ gpsError: "gps-denied" }));
    expect(html).toContain("Użyj GPS");
    expect(html).toContain("Brak zgody na lokalizację.");
    expect(html).not.toContain("Wybrane");
  });

  test("favorite names are escaped", () => {
    const html = renderLocation(vm({ favorites: [{ ...ZAKOPANE, name: "<img src=x>" }] }));
    expect(html).toContain("&lt;img src=x&gt;");
    expect(html).not.toContain("<img src=x>");
  });

  test("result names, country and zone are escaped", () => {
    const html = renderLocation(vm({ results: [{ ...SF, name: '"><b>x', country: "<i>" }] }));
    expect(html).not.toContain("<b>x");
    expect(html).not.toContain("<i>");
    expect(html).toContain("&quot;&gt;&lt;b&gt;x");
  });

  test("favorites rows have rename and remove", () => {
    const html = renderLocation(vm({ favorites: [ZAKOPANE], selected: ZAKOPANE }));
    expect(html).toContain('data-action="fav-rename" data-id="f1"');
    expect(html).toContain('data-action="fav-remove" data-id="f1"');
    expect(html).toContain('data-action="pick" data-id="f1"');
    expect(html).toContain("Wybrane");
  });

  test("empty favorites show the empty-state copy", () => {
    const html = renderLocation(vm());
    expect(html).toContain("Brak ulubionych. Gwiazdka przy wyniku albo »Zapisz« dodaje miejsce.");
  });

  test("editing row has a name field and Gotowe", () => {
    const html = renderLocation(vm({ favorites: [ZAKOPANE], editingId: "f1" }));
    expect(html).toContain('name="fav-name"');
    expect(html).toContain('value="Zakopane"');
    expect(html).toContain("Gotowe");
    expect(html).toContain('data-action="fav-rename-done" data-id="f1"');
  });

  test("manual error is rendered", () => {
    const html = renderLocation(vm({
      manual: { name: "", lat: "91", lon: "", timeZone: "Europe/Warsaw", error: "lat-range" },
    }));
    expect(html).toContain("Szerokość musi być liczbą od −90 do 90.");
    expect(html).toContain('name="m-lat" value="91"');
  });

  test("manual form has zone select with the chosen zone and actions", () => {
    const html = renderLocation(vm());
    for (const s of ['name="m-name"', 'name="m-lon"', 'name="m-tz"', '<option value="Europe/Warsaw" selected>',
      'data-action="manual-use"', 'data-action="manual-save"', "UTC+1, latem UTC+2"]) {
      expect(html).toContain(s);
    }
  });

  test("search error is rendered", () => {
    const html = renderLocation(vm({ query: "Lisbon", searchError: "search-failed" }));
    expect(html).toContain("Nie udało się wyszukać. Sprawdź połączenie z internetem.");
  });

  test("searching shows Szukam…", () => {
    expect(renderLocation(vm({ query: "Liz", searching: true }))).toContain("Szukam…");
  });

  test("sections appear in order", () => {
    const html = renderLocation(vm({ results: [SF], gps: GPS }));
    const marks = ['href="#"', 'data-action="lang"', 'name="q"', "San Francisco", "Z GPS", "Ulubione", "Współrzędne ręcznie"];
    let last = -1;
    for (const m of marks) {
      const i = html.indexOf(m);
      expect(i).toBeGreaterThan(last);
      last = i;
    }
  });
});

describe("language", () => {
  test("section has 4 buttons named in their own language, active one pressed", () => {
    const html = renderLocation(vm({ lang: "fr" }));
    expect(html).toContain("Langue");
    const buttons = html.match(/<button[^>]*data-action="lang"[^>]*>[^<]*<\/button>/g) ?? [];
    expect(buttons.length).toBe(4);
    expect(buttons.map((b) => b.replace(/<[^>]+>/g, ""))).toEqual(["Polski", "English", "Français", "Deutsch"]);
    expect(buttons.filter((b) => b.includes('aria-pressed="true"'))).toEqual([expect.stringContaining('data-lang="fr"')]);
    expect(buttons.filter((b) => b.includes('aria-pressed="false"')).length).toBe(3);
  });

  test("Polish is the default", () => {
    const html = renderLocation(vm());
    expect(html).toContain("Język");
    expect(html).toMatch(/data-lang="pl"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-lang="pl"/);
  });

  test("German texts", () => {
    const html = renderLocation(vm({ lang: "de", results: [SF], gps: GPS, gpsError: "gps-failed", manual: { name: "", lat: "", lon: "", timeZone: "Europe/Warsaw", error: "lon-range" } }));
    for (const s of ["Standort", "Sprache", "Favoriten", "Koordinaten eingeben", "Zeitzone", "Als Favorit speichern", "Speichern", "Position aktualisieren",
      "37,7749° N, 122,4194° W", "UTC−8, im Sommer UTC−7", "Die Länge muss zwischen", "Die Position konnte nicht ermittelt werden. Bitte", 'aria-label="San Francisco zu Favoriten hinzufügen"']) {
      expect(html).toContain(s);
    }
    for (const w of ["Ulubione", "Szukaj", "Nazwa", "Zapisz", "latem", "Wybrane", "Długość", "Strefa"]) expect(html).not.toContain(w);
  });

  test("English uses a decimal point in coordinates and placeholders", () => {
    const html = renderLocation(vm({ lang: "en", results: [SF] }));
    expect(html).toContain("USA, 37.7749° N, 122.4194° W");
    expect(html).toContain('placeholder="52.4084"');
  });
});

test("default names follow the language", () => {
  const unnamedFav = { ...ZAKOPANE, name: "" };
  const oldFav = { ...ZAKOPANE, id: "f2", lat: 50, name: "Bez nazwy" };
  const html = renderLocation(vm({ lang: "en", gps: { ...GPS, name: "Moja lokalizacja" }, favorites: [unnamedFav, oldFav] }));
  expect(html).toContain('<span class="nm">My location</span>');
  expect(html).toContain('name="gps-name" value="My location"');
  expect(html.split('<span class="nm">Unnamed</span>').length - 1).toBe(2);
  expect(html).toContain('aria-label="Rename Unnamed"');
  expect(html).not.toContain("Bez nazwy");
  expect(html).not.toContain("Moja lokalizacja");
  const editing = renderLocation(vm({ lang: "de", favorites: [unnamedFav], editingId: "f1" }));
  expect(editing).toContain('name="fav-name" value="Unbenannt"');
});
