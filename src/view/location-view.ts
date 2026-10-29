// Location screen as one HTML string. Pure: everything comes from the view model, no DOM or clock access.
import type { Place } from "../astro.ts";
import { formatClock, formatCoords, formatNumber, offsetLabel } from "../format.ts";
import { LANGS, messages, placeName, type ErrorCode, type Lang, type Messages } from "../i18n.ts";
import { MIN_QUERY, samePlace, timeZoneList } from "../places.ts";
import { COLORS } from "./colors.ts";
import { escapeHtml } from "./escape.ts";
import { gpsIcon } from "./icons.ts";
import { options } from "./options.ts";

export interface LocationViewModel {
  query: string;
  results: Place[];
  searching: boolean;
  searchError: ErrorCode | null;
  gps: Place | null;
  gpsError: ErrorCode | null;
  favorites: Place[];
  editingId: string | null;
  manual: { name: string; lat: string; lon: string; timeZone: string; error: ErrorCode | null };
  selected: Place | null;
  instant: Date;
  // Text typed in the GPS card's and the edited favorite's name fields (kept across re-renders).
  gpsName?: string | undefined;
  editName?: string | undefined;
  locating?: boolean; // a GPS fix is being taken
  zones?: string[]; // options of the zone select; defaults to all supported zones
  lang: Lang;
}

// What the render functions share: the view model plus its language and messages.
interface Ctx { vm: LocationViewModel; lang: Lang; m: Messages; l: Messages["location"] }

const STAR = (filled: boolean) =>
  `<svg width="22" height="22" viewBox="0 0 24 24" fill="${filled ? COLORS.sun : "none"}" stroke="${filled ? COLORS.sun : COLORS.muted}" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/></svg>`;
const PENCIL = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${COLORS.muted}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>`;

const zoneLine = (p: Place, c: Ctx) => `${escapeHtml(p.timeZone)}, ${offsetLabel(p.timeZone, c.vm.instant, c.lang)}`;
const isSelected = (p: Place, c: Ctx) => !!c.vm.selected && samePlace(c.vm.selected, p);
const err = (code: ErrorCode | null, c: Ctx) =>
  code ? `<p class="err" role="alert">${escapeHtml(c.m.errors[code])}</p>` : "";

// Tappable place body (name + meta lines), with the local time and the "selected" pill on the right.
function pickBody(p: Place, attr: string, meta: string, c: Ctx, selected: boolean): string {
  const badge = `<span class="badge">${c.l.selected}</span>`;
  return `<button class="pick" data-action="pick" ${attr}${selected ? ' aria-current="true"' : ""}><span class="nm">${escapeHtml(placeName(p, c.lang))}</span><span class="meta">${meta}</span><span class="meta">${zoneLine(p, c)}</span></button>
<div class="side">${selected ? badge : ""}<span class="ltime">${formatClock(c.vm.instant, p.timeZone)}</span></div>`;
}

function header(c: Ctx): string {
  return `<header class="loc-top">
<a class="back" href="#" aria-label="${c.l.back}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${COLORS.text}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></a>
<h1>${c.l.title}</h1>
</header>`;
}

// Segmented control; each language is named in itself.
function language(c: Ctx): string {
  const buttons = LANGS.map(({ code, name }) =>
    `<button class="seg-btn" data-action="lang" data-lang="${code}" lang="${code}" aria-pressed="${code === c.lang}">${name}</button>`).join("");
  return `<section class="lang"><h2 class="h2" id="lang-h">${c.l.language}</h2><div class="seg" role="group" aria-labelledby="lang-h">${buttons}</div></section>`;
}

function search(c: Ctx): string {
  const { vm, l } = c;
  return `<label class="search">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${COLORS.muted}" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
<span class="sr">${l.searchLabel}</span>
<input type="search" name="q" value="${escapeHtml(vm.query)}" placeholder="${l.searchPlaceholder}" autocomplete="off" enterkeyhint="search">
</label>`;
}

function results(c: Ctx): string {
  const { vm, l } = c;
  const rows = vm.results.map((p, i) => {
    const fav = vm.favorites.some((f) => samePlace(f, p));
    const name = escapeHtml(placeName(p, c.lang));
    const label = fav ? l.favRemove(name) : l.favAdd(name);
    const where = (p.country ? `${escapeHtml(p.country)}, ` : "") + formatCoords(p.lat, p.lon, c.lang);
    return `<div class="card flat">${pickBody(p, `data-index="${i}"`, where, c, isSelected(p, c))}
