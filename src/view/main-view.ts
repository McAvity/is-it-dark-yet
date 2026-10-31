// Main screen as one HTML string. Pure: everything comes from the state, no DOM or clock access.
import { dayEvents, moonInfo, seasons, sunInfo, type DayEvent, type Place } from "../astro.ts";
import {
  compassName, formatAge, formatAltitude, formatAzimuth,
  formatClock, formatDate, formatDateTime, formatRelative, formatTime, offsetLabel,
} from "../format.ts";
import { sunDirectionWindows } from "../direction.ts";
import { messages, placeName, type Lang } from "../i18n.ts";
import { moonDiscPath } from "../geometry.ts";
import { LOCATION_HASH, TOLERANCES, type AppState, type Direction } from "../state.ts";
import { STEPS, zonedParts, type Step } from "../time.ts";
import { COLORS, LIGHT_COLORS } from "./colors.ts";
import { renderDial } from "./dial.ts";
import { appFooter } from "./about.ts";
import { renderSky } from "./sky-view.ts";
import { gpsIcon } from "./icons.ts";
import { escapeHtml } from "./escape.ts";
import { renderHorizon } from "./horizon.ts";
import { options } from "./options.ts";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function row(label: string, value: string, valueClass = "v"): string {
  return `<div class="row"><span>${label}</span><span class="${valueClass}">${value}</span></div>`;
}

function locationRow(place: Place, t: Date, lang: Lang): string {
  const { main } = messages(lang);
  const name = escapeHtml(placeName(place, lang));
  const tz = escapeHtml(place.timeZone);
  return `<div class="top">
<a class="place" href="${LOCATION_HASH}">
<div class="place-name">${name} <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${COLORS.muted}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></div>
<div class="k v sub">${main.sources[place.source]}, ${tz}, ${offsetLabel(place.timeZone, t, lang)}</div>
</a>
<button class="btn icon" data-action="gps" aria-label="${main.useGps}">${gpsIcon(22)}</button>
</div>`;
}

function carousel(dial: string, horizon: string, slide: 0 | 1, lang: Lang): string {
  const { main } = messages(lang);
  const tab = (i: 0 | 1, action: string, label: string) =>
    `<button class="tab${slide === i ? " on" : ""}" role="tab" data-action="${action}" aria-selected="${slide === i}"><span class="dot"></span>${label}</button>`;
  return `<section class="view" aria-label="${main.dayView}">
<div class="track">
<div class="slide" aria-label="${main.dial}">${dial}</div>
<div class="slide" aria-label="${main.horizon}">${horizon}</div>
</div>
<div class="tabs" role="tablist" aria-label="${main.viewTabs}">${tab(0, "tab-dial", main.dial)}${tab(1, "tab-horizon", main.horizon)}</div>
</section>`;
}

function bottomBar(place: Place, t: Date, step: Step, lang: Lang): string {
  const tz = place.timeZone;
  const { main } = messages(lang);
  return `<section class="bar" aria-label="${main.bar}">
${locationRow(place, t, lang)}
<div class="line">
<label class="field grow"><span class="sr">${main.date}</span><input type="date" name="date" value="${formatDate(t, tz)}"></label>
<label class="field time"><span class="sr">${main.time}</span><input type="time" name="time" value="${formatClock(t, tz)}"></label>
</div>
<div class="line center">
<button class="btn big" data-action="step-back" aria-label="${main.stepBack}">−</button>
<label class="step"><span class="sr">${main.step}</span><select name="step">${options(STEPS, step, (v) => main.steps[v])}</select></label>
<button class="btn big" data-action="step-forward" aria-label="${main.stepForward}">+</button>
<button class="btn primary" data-action="now">${main.now}</button>
</div>
</section>`;
}

function eventLabel(e: DayEvent, lang: Lang): string {
  const m = messages(lang);
  const main = m.main;
  const sun = e.body === "sun";
  switch (e.kind) {
    case "dawn": return m.light.dawn[e.twilight];
    case "dusk": return m.light.dusk[e.twilight];
    case "rise": return sun ? main.sunrise : main.moonrise;
    case "set": return sun ? main.sunset : main.moonset;
    case "transit": return sun ? main.sunTransit : main.moonTransit;
    case "up": return sun ? main.sunUp : main.moonUp;
    case "down": return sun ? main.sunDown : main.moonDown;
  }
}

// The day's events in time order: twilights, sunrise, sunset, moonrise, moonset, with the azimuth.
// Compact: one line each, no dividers.
// Each body's transit too; one that neither rises nor sets gets its up/down row at that moment instead.
function eventsSection(events: DayEvent[], t: Date, tz: string, lang: Lang): string {
  const { main } = messages(lang);
  const rows = events.map((e) => {
    const twilight = e.twilight !== undefined;
    const color = e.body === "moon" ? COLORS.moon : e.twilight ? LIGHT_COLORS[e.twilight] : LIGHT_COLORS.day;
    // A square for the light changing, the symbol (☉, ☽) for the Sun and the Moon themselves.
    // U+FE0E asks for the text glyph, not an emoji.
    const mark = twilight
      ? `<span class="swatch square" style="background:${color}"></span>`
      : `<span class="sym" style="color:${color}">${e.body === "sun" ? "☉" : "☽"}\uFE0E</span>`;
    const note = e.kind === "up" || e.kind === "down" ? ` <span class="k">(${main.highest})</span>` : "";
    const past = e.time.getTime() < t.getTime() ? " past" : "";
    return `<div class="event${past}"><b class="v when">${formatTime(e.time, tz)}</b>${mark}<span class="what">${eventLabel(e, lang)}${note}</span><span class="v az">${formatAzimuth(e.azimuth)}</span></div>`;
  });
  return `<section><h2 class="h2">${main.events}</h2><div class="events">${rows.join("")}</div></section>`;
}

