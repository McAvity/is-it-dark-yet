// App shell: state, rendering into #app and DOM event wiring.
import type { Place } from "./astro.ts";
import { isLang, messages, placeName, type ErrorCode, type Lang } from "./i18n.ts";
import {
  Favorites, MIN_QUERY, type KeyValueStore, gpsPlace, isValidTimeZone, loadSelected, memoryStore, parseCoordinate, samePlace,
  saveSelected, searchPlaces, timeZoneList,
} from "./places.ts";
import {
  LOCATION_HASH, arrowStep, isTolerance, loadDirection, loadLang, saveDirection, saveLang, screenFromHash, shouldTick,
  type AppState,
} from "./state.ts";
import { addStep, deviceTimeZone, fromZoned, isStep, zonedParts } from "./time.ts";
import { escapeHtml } from "./view/escape.ts";
import { renderLocation, type LocationViewModel } from "./view/location-view.ts";
import { renderMain } from "./view/main-view.ts";

// Blocked storage makes the localStorage getter throw; fall back to a store that lives for the session.
function pickStorage(): KeyValueStore {
  try {
    return localStorage;
  } catch {
    return memoryStore();
  }
}
const storage = pickStorage();

const app = document.getElementById("app")!;
const state: AppState = {
  instant: new Date(),
  followNow: true,
  step: "hour",
  place: loadSelected(storage),
  screen: screenFromHash(location.hash),
  slide: 0,
  message: null,
  direction: loadDirection(storage),
  lang: loadLang(storage, navigator.languages?.length ? navigator.languages : [navigator.language ?? ""]),
};
const msg = () => messages(state.lang);

// The page's language and title follow the UI language.
function applyLang(): void {
  document.documentElement.lang = state.lang;
  document.title = msg().appTitle;
}
applyLang();

// Error code carried by a rejection from places.ts; anything unexpected becomes the fallback.
const errorCode = (e: unknown, fallback: ErrorCode): ErrorCode =>
  e instanceof Error && Object.hasOwn(msg().errors, e.message) ? (e.message as ErrorCode) : fallback;
let locating = false;
let scrolling = 0; // timeout id while the carousel is moving

// Location screen: everything except what comes from storage or the main state.
const favorites = new Favorites(storage);
const zones = timeZoneList();
const loc: Omit<LocationViewModel, "favorites" | "selected" | "instant" | "locating" | "zones" | "lang"> = {
  query: "",
  results: [],
  searching: false,
  searchError: null,
  gps: state.place?.id === "gps" ? state.place : null,
  gpsError: null,
  gpsName: undefined,
  editingId: null,
  editName: undefined,
  manual: { name: "", lat: "", lon: "", timeZone: deviceTimeZone(), error: null },
};
let searchTimer = 0;
let searchSeq = 0; // bumped on every query change; older responses are dropped

function locationVm(): LocationViewModel {
  return { ...loc, favorites: favorites.list(), selected: state.place, instant: state.instant, locating, zones, lang: state.lang };
}

const track = () => app.querySelector<HTMLElement>(".track");
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function messageScreen(text: string, link: string): string {
  return `<div class="message"><p>${escapeHtml(text)}</p>${link}</div>`;
}

// keep: the control being edited (defaults to the focused one); null re-renders everything.
function render(keep: Element | null = document.activeElement): void {
  if (state.screen === "location") {
    paint(renderLocation(locationVm()), keep);
    return;
  }
  if (!state.place) {
    const m = msg();
    app.innerHTML = locating
      ? messageScreen(m.locating, "")
      : messageScreen(state.message ? m.errors[state.message] : m.noPlace, `<a href="${LOCATION_HASH}">${m.choosePlace}</a>`);
    return;
  }
  const left = track()?.scrollLeft ?? null;
  paint(renderMain({ ...state, place: state.place }), keep);
  const t = track();
  if (t) t.scrollLeft = left ?? state.slide * t.clientWidth;
}

