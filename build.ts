// Builds a fully static site into dist/. All references are relative, so it works under any path.
import { cp, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: ["src/main.ts"],
  outdir: "dist",
  target: "browser",
  minify: true,
  sourcemap: "linked",
  // Minifying drops the vendored file's header, but its MIT license asks for the notice in every copy:
  // point at licenses.txt, written below with the full texts.
  banner: "/*! is-it-dark-yet (MIT). Includes Astronomy Engine, (c) 2019-2025 Don Cross (MIT). Licenses: ./licenses.txt */",
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
await Bun.write("dist/index.html", Bun.file("src/index.html"));
await Bun.write("dist/styles.css", Bun.file("src/styles.css"));
await cp("src/fonts", "dist/fonts", { recursive: true });
// Full license texts of this app and of Astronomy Engine (taken from the vendored file's header).
const vendor = await Bun.file("src/vendor/astronomy.ts").text();
const engine = vendor.slice(vendor.indexOf("MIT License"), vendor.indexOf("*/")).replace(/^ {4}/gm, "").trim();
if (!engine.includes("Don Cross")) throw new Error("Astronomy Engine license header not found");
await Bun.write(
  "dist/licenses.txt",
  `is-it-dark-yet\n\n${(await Bun.file("LICENSE").text()).trim()}\n\n----\n\nAstronomy Engine (https://github.com/cosinekitty/astronomy)\n\n${engine}\n\n----\n\nArchivo typeface: SIL Open Font License 1.1, see fonts/OFL.txt\n`,
);
console.log("built:", result.outputs.map((o) => o.path.replace(process.cwd() + "/", "")).join(", "), "+ dist/index.html, dist/styles.css, dist/fonts/, dist/licenses.txt");
