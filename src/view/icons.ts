// Inline SVG icons used on more than one screen.
import { COLORS } from "./colors.ts";

// Crosshair: "use my location".
export const gpsIcon = (size: number, cls = "") =>
  `<svg${cls ? ` class="${cls}"` : ""} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${COLORS.sun}" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`;
