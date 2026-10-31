// UI languages: every user-visible string lives in a Messages object, one per language (src/i18n/*.ts).
import type { MoonPhaseName, Place, TwilightKind } from "./astro.ts";
import type { PlanetName } from "./sky.ts";
import type { Step } from "./time.ts";
import { de } from "./i18n/de.ts";
import { en } from "./i18n/en.ts";
import { fr } from "./i18n/fr.ts";
import { pl } from "./i18n/pl.ts";

export type Lang = "pl" | "en" | "fr" | "de";

export const LANGS: { code: Lang; name: string }[] = [
  { code: "pl", name: "Polski" },
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
];

// Codes thrown or returned by places.ts and main.ts; views turn them into text.
export type ErrorCode = "search-failed" | "gps-denied" | "gps-failed" | "lat-range" | "lon-range" | "tz-missing";

type Eight = readonly [string, string, string, string, string, string, string, string];
type Four = readonly [string, string, string, string];

export interface Messages {
  appTitle: string;
  // Numbers and time spans
  decimal: "," | ".";
  percent: (n: number) => string;
  units: { d: string; h: string; min: string; s: string };
  now: string; // a relative time under a minute
  inTime: (duration: string) => string;
  ago: (duration: string) => string;
  altitude: (deg: string, below: boolean) => string;
  compass: Eight; // N, NE, E … NW
  hemispheres: { n: string; s: string; e: string; w: string }; // coordinate suffixes
  offset: {
    fixed: (cur: string) => string; // zone without DST
    summerNow: (cur: string, winter: string) => string;
    winterNow: (cur: string, summer: string) => string;
  };
  phases: Record<MoonPhaseName, string>; // lower case where the language allows; capitalised for display
  quarters: Four; // new, first quarter, full, last quarter
  light: { day: string; night: string; dawn: Record<TwilightKind, string>; dusk: Record<TwilightKind, string> };
  dial: {
    aria: (time: string, light: string, big: string, small: string) => string;
    daylight: string; // under the day length, above the change since yesterday
    polarNight: string;
    noRise: string;
    polarDay: string;
    noSet: string;
  };
  horizon: {
    aria: (sunAz: string, sunWhere: string, moonAz: string, moonWhere: string) => string;
    above: (deg: string) => string;
    below: string;
    axis: Four; // N, E, S, W
    ticks: string; // legend for the rise/set ticks
    direction: string; // legend for the dashed line of the direction picked below
  };
  main: {
    sources: Record<Place["source"], string>;
    steps: Record<Step, string>;
    useGps: string;
    dayView: string;
    dial: string;
    horizon: string;
    viewTabs: string;
    bar: string;
    date: string;
    time: string;
    step: string;
    stepBack: string;
    stepForward: string;
    now: string;
    events: string; // heading of the list of the day's events
    sunrise: string;
    sunset: string;
    moonrise: string;
    moonset: string;
    sunTransit: string; // the Sun stands highest (crosses the meridian)
    moonTransit: string;
    sunUp: string; // above the horizon the whole day
    sunDown: string; // below the horizon the whole day
    moonUp: string;
    moonDown: string;
    highest: string; // the moment an up/down row is shown at: the body stands highest
    whereNow: string;
    sun: string;
    moon: string;
    moonAria: (waning: boolean, pct: string) => string;
    illumination: (pct: string) => string;
    age: (age: string) => string;
    seasons: (year: number) => string;
    springEquinox: string;
    summerSolstice: string;
    autumnEquinox: string;
    winterSolstice: string;
    dirHeading: string;
    dirExact: (time: string, altitude: string) => string;
    dirNone: (az: number, tol: number) => string;
    azimuth: string;
    tolerance: string;
  };
  sky: {
    heading: string;
    light: string; // blue and golden hour today
    blue: string;
    golden: string;
    morning: string;
    evening: string;
    tonight: string;
    dark: string; // above the dark window: astronomical night with the Moon down
    noNight: string; // the sun never gets 18° below the horizon
    moonAllNight: string; // there is a night, but the Moon is up through all of it
    noPlanets: string;
    planets: Record<PlanetName, string>;
    distanceNow: string;
    closer: string; // ends of the distance gauge
    farther: string;
    apogee: string;
    perigee: string;
    upcoming: string;
    supermoon: string;
    fullMoon: (time: string, km: string) => string;
    elongation: (body: "mercury" | "venus", morning: boolean) => string; // best seen in the morning / evening
    fromSun: (deg: number) => string;
    lunarEclipse: Record<"penumbral" | "partial" | "total", string>;
    solarEclipse: Record<"partial" | "annular" | "total", string>;
    peak: (time: string) => string;
    obscured: (pct: string) => string; // part of the sun's disc covered
    curious: string;
    sunIn: string;
    moonIn: string;
    sidereal: string;
    constellations: Partial<Record<string, string>>; // by the engine's Latin name; missing ones stay Latin
  };
  location: {
    title: string;
    back: string;
    language: string;
    searchLabel: string;
    searchPlaceholder: string;
    searchCredit: string; // before the links to the search service and its data source
    results: string;
    searching: string;
    nothingFound: string;
    timeHint: string;
    favAdd: (name: string) => string;
    favRemove: (name: string) => string;
    selected: string;
    gpsHeading: string;
    locating: string;
    refresh: string;
    useGps: string;
    name: string;
    save: string;
    done: string;
    rename: (name: string) => string;
    favorites: string;
    favHint: string;
    favEmpty: string;
    manual: string;
    namePlaceholder: string;
    lat: string;
    lon: string;
    zone: string;
    use: string;
    saveFav: string;
    privacy: string; // footer links: privacy notice, license texts (the source link is "GitHub" in every language)
    licenses: string;
  };
  myLocation: string; // default name of a GPS place
  unnamed: string; // default name of any other place
  noPlace: string;
  choosePlace: string;
  locating: string;
  errors: Record<ErrorCode, string>;
}

const ALL: Record<Lang, Messages> = { pl, en, fr, de };

export function messages(lang: Lang): Messages {
  return ALL[lang];
}

export const isLang = (v: unknown): v is Lang => typeof v === "string" && Object.hasOwn(ALL, v);

// First language whose primary subtag we support, else English.
export function detectLang(navigatorLanguages: readonly string[]): Lang {
  for (const tag of navigatorLanguages) {
    const primary = tag.toLowerCase().split(/[-_]/)[0];
    if (isLang(primary)) return primary;
  }
  return "en";
}

// Places without a name are stored with name "" and get a default name in the UI language when shown.
// Default names in any language (e.g. "Bez nazwy" stored by older versions) count as no name.
const DEFAULT_GPS = new Set(Object.values(ALL).map((m) => m.myLocation));
const DEFAULT_OTHER = new Set(Object.values(ALL).map((m) => m.unnamed));

export function placeName(p: Pick<Place, "name" | "source">, lang: Lang): string {
  const m = messages(lang);
  if (DEFAULT_GPS.has(p.name)) return m.myLocation;
  if (p.name.trim() === "" || DEFAULT_OTHER.has(p.name)) return p.source === "gps" ? m.myLocation : m.unnamed;
  return p.name;
}