// Replaces the screen. A focused button or field is focused again in the new markup when it still exists.
function paint(html: string, keep: Element | null): void {
  if (patchAround(html, keep)) return;
  const active = document.activeElement as HTMLElement | null;
  let again = "";
  if (active && app.contains(active)) {
    const { action, id, index } = active.dataset;
    const name = active.getAttribute("name");
    if (action) {
      again = `[data-action="${CSS.escape(action)}"]`;
      if (id !== undefined) again += `[data-id="${CSS.escape(id)}"]`;
      if (index !== undefined) again += `[data-index="${CSS.escape(index)}"]`;
    } else if (name) again = `[name="${CSS.escape(name)}"]`;
  }
  app.innerHTML = html;
  if (again) app.querySelector<HTMLElement>(again)?.focus({ preventScroll: true });
}

// When a form control is being edited (focused, or the source of a change event), replace every section
// except the one holding it, and only sync the values of that section's other controls.
// Re-creating the focused input would drop focus and, in Chromium, the segment being typed.
function patchAround(html: string, focused: Element | null): boolean {
  const screen = app.querySelector(".screen");
  if (!screen || !focused || !screen.contains(focused) || !focused.matches("input[name], select[name]")) return false;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const next = tpl.content.querySelector(".screen");
  if (!next || next.className !== screen.className || next.children.length !== screen.children.length) return false;
  [...screen.children].forEach((old, i) => {
    const fresh = next.children[i]!;
    if (!old.contains(focused)) {
      old.replaceWith(fresh.cloneNode(true));
      return;
    }
    for (const c of fresh.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[name]")) {
      const live = old.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${c.name}"]`);
      if (live && live !== focused && live.value !== c.value) live.value = c.value;
    }
    // Small read-only parts marked data-live (e.g. an offset note) are refreshed too.
    const freshLive = fresh.querySelectorAll("[data-live]");
    old.querySelectorAll("[data-live]").forEach((el, n) => {
      if (freshLive[n]) el.innerHTML = freshLive[n]!.innerHTML;
    });
  });
  return true;
}

function setInstant(t: Date, keep?: Element): void {
  state.instant = t;
  state.followNow = false;
  render(keep);
}

function usePlace(p: Place): void {
  state.place = p;
  state.message = null;
  saveSelected(storage, p);
}

// Takes a GPS fix. select: also make it the current place (startup and the main screen's GPS button).
async function locate(select: boolean): Promise<void> {
  locating = true;
  loc.gpsError = null;
  render();
  try {
    const p = await gpsPlace(navigator.geolocation);
    loc.gps = p;
    loc.gpsName = undefined;
    if (select) usePlace(p);
  } catch (e) {
    loc.gpsError = state.message = errorCode(e, "gps-failed");
    if (select) {
      location.hash = LOCATION_HASH;
      state.screen = "location";
    }
  } finally {
    locating = false;
  }
  render();
}

// Picks a place and goes back to the main screen.
function pick(p: Place): void {
  usePlace(p);
  loc.editingId = null;
  location.hash = "";
}

function scheduleSearch(): void {
  clearTimeout(searchTimer);
  const seq = ++searchSeq;
  const q = loc.query.trim();
  loc.searchError = null;
  if (q.length < MIN_QUERY) {
    loc.results = [];
    loc.searching = false;
    return;
  }
  loc.searching = true;
  searchTimer = window.setTimeout(async () => {
    let results: Place[] = [];
    let error: ErrorCode | null = null;
    try {
      results = await searchPlaces(q, fetch, state.lang);
    } catch (e) {
      error = errorCode(e, "search-failed");
    }
    if (seq !== searchSeq) return;
    Object.assign(loc, { results, searchError: error, searching: false });
    if (state.screen === "location") render();
  }, 300);
}

function finishRename(): void {
  const id = loc.editingId;
  if (!id) return;
  favorites.rename(id, loc.editName ?? "");
  const renamed = favorites.list().find((f) => f.id === id);
  // The selected place is a copy; keep its name in step with the favorite.
  if (renamed && state.place?.id === id) usePlace(renamed);
  loc.editingId = null;
  loc.editName = undefined;
  render(null);
}

function saveGps(): void {
  if (!loc.gps) return;
  favorites.add({ ...loc.gps, name: (loc.gpsName ?? loc.gps.name).trim() });
  render(null);
}

