import { expect, test } from "bun:test";
import { lightLabel } from "../format.ts";
import { LANGS } from "../i18n.ts";
import { pillLayout } from "./dial.ts";

test("dial pill stays inside the moon ring for every light label in every language", () => {
  const states = ["day", "night", "civil", "nautical", "astronomical"] as const;
  for (const { code } of LANGS) {
    for (const st of states) {
      for (const rising of [true, false]) {
        const label = lightLabel(st, rising, code);
        const p = pillLayout(label);
        expect(p.width, label).toBeLessThanOrEqual(190);
        expect(p.fontSize).toBeGreaterThanOrEqual(12);
        // Rounded ends: the corner circles (radius h/2) must stay within r < 100 of the dial centre.
        const r = p.height / 2;
        const cx = p.width / 2 - r;
        const cy = Math.max(Math.abs(160 - (p.y + r)), Math.abs(160 - (p.y + p.height - r)));
        expect(Math.hypot(cx, cy) + r, label).toBeLessThan(100);
      }
    }
  }
});
