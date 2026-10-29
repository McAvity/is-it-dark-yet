// <option> list for a <select>, with `selected` marked.
import { escapeHtml } from "./escape.ts";

export function options<T extends string | number>(values: readonly T[], selected: T, label: (v: T) => string): string {
  return values
    .map((v) => `<option value="${escapeHtml(String(v))}"${v === selected ? " selected" : ""}>${label(v)}</option>`)
    .join("");
}
