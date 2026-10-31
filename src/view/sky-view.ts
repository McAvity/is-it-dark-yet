// The "Sky" section below the main screen: light today, tonight, the Moon, coming events, reference values.
// Pure: everything comes from the instant, the place and the language.
import { sunUpIntervals, type Place } from "../astro.ts";
import { moonDistance, night, photoLight, reference, upcoming, type PhotoKind, type PlanetName, type Span, type Upcoming } from "../sky.ts";
import { formatDate, formatDuration, formatKm, formatTime } from "../format.ts";
import { messages, type Lang } from "../i18n.ts";
import { fromZoned, zonedDayMs, zonedParts } from "../time.ts";

const PLANET_COLORS: Record<PlanetName, string> = {
  mercury: "#B8B2A6", venus: "#FFF6D8", mars: "#E07A5F", jupiter: "#F1E3C6", saturn: "#E8D9A8",
};

// A horizontal bar over [start, end) with one layer of spans per class; drawn only, the text says the same.
function bar(cls: string, start: number, end: number, layers: [string, Span[]][]): string {
  const pct = (ms: number) => ((Math.min(Math.max(ms, start), end) - start) / (end - start)) * 100;
  const marks = layers.flatMap(([c, spans]) =>
    spans.map(([a, b]) => `<i class="${c}" style="left:${pct(a).toFixed(2)}%;width:${(pct(b) - pct(a)).toFixed(2)}%"></i>`),
  );
  return `<div class="${cls}" aria-hidden="true">${marks.join("")}</div>`;
}

// Labels under a bar: at the ends, and in between at given positions.
function ticks(start: number, end: number, ends: [string, string] | null, inner: [number, string][]): string {
  const at = inner
    .filter(([ms]) => ms > start && ms < end)
    .map(([ms, text]) => `<span class="mid" style="left:${(((ms - start) / (end - start)) * 100).toFixed(2)}%">${text}</span>`);
  const sides = ends ? `<span>${ends[0]}</span><span>${ends[1]}</span>` : "";
  return `<div class="ticks v" aria-hidden="true">${sides}${at.join("")}</div>`;
}

const range = (from: Date | number, to: Date | number, tz: string) => `${formatTime(new Date(from), tz)}–${formatTime(new Date(to), tz)}`;

function lightGroup(t: Date, place: Place, lang: Lang): string {
  const { sky } = messages(lang);
  const tz = place.timeZone;
  const [start, end] = zonedDayMs(t, tz);
  const list = photoLight(t, place);
  const spans = (kind: PhotoKind): Span[] => list.filter((p) => p.kind === kind).map((p) => [p.from.getTime(), p.to.getTime()]);
  const up = sunUpIntervals(t, place).map(([a, b]): Span => [a.getTime(), b.getTime()]);
  const { year, month, day } = zonedParts(t, tz);
  const hours = [6, 12, 18].map((h): [number, string] => [fromZoned(year, month, day, h, 0, tz).getTime(), String(h).padStart(2, "0")]);
  const cell = (morning: boolean, kind: PhotoKind) => {
    const found = list.filter((p) => p.morning === morning && p.kind === kind);
    return found.length ? `<span class="v">${range(found[0]!.from, found[found.length - 1]!.to, tz)}</span>` : `<span class="k">—</span>`;
  };
  return `<div class="grp">
<h3 class="h2">${sky.light}</h3>
<div>${bar("strip", start, end, [["up", up], ["blue", spans("blue")], ["golden", spans("golden")]])}${ticks(start, end, null, hours)}</div>
<div class="photo">
<span></span><span class="key k blue">${sky.blue}</span><span class="key k golden">${sky.golden}</span>
<span class="k">${sky.morning}</span>${cell(true, "blue")}${cell(true, "golden")}
<span class="k">${sky.evening}</span>${cell(false, "blue")}${cell(false, "golden")}
</div>
</div>`;
}

const dotSize = (mag: number) => Math.round(Math.min(20, Math.max(8, 12 - 2 * mag)));