// "When is the sun in this direction" for the local day of t. Only parsed numbers reach the markup.
function directionSection(t: Date, place: Place, dir: Direction, lang: Lang): string {
  const { main } = messages(lang);
  const tz = place.timeZone;
  const az = Math.round(dir.azimuth);
  const tol = dir.tolerance;
  const windows = sunDirectionWindows(t, place, az, tol);
  const rows = windows.length
    ? windows.map((w) => {
        const exact = w.exact && w.exactAltitude !== null
          ? main.dirExact(formatTime(w.exact, tz), formatAltitude(w.exactAltitude, lang))
          : "";
        return row(`<b class="v">${formatTime(w.from, tz)}–${formatTime(w.to, tz)}</b>`, exact, "v k");
      }).join("")
    : `<p class="k empty">${main.dirNone(az, tol)}</p>`;
  return `<section class="direction"><h2 class="h2">${main.dirHeading}</h2>
<div class="line end">
<label class="field">${main.azimuth}<input type="number" name="dir-az" class="az" min="0" max="359" step="1" inputmode="numeric" value="${az}"></label>
<span class="v compass" data-live>${compassName(az, lang)}</span>
<label class="step tol">${main.tolerance}<select name="dir-tol">${options(TOLERANCES, tol, (v) => `±${v}°`)}</select></label>
</div>
<div class="dir-results" data-live aria-live="polite">${rows}</div>
</section>`;
}

export function renderMain(state: AppState & { place: Place }): string {
  const { place, instant: t, lang } = state;
  const m = messages(lang);
  const main = m.main;
  const tz = place.timeZone;
  const sun = sunInfo(t, place);
  const moon = moonInfo(t, place);

  const where = (name: string, alt: number, az: number) =>
    row(name, `${formatAltitude(alt, lang)}, ${formatAzimuth(az)} ${compassName(az, lang)}`, alt < 0 ? "v k" : "v");

  const phase = capitalize(m.phases[moon.phaseName]);
  const pct = Math.round(moon.illumination * 100);
  const pctText = m.percent(pct);
  const waning = moon.phaseAngle >= 180;
  const quarters = moon.nextQuarters
    .map((q, i) => {
      const rel = i === 0 ? ` <span class="k">${formatRelative(q.time.getTime() - t.getTime(), lang)}</span>` : "";
      return row(m.quarters[q.quarter]!, `${formatDateTime(q.time, tz)}${rel}`);
    })
    .join("");

  const year = zonedParts(t, tz).year;
  const s = seasons(year);
  // Season names follow the hemisphere of the place.
  const south = place.lat < 0;
  const seasonRows = [
    [south ? main.autumnEquinox : main.springEquinox, s.marchEquinox],
    [south ? main.winterSolstice : main.summerSolstice, s.juneSolstice],
    [south ? main.springEquinox : main.autumnEquinox, s.septemberEquinox],
    [south ? main.summerSolstice : main.winterSolstice, s.decemberSolstice],
  ] as const;

  return `<div class="screen day">
<div class="day-top">
${carousel(renderDial(t, tz, sun, moon, lang), renderHorizon(t, place, sun, moon, state.direction.azimuth, lang), state.slide, lang)}
<div class="info">
<div class="col">${eventsSection(dayEvents(t, place, sun, moon), t, tz, lang)}</div>
<div class="col">
<section><h2 class="h2">${main.whereNow}</h2>
${where(main.sun, sun.position.altitude, sun.position.azimuth)}
${where(main.moon, moon.position.altitude, moon.position.azimuth)}
</section>
<section><h2 class="h2">${main.moon}</h2>
<div class="moon">
<svg width="104" height="104" viewBox="0 0 120 120" role="img" aria-label="${main.moonAria(waning, pctText)}">
<circle cx="60" cy="60" r="54" fill="${COLORS.moonDark}"/>
<path d="${moonDiscPath(moon.illumination, moon.phaseAngle, 60, 60, 54, south)}" fill="${COLORS.moonLit}"/>
</svg>
<div><div class="phase">${phase}</div><div class="v">${main.illumination(pctText)}</div><div class="v k">${main.age(formatAge(moon.ageMs, lang))}</div></div>
</div>
${quarters}
</section>
<section><h2 class="h2">${main.seasons(year)}</h2>
${seasonRows.map(([name, d]) => row(name, formatDateTime(d, tz))).join("")}
</section>
${directionSection(t, place, state.direction, lang)}
</div>
</div>
</div>
${renderSky(t, place, lang)}
${appFooter(lang)}
${bottomBar(place, t, state.step, lang)}
</div>`;
}
