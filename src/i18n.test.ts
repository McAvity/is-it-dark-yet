import { expect, test } from "bun:test";
import { LANGS, detectLang, messages, placeName, type Lang } from "./i18n.ts";

// Same nested keys and value kinds as Polish; no empty strings anywhere.
function shape(v: unknown, path: string, out: Map<string, string>): void {
  if (typeof v === "string") {
    out.set(path, "string");
    expect(v.trim(), path).not.toBe("");
  } else if (typeof v === "function") out.set(path, "function");
  else if (Array.isArray(v) || (typeof v === "object" && v !== null)) {
    out.set(path, Array.isArray(v) ? `array${(v as unknown[]).length}` : "object");
    for (const [k, x] of Object.entries(v)) shape(x, `${path}.${k}`, out);
  } else out.set(path, typeof v);
}

test("every language has the same keys as Polish and no empty strings", () => {
  const ref = new Map<string, string>();
  shape(messages("pl"), "", ref);
  for (const { code } of LANGS) {
    const got = new Map<string, string>();
    shape(messages(code), "", got);
    expect([...got.entries()]).toEqual([...ref.entries()]);
  }
});

test("functions return non-empty text in every language", () => {
  for (const { code } of LANGS) {
    const m = messages(code);
    expect(m.inTime("5 min")).toContain("5");
    expect(m.ago("5 min")).toContain("5");
    expect(m.errors["search-failed"].length).toBeGreaterThan(10);
  }
});

test("language list names each language in itself", () => {
  expect(LANGS).toEqual([
    { code: "pl", name: "Polski" }, { code: "en", name: "English" },
    { code: "fr", name: "Français" }, { code: "de", name: "Deutsch" },
  ]);
  expect(messages("pl").appTitle).toBe("Słońce i Księżyc");
  expect(messages("en").appTitle).toBe("Sun & Moon");
  expect(messages("fr").appTitle).toBe("Soleil et Lune");
  expect(messages("de").appTitle).toBe("Sonne und Mond");
});

test("detectLang picks the first supported primary subtag", () => {
  expect(detectLang(["de-AT", "en"])).toBe("de");
  expect(detectLang(["es"])).toBe("en");
  expect(detectLang(["pl-PL"])).toBe("pl");
  expect(detectLang(["es-ES", "FR-ca"])).toBe("fr");
  expect(detectLang([])).toBe("en");
  expect(detectLang(["constructor"])).toBe("en");
});

test("default place names are resolved in the UI language, custom names are kept", () => {
  const gps = { name: "", source: "gps" as const };
  const manual = { name: "", source: "manual" as const };
  const to = (p: { name: string; source: "gps" | "manual" | "search" }, l: Lang) => placeName(p, l);
  expect(to(gps, "en")).toBe("My location");
  expect(to(gps, "de")).toBe("Mein Standort");
  expect(to(manual, "fr")).toBe("Sans nom");
  expect(to({ ...manual, name: "  " }, "de")).toBe("Unbenannt");
  // Entries stored before names were resolved at render time
  expect(to({ ...gps, name: "Moja lokalizacja" }, "en")).toBe("My location");
  expect(to({ ...manual, name: "Bez nazwy" }, "en")).toBe("Unnamed");
  expect(to({ ...gps, name: "My location" }, "pl")).toBe("Moja lokalizacja");
  expect(to({ ...manual, name: "Dom" }, "de")).toBe("Dom");
  expect(to({ ...gps, name: " Dom " }, "en")).toBe(" Dom ");
});

test("German errors use the neutral register", () => {
  const e = messages("de").errors;
  expect(e["search-failed"]).toBe("Die Suche ist fehlgeschlagen. Bitte die Internetverbindung prüfen.");
  expect(e["lat-range"]).toBe("Die Breite muss zwischen −90 und 90 liegen.");
  for (const t of Object.values(e)) expect(t).not.toMatch(/\b(du|dein\w*|Prüfe|Erlaube|Versuche|Wähle|wähle)\b/);
});

test("no-window copy names the azimuth", () => {
  expect(messages("en").main.dirNone(200, 5)).toBe("On this day the Sun never reaches azimuth 200° (±5°).");
  expect(messages("fr").main.dirNone(200, 5)).toBe("Ce jour-là, le Soleil n'est jamais à l'azimut 200° (±5°).");
});