<button class="ico" data-action="fav-add" data-index="${i}" aria-label="${label}" aria-pressed="${fav}">${STAR(fav)}</button></div>`;
  });
  const empty = vm.query.trim().length >= MIN_QUERY && !vm.searching && !vm.searchError && !vm.results.length;
  // No whitespace between parts: an empty section matches :empty and is hidden.
  const parts = [
    vm.searching ? `<p class="k hint" role="status">${l.searching}</p>` : "",
    err(vm.searchError, c),
    empty ? `<p class="k hint">${l.nothingFound}</p>` : "",
    ...rows,
    rows.length ? `<p class="k hint">${l.timeHint}</p>` : "",
    // Open-Meteo's geocoding data (from GeoNames) is CC BY 4.0, which asks for credit where it is shown.
    rows.length ? `<p class="k hint credit">${l.searchCredit} <a href="https://open-meteo.com/">Open-Meteo</a>, <a href="https://www.geonames.org/">GeoNames</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)</p>` : "",
  ];
  return `<section class="results" aria-label="${l.results}">${parts.join("")}</section>`;
}

function gpsSection(c: Ctx): string {
  const { vm, l } = c;
  const g = vm.gps;
  const refreshLabel = vm.locating ? l.locating : g ? l.refresh : l.useGps;
  const refresh = `<button class="pill ghost small" data-action="gps-refresh"${vm.locating ? " disabled" : ""}>${refreshLabel}</button>`;
  if (!g) return `<section><h2 class="h2">${l.gpsHeading}</h2>${err(vm.gpsError, c)}${refresh}</section>`;
  const selected = vm.selected?.source === "gps" && vm.selected.id === "gps";
  const acc = g.accuracyM !== undefined ? `, ±${g.accuracyM} m` : "";
  const name = vm.gpsName ?? placeName(g, c.lang);
  return `<section><h2 class="h2">${l.gpsHeading}</h2>
<div class="card wrap${selected ? " on" : ""}">${gpsIcon(24, "gps-ico")}
${pickBody(g, 'data-id="gps"', formatCoords(g.lat, g.lon, c.lang) + acc, c, selected)}
<div class="sub-row">
<label class="lab grow">${l.name}<input class="inp" type="text" name="gps-name" value="${escapeHtml(name)}" autocomplete="off" enterkeyhint="done"></label>
<button class="pill primary" data-action="gps-save">${l.save}</button>
</div>
</div>
${err(vm.gpsError, c)}${refresh}
</section>`;
}

function favoritesSection(c: Ctx): string {
  const { vm, l } = c;
  const rows = vm.favorites.map((f) => {
    const id = escapeHtml(f.id);
    const name = escapeHtml(placeName(f, c.lang));
    if (f.id === vm.editingId) {
      return `<div class="card wrap editing">
<label class="lab full">${l.name}<input class="inp" type="text" name="fav-name" value="${escapeHtml(vm.editName ?? placeName(f, c.lang))}" autocomplete="off" enterkeyhint="done"></label>
<div class="meta grow">${formatCoords(f.lat, f.lon, c.lang)}<br>${zoneLine(f, c)}</div>
<button class="pill primary small" data-action="fav-rename-done" data-id="${id}">${l.done}</button>
</div>`;
    }
    return `<div class="card">${pickBody(f, `data-id="${id}"`, formatCoords(f.lat, f.lon, c.lang), c, isSelected(f, c))}
<button class="ico" data-action="fav-rename" data-id="${id}" aria-label="${l.rename(name)}">${PENCIL}</button>
<button class="ico tight" data-action="fav-remove" data-id="${id}" aria-label="${l.favRemove(name)}">${STAR(true)}</button>
</div>`;
  });
  const body = rows.length
    ? `<div class="list">${rows.join("")}</div><p class="k hint">${l.favHint}</p>`
    : `<p class="k">${l.favEmpty}</p>`;
  return `<section><h2 class="h2">${l.favorites}</h2>${body}</section>`;
}

function manualSection(c: Ctx): string {
  const { vm, l, lang } = c;
  const manual = vm.manual;
  const zones = vm.zones ?? timeZoneList();
  const list = zones.includes(manual.timeZone) ? zones : [manual.timeZone, ...zones];
  return `<section class="manual"><h2 class="h2">${l.manual}</h2>
<label class="lab">${l.name}<input class="inp" type="text" name="m-name" value="${escapeHtml(manual.name)}" placeholder="${l.namePlaceholder}" autocomplete="off"></label>
<div class="sub-row">
<label class="lab grow">${l.lat}<input class="inp" type="text" name="m-lat" value="${escapeHtml(manual.lat)}" inputmode="decimal" placeholder="${formatNumber(52.4084, 4, lang)}" autocomplete="off"></label>
<label class="lab grow">${l.lon}<input class="inp" type="text" name="m-lon" value="${escapeHtml(manual.lon)}" inputmode="decimal" placeholder="${formatNumber(16.9342, 4, lang)}" autocomplete="off"></label>
</div>
<label class="lab gap">${l.zone}<select class="inp" name="m-tz">${options(list, manual.timeZone, escapeHtml)}</select></label>
<p class="k meta tz-note" data-live>${offsetLabel(manual.timeZone, vm.instant, lang)}</p>
<div data-live>${err(manual.error, c)}</div>
<div class="sub-row">
<button class="pill primary grow" data-action="manual-use">${l.use}</button>
<button class="pill ghost grow" data-action="manual-save">${l.saveFav}</button>
</div>
</section>`;
}

const REPO = "https://github.com/McAvity/is-it-dark-yet";

// Privacy notice (in the README), the license texts shipped with the build, and the source code.
function about(c: Ctx): string {
  const { l } = c;
  return `<footer class="about"><a href="${REPO}#privacy">${l.privacy}</a><a href="./licenses.txt">${l.licenses}</a><a href="${REPO}">${l.source}</a></footer>`;
}

export function renderLocation(vm: LocationViewModel): string {
  const { lang } = vm;
  const m = messages(lang);
  const c: Ctx = { vm, lang, m, l: m.location };
  return `<div class="screen loc">
${header(c)}
${language(c)}
${search(c)}
${results(c)}
${gpsSection(c)}
${favoritesSection(c)}
${manualSection(c)}
${about(c)}
</div>`;
}
