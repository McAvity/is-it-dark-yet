// 360° horizon panorama: sun and moon paths for the local day, current positions, rise/set ticks.
import type { MoonInfo, Place, SunInfo } from "../astro.ts";
import { formatAzimuth } from "../format.ts";
import { messages, type Lang } from "../i18n.ts";
import { HORIZON_W as W, HORIZON_Y as Y, horizonCenter, horizonX, horizonY, skyPath } from "../geometry.ts";
import { Body } from "../vendor/astronomy.ts";
import { COLORS, LIGHT_COLORS } from "./colors.ts";

const dotY = (alt: number) => Math.min(2 * Y, Math.max(0, horizonY(alt)));

function tick(az: number | null, len: number, color: string, center: number): string {
  return az === null ? "" : `<path d="M${horizonX(az, center)},${Y} l0,-${len}" stroke="${color}"/>`;
}

// The direction picked in the sun-direction section: a faint dashed line with its azimuth on top.
function directionLine(az: number, center: number): string {
  const x = horizonX(az, center);
  const labelX = Math.min(340, Math.max(18, x));
  return `<line class="dir" x1="${x}" y1="0" x2="${x}" y2="${Y}" stroke="${COLORS.sun}" stroke-opacity="0.6" stroke-width="1.5" stroke-dasharray="4 4"/>
<text x="${labelX}" y="8" font-size="11" fill="${COLORS.sun}" fill-opacity="0.75" text-anchor="middle">${formatAzimuth(az)}</text>`;
}

export function renderHorizon(
  t: Date, place: Place, sun: SunInfo, moon: MoonInfo, direction: number | undefined, lang: Lang,
): string {
  const sp = sun.position;
  const mp = moon.position;
  const { horizon: h, main } = messages(lang);
  const where = (alt: number) => (alt < 0 ? h.below : h.above(String(Math.round(alt))));
  const aria = h.aria(formatAzimuth(sp.azimuth), where(sp.altitude), formatAzimuth(mp.azimuth), where(mp.altitude));
  const [n, e, so, w] = h.axis;
  // Mid-chart is where the sun is highest today: south, or north (southern hemisphere, tropics part of the year).
  const center = horizonCenter(t, place);
  const labels = center === 180 ? [n, e, so, w, n] : [so, w, n, e, so];
  const grid = [W / 4, W / 2, (3 * W) / 4]; // the compass points between the edges
  return `<svg class="horizon" width="${W}" height="284" viewBox="0 -4 ${W} 284" role="img" aria-label="${aria}">
<defs><clipPath id="sky"><rect x="0" y="0" width="${W}" height="${2 * Y}"/></clipPath></defs>
<rect x="0" y="${Y}" width="${W}" height="${Y}" fill="${LIGHT_COLORS.night}"/>
<line x1="0" y1="${Y}" x2="${W}" y2="${Y}" stroke="${COLORS.muted}" stroke-width="1.5"/>
<g stroke="${COLORS.line}" stroke-width="1">${grid.map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="${Y}"/>`).join("")}</g>
${direction === undefined ? "" : directionLine(direction, center)}
<g clip-path="url(#sky)" fill="none">
<path d="${skyPath(Body.Moon, t, place, center)}" stroke="${COLORS.moon}" stroke-width="2" stroke-dasharray="5 4"/>
<path d="${skyPath(Body.Sun, t, place, center)}" stroke="${COLORS.sun}" stroke-width="3"/>
</g>
<circle cx="${horizonX(sp.azimuth, center)}" cy="${dotY(sp.altitude)}" r="9" fill="${COLORS.sun}" stroke="${COLORS.bg}" stroke-width="3"/>
<circle cx="${horizonX(mp.azimuth, center)}" cy="${dotY(mp.altitude)}" r="7" fill="${COLORS.bg}" stroke="${COLORS.moon}" stroke-width="2"/>
<g stroke-width="2">${tick(sun.riseAzimuth, 10, COLORS.text, center)}${tick(sun.setAzimuth, 10, COLORS.text, center)}${tick(moon.riseAzimuth, 8, COLORS.moon, center)}${tick(moon.setAzimuth, 8, COLORS.moon, center)}</g>
<g font-size="12" fill="${COLORS.muted}" text-anchor="middle">${[8, ...grid, W - 10].map((x, i) => `<text x="${x}" y="260">${labels[i]}</text>`).join("")}</g>
</svg>
<div class="k legend"><span><i class="sw-sun"></i>${main.sun}</span><span><i class="sw-moon"></i>${main.moon}</span><span>${h.ticks}</span>${direction === undefined ? "" : `<span><i class="sw-dir"></i>${h.direction}</span>`}</div>`;
}
