// Footer of both screens: the app's name and version, then links to the source on GitHub, the privacy notice
// (in the README) and the license texts shipped with the build.
import { version } from "../../package.json";
import { messages, type Lang } from "../i18n.ts";

const REPO = "https://github.com/McAvity/is-it-dark-yet";

export function appFooter(lang: Lang): string {
  const m = messages(lang);
  const l = m.location;
  return `<footer class="app-info">
<div class="app-name"><img src="./icon.svg" alt="" width="22" height="22">${m.appTitle} <span class="k">v${version}</span></div>
<div class="links"><a href="${REPO}">GitHub</a><a href="${REPO}#privacy">${l.privacy}</a><a href="./licenses.txt">${l.licenses}</a></div>
</footer>`;
}
