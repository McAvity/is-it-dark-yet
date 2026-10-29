// 24 h dial SVG: light ring, moon ring, marker for "now" and the day-length centre.
import type { MoonInfo, SunInfo } from "../astro.ts";
import { formatClock, formatDelta, formatDuration, lightLabel } from "../format.ts";
import { messages, type Lang } from "../i18n.ts";
import { DIAL_CENTER as C, dialArc, dialArrow, dialPoint, lightSegments, moonSegments } from "../geometry.ts";
import { zonedHours } from "../time.ts";
import { COLORS, LIGHT_COLORS } from "./colors.ts";

// Join the last and first segment when they continue across midnight, so the ring has no seam at 0.
function joinAcrossMidnight<T extends { from: number; to: number }>(segs: T[], same: (a: T, b: T) => boolean): T[] {
  if (segs.length < 2) return segs;
  const first = segs[0]!, last = segs[segs.length - 1]!;
  if (first.from !== 0 || last.to !== 24 || !same(first, last)) return segs;
  return [{ ...last, to: first.to }, ...segs.slice(1, -1)];
}

// Pill for the light label: sized from the label, at most 186 px wide (smaller type for long labels),
// placed so its rounded ends stay inside r < 100 of the centre, clear of the moon ring (r 104–110).
export function pillLayout(label: string): { width: number; height: number; y: number; fontSize: number } {
  const n = label.length;
  const fontSize = n <= 19 ? 14 : n <= 21 ? 13 : 12;
  const width = Math.min(186, Math.max(76, Math.round(n * fontSize * 0.6 + 20)));
  return { width, height: 26, y: 114, fontSize };
}

// "Now": a thin line across the light and moon rings, with an arrow on each side pointing at them.
// Nothing reaches the centre, so the text there stays clear; the arrows are short for the same reason.
function nowMarker(hour: number): string {
  // The line runs into both arrowheads (to just short of their bases), so they join it without a step.
  const [x1, y1] = dialPoint(hour, 95);
  const [x2, y2] = dialPoint(hour, 158);
  return `<g class="now"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${COLORS.now}" stroke-width="2"/><polygon points="${dialArrow(hour, 150, 1)}" fill="${COLORS.now}"/><polygon points="${dialArrow(hour, 103, -1)}" fill="${COLORS.now}"/></g>`;
}

export function renderDial(t: Date, tz: string, sun: SunInfo, moon: MoonInfo, lang: Lang): string {
  const m = messages(lang);
  const label = lightLabel(sun.light, sun.rising, lang);
  const ring = joinAcrossMidnight(lightSegments(sun, tz), (a, b) => a.kind === b.kind)
    .map((s) => {
      const stroke = s.kind === "night" ? ` stroke="${COLORS.line}"` : "";
      return `<path d="${dialArc(s.from, s.to, 118, 148)}" fill="${LIGHT_COLORS[s.kind]}"${stroke}/>`;
    })
    .join("");
  const moonRing = joinAcrossMidnight(moonSegments(moon, tz), () => true)
    .map((s) => `<path d="${dialArc(s.from, s.to, 104, 110)}" fill="${COLORS.moon}" opacity="0.85"/>`)
    .join("");
  const now = zonedHours(t, tz);

  // Centre: day length in big type, with its label and the change since yesterday below.
  let big = "—";
  let sub = m.dial.daylight;
  let delta = "";
  if (sun.polar === "night") [big, sub] = [m.dial.polarNight, m.dial.noRise];
  else if (sun.polar === "day") [big, sub] = [m.dial.polarDay, m.dial.noSet];
  else if (sun.daylightMs !== null) {
    big = formatDuration(sun.daylightMs, lang);
    if (sun.daylightDeltaMs !== null) delta = formatDelta(sun.daylightDeltaMs, lang);
  }

  // Dark text on bright fills.
  const pill = pillLayout(label);
  const bright = sun.light === "day" || sun.light === "civil";
  const pillFill = sun.light === "night" ? COLORS.panel : LIGHT_COLORS[sun.light];

  return `<svg class="dial" width="340" height="340" viewBox="-10 -10 340 340" role="img" aria-label="${m.dial.aria(formatClock(t, tz), label, big, delta ? `${sub} ${delta}` : sub)}">
${ring}${moonRing}
<g fill="${COLORS.muted}" font-size="13" font-weight="600" text-anchor="middle"><text x="${C}" y="329">0</text><text x="1" y="164">6</text><text x="${C}" y="-1">12</text><text x="319" y="164">18</text></g>
${nowMarker(now)}
<rect x="${C - pill.width / 2}" y="${pill.y}" width="${pill.width}" height="${pill.height}" rx="${pill.height / 2}" fill="${pillFill}"/>
<text x="${C}" y="${pill.y + 18}" text-anchor="middle" fill="${bright ? COLORS.bg : COLORS.text}" font-size="${pill.fontSize}" font-weight="700">${label}</text>
<text class="dial-big" x="${C}" y="196" text-anchor="middle" fill="${COLORS.text}" font-size="${big.length > 13 ? 23 : big.length > 11 ? 26 : 30}" font-weight="800">${big}</text>
<text x="${C}" y="216" text-anchor="middle" fill="${COLORS.muted}" font-size="14">${sub}</text>
${delta ? `<text x="${C}" y="234" text-anchor="middle" fill="${COLORS.muted}" font-size="14">${delta}</text>` : ""}
</svg>`;
}