// The manual form as a place, or the first validation error.
function manualPlace(): Place | ErrorCode {
  const { name, lat: latText, lon: lonText, timeZone } = loc.manual;
  const lat = parseCoordinate(latText, "lat");
  if (typeof lat === "string") return lat;
  const lon = parseCoordinate(lonText, "lon");
  if (typeof lon === "string") return lon;
  if (!isValidTimeZone(timeZone)) return "tz-missing";
  return { id: `manual:${lat},${lon}`, name: name.trim(), lat, lon, timeZone, source: "manual" };
}

function useManual(save: boolean): void {
  const p = manualPlace();
  loc.manual.error = typeof p === "string" ? p : null;
  if (typeof p === "string") return render(null);
  if (!save) return pick(p);
  favorites.add(p);
  Object.assign(loc.manual, { name: "", lat: "", lon: "" });
  render(null);
}

function locationClick(el: HTMLElement): void {
  const { id, index } = el.dataset;
  const result = index !== undefined ? loc.results[Number(index)] : undefined;
  const fav = id !== undefined ? favorites.list().find((f) => f.id === id) : undefined;
  switch (el.dataset.action) {
    case "pick": {
      const p = id === "gps" && loc.gps ? { ...loc.gps, name: loc.gpsName?.trim() || loc.gps.name } : result ?? fav;
      if (p) pick(p);
      break;
    }
    case "fav-add": { // toggles: a result already in favorites is removed
      if (!result) break;
      const existing = favorites.list().find((f) => samePlace(f, result));
      if (existing) favorites.remove(existing.id);
      else favorites.add(result);
      render(null);
      break;
    }
    case "fav-remove":
      if (id) favorites.remove(id);
      if (loc.editingId === id) loc.editingId = null;
      render(null);
      break;
    case "fav-rename":
      if (!fav) break;
      loc.editingId = fav.id;
      loc.editName = placeName(fav, state.lang);
      render(null);
      {
        const input = app.querySelector<HTMLInputElement>('[name="fav-name"]');
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      }
      break;
    case "fav-rename-done":
      finishRename();
      break;
    case "gps-refresh":
      void locate(false);
      break;
    case "gps-save":
      saveGps();
      break;
    case "manual-use":
    case "manual-save":
      useManual(el.dataset.action === "manual-save");
      break;
    case "lang":
      if (isLang(el.dataset.lang)) setLang(el.dataset.lang);
      break;
  }
}

function setLang(lang: Lang): void {
  if (lang === state.lang) return;
  state.lang = lang;
  saveLang(storage, lang);
  applyLang();
  if (loc.query.trim().length >= MIN_QUERY) scheduleSearch(); // names and countries come back in the new language
  render();
}

function showSlide(i: 0 | 1): void {
  const t = track();
  if (!t) return;
  t.scrollTo({ left: i * t.clientWidth, behavior: reducedMotion() ? "auto" : "smooth" });
  markTabs(i);
}

// Updates the tab highlight without re-rendering the screen.
function markTabs(i: 0 | 1): void {
  state.slide = i;
  app.querySelectorAll<HTMLElement>(".tab").forEach((tab, n) => {
    tab.classList.toggle("on", n === i);
    tab.setAttribute("aria-selected", String(n === i));
  });
}

app.addEventListener("click", (e) => {
  const el = (e.target as Element).closest<HTMLElement>("[data-action]");
  if (!el) return;
  if (state.screen === "location") return locationClick(el);
  const tz = state.place?.timeZone;
  switch (el.dataset.action) {
    case "step-back":
    case "step-forward":
      if (tz) setInstant(addStep(state.instant, state.step, el.dataset.action === "step-back" ? -1 : 1, tz));
      break;
    case "now":
      state.instant = new Date();
      state.followNow = true;
      render();
      break;
    case "tab-dial":
      showSlide(0);
      break;
    case "tab-horizon":
      showSlide(1);
      break;
    case "gps":
      void locate(true);
      break;
  }
});