function nightGroup(t: Date, place: Place, lang: Lang): string {
  const { sky } = messages(lang);
  const tz = place.timeZone;
  const n = night(t, place);
  const [start, end] = [n.from.getTime(), n.to.getTime()];
  const darkMs = n.dark.reduce((sum, [a, b]) => sum + (b - a), 0);
  const head = n.dark.length
    ? `<div class="k small">${sky.dark}</div><div class="big v">${n.dark.map(([a, b]) => range(a, b, tz)).join(", ")}</div><div class="k small">${formatDuration(darkMs, lang)}</div>`
    : `<div class="big-note">${n.night.length ? sky.moonAllNight : sky.noNight}</div>`;
  const midnight = zonedDayMs(n.to, tz)[0];
  const planets = n.planets.length
    ? n.planets.map((p) => {
        const s = dotSize(p.magnitude);
        return `<div class="planet"><span class="dot" style="width:${s}px;height:${s}px;background:${PLANET_COLORS[p.name]}"></span><span class="t">${sky.planets[p.name]}<small>${sky.constellations[p.constellation] ?? p.constellation}</small></span><span class="v">${range(p.from, p.to, tz)}</span></div>`;
      }).join("")
    : `<p class="k empty">${sky.noPlanets}</p>`;
  return `<div class="grp">
<h3 class="h2">${sky.tonight}</h3>
<div>${head}</div>
<div>${bar("nbar", start, end, [["night", n.night], ["moon-up", n.moonUp], ["dark", n.dark]])}${ticks(start, end, [formatTime(n.from, tz), formatTime(n.to, tz)], [[midnight, "00:00"]])}</div>
<div>${planets}</div>
</div>`;
}

function moonGroup(t: Date, tz: string, lang: Lang): string {
  const { sky } = messages(lang);
  const d = moonDistance(t);
  const pos = Math.min(100, Math.max(0, ((d.km - d.perigee.km) / (d.apogee.km - d.perigee.km)) * 100));
  const apsides = [
    [sky.apogee, d.apogee] as const,
    [sky.perigee, d.perigee] as const,
  ].sort((a, b) => a[1].time.getTime() - b[1].time.getTime());
  return `<div class="grp">
<h3 class="h2">${messages(lang).main.moon}</h3>
<div>
<div class="k small">${sky.distanceNow}</div>
<div class="big v">${formatKm(d.km, lang)}</div>
<div class="gauge" aria-hidden="true"><b style="left:${pos.toFixed(1)}%"></b></div>
<div class="gauge-l k"><span>${sky.closer}</span><span>${sky.farther}</span></div>
</div>
<div>${apsides.map(([name, a]) => `<div class="row"><span>${name}</span><span class="v">${formatDate(a.time, tz)}, ${formatKm(a.km, lang)}</span></div>`).join("")}</div>
</div>`;
}

function upcomingText(e: Upcoming, tz: string, lang: Lang): [string, string] {
  const m = messages(lang);
  const sky = m.sky;
  const time = formatTime(e.time, tz);
  switch (e.kind) {
    case "supermoon": return [sky.supermoon, sky.fullMoon(time, formatKm(e.km, lang))];
    case "elongation": return [sky.elongation(e.body, e.morning), sky.fromSun(Math.round(e.degrees))];
    case "lunarEclipse": return [sky.lunarEclipse[e.type], sky.peak(time)];
    case "solarEclipse": return [sky.solarEclipse[e.type], `${sky.obscured(m.percent(Math.round(e.obscuration * 100)))}, ${sky.peak(time)}`];
  }
}

function upcomingGroup(t: Date, place: Place, lang: Lang): string {
  const { sky } = messages(lang);
  const tz = place.timeZone;
  const list = upcoming(t, place);
  const perColumn = Math.ceil(list.length / 2);
  const rows = list.map((e, i) => {
    const [what, detail] = upcomingText(e, tz, lang);
    // The last row of the first column loses its rule when the list splits into two columns.
    return `<div class="ev${i === perColumn - 1 ? " col-end" : ""}"><span class="d v">${formatDate(e.time, tz)}</span><span class="w">${what}<small>${detail}</small></span></div>`;
  });
  return `<div class="grp up">
<h3 class="h2">${sky.upcoming}</h3>
<div class="ev-list" style="--rows:${perColumn}">${rows.join("")}</div>
</div>`;
}

function referenceGroup(t: Date, place: Place, lang: Lang): string {
  const { sky } = messages(lang);
  const r = reference(t, place);
  const name = (latin: string) => sky.constellations[latin] ?? latin;
  const minutes = Math.floor(r.siderealHours * 60) % 1440;
  const lst = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `<div class="grp">
<h3 class="h2">${sky.curious}</h3>
<div>
<div class="row"><span>${sky.sunIn}</span><span>${name(r.sunConstellation)}</span></div>
<div class="row"><span>${sky.moonIn}</span><span>${name(r.moonConstellation)}</span></div>
<div class="row"><span>${sky.sidereal}</span><span class="v">${lst}</span></div>
</div>
</div>`;
}

export function renderSky(t: Date, place: Place, lang: Lang): string {
  const { sky } = messages(lang);
  return `<section class="sky" aria-label="${sky.heading}">
<h2 class="sky-title">${sky.heading}</h2>
<div class="sky-grid">
${lightGroup(t, place, lang)}
${nightGroup(t, place, lang)}
${moonGroup(t, place.timeZone, lang)}
${upcomingGroup(t, place, lang)}
${referenceGroup(t, place, lang)}
</div>
</section>`;
}
