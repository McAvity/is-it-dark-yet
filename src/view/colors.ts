// Colours of the SVG drawings and inline marks; keep in step with the custom properties on :root in styles.css.
import type { LightState } from "../astro.ts";

export const COLORS = {
  bg: "#101B33", // page background
  panel: "#17264A", // pills, fields
  line: "#22325A", // hairlines, grid
  text: "#E9EEF7",
  muted: "#A3B1CC",
  sun: "#F2CF4A",
  moon: "#C9CFDB",
  moonDark: "#26324F", // unlit part of the moon disc
  moonLit: "#D9DDE6",
  now: "#FF4D4F", // the "now" marker on the dial
} as const;

export const LIGHT_COLORS: Record<LightState, string> = {
  day: COLORS.sun,
  civil: "#E8833A",
  nautical: "#2E8F9C",
  astronomical: "#3557B0",
  night: "#0A1226",
};