// A committed date or time field: same instant, with the date or the time of day replaced.
function setDateOrTime(el: HTMLInputElement | HTMLSelectElement): void {
  const tz = state.place?.timeZone;
  if (!tz || !el.value) return;
  const p = zonedParts(state.instant, tz);
  let [y, mo, d, h, mi] = [p.year, p.month, p.day, p.hour, p.minute];
  if (el.name === "date") [y, mo, d] = el.value.split("-").map(Number) as [number, number, number];
  else [h, mi] = el.value.split(":").map(Number) as [number, number];
  // Ignore unfinished or out-of-range input (e.g. a year still being typed).
  if ([y, mo, d, h, mi].some((n) => !Number.isFinite(n)) || y < 1 || y > 9999) return;
  setInstant(fromZoned(y, mo, d, h, mi, tz), el);
}

app.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  switch (el.name) {
    case "m-tz":
      loc.manual.timeZone = el.value;
      render(el);
      break;
    case "step":
      if (isStep(el.value)) state.step = el.value;
      break;
    case "dir-tol": {
      const tol = Number(el.value);
      if (!isTolerance(tol)) break;
      state.direction = { ...state.direction, tolerance: tol };
      saveDirection(storage, state.direction);
      render(el);
      break;
    }
    case "dir-az":
      // Typing is handled on input; when it is committed, show the value actually used.
      el.value = String(state.direction.azimuth);
      break;
    case "date":
    case "time":
      setDateOrTime(el);
      break;
  }
});

// Typing: update the state without re-creating the field being typed in.
app.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  switch (el.name) {
    case "dir-az": {
      const n = el.value.trim() === "" ? NaN : Number(el.value);
      if (!Number.isFinite(n)) break; // empty or unfinished while typing
      state.direction = { ...state.direction, azimuth: Math.min(359, Math.max(0, Math.round(n))) };
      saveDirection(storage, state.direction);
      render(el);
      break;
    }
    case "q":
      loc.query = el.value;
      scheduleSearch();
      render(el);
      break;
    case "gps-name":
      loc.gpsName = el.value;
      break;
    case "fav-name":
      loc.editName = el.value;
      break;
    case "m-name":
    case "m-lat":
    case "m-lon":
      loc.manual[el.name.slice(2) as "name" | "lat" | "lon"] = el.value;
      break;
  }
});

app.addEventListener("keydown", (e) => {
  const el = e.target as HTMLInputElement;
  if (e.key !== "Enter" || e.isComposing) return;
  if (el.name === "fav-name") finishRename();
  else if (el.name === "gps-name") saveGps();
  else if (el.name === "q") el.blur(); // closes the on-screen keyboard
});

// scroll does not bubble; capture it on the container.
app.addEventListener(
  "scroll",
  (e) => {
    const t = e.target as HTMLElement;
    if (!t.classList?.contains("track") || !t.clientWidth) return;
    const i = Math.round(t.scrollLeft / t.clientWidth) === 1 ? 1 : 0;
    if (i !== state.slide) markTabs(i);
    clearTimeout(scrolling);
    scrolling = window.setTimeout(() => (scrolling = 0), 200);
  },
  true,
);

window.addEventListener("hashchange", () => {
  state.screen = screenFromHash(location.hash);
  if (state.followNow) state.instant = new Date();
  if (state.screen === "main") loc.editingId = null;
  render();
});

// True when an input or select inside #app has focus (also while its native picker is open).
const formControlFocused = () => {
  const el = document.activeElement;
  return !!el && app.contains(el) && el.matches("input, select, textarea");
};

// Arrow keys step the time on the main screen, like the − / + buttons.
document.addEventListener("keydown", (e) => {
  if (state.screen !== "main" || !state.place || e.isComposing) return;
  const dir = arrowStep(e.key, e.altKey || e.ctrlKey || e.metaKey || e.shiftKey, formControlFocused());
  if (dir === null) return;
  e.preventDefault(); // no page scroll
  setInstant(addStep(state.instant, state.step, dir, state.place.timeZone));
});

// Moves to the current time when following it (see shouldTick).
function tick(): void {
  if (!shouldTick(state, formControlFocused(), scrolling !== 0)) return;
  state.instant = new Date();
  render();
}

setInterval(tick, 30_000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") tick();
});

render();
if (!state.place) void locate(true);
