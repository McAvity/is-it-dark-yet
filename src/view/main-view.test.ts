// Reference values for Poznań, 2026-11-01 15:25 CET, checked against an independent sun and moon app.
import { describe, expect, test } from "bun:test";
import { sunInfo, type Place } from "../astro.ts";
import { sunDirectionWindows } from "../direction.ts";
import { horizonX } from "../geometry.ts";
import { formatTime } from "../format.ts";
import type { Lang } from "../i18n.ts";
import { LIGHT_COLORS } from "./colors.ts";
import { renderMain } from "./main-view.ts";
import { version } from "../../package.json";
import { LISBON, NORTH_POLE, POZNAN, SYDNEY, TROMSO, mainState } from "../test-fixtures.ts";


describe("renderMain, Poznań 2026-11-01 15:25", () => {
  const html = renderMain(mainState(POZNAN));

  test("shows the reference values", () => {
    for (const s of [
      "06:48", "113°", "16:23", "247°", "22:12", "9 h 35 min",
      "Ubywający garb", "53%", "21 d 22 h 34 min", "2026-11-24 15:54", "Pory roku 2026",
    ]) {
      expect(html).toContain(s);
    }
  });

  test("ends with the app's version and the GitHub, privacy and license links", () => {
    const footer = html.slice(html.indexOf('<footer class="app-info">'), html.indexOf("</footer>"));
    expect(footer).toContain(`v${version}`);
    expect(footer).toContain('<a href="https://github.com/McAvity/is-it-dark-yet">GitHub</a>');
    expect(footer).toContain('<a href="./licenses.txt">Licencje</a>');
  });

  test("sections appear in order", () => {
    const marks = [
      'class="track"', "Tarcza doby", "Horyzont", "Przebieg doby", "Gdzie są teraz",
      ">Księżyc</h2>", "Pory roku 2026", "Kiedy Słońce będzie z kierunku…",
      'class="bar"', 'href="#location"', "Z wyszukiwarki|Ręcznie|Z GPS", 'name="date"', 'name="time"',
    ];
    let last = -1;
    for (const m of marks) {
      const i = Math.min(...m.split("|").map((x) => html.indexOf(x)).filter((x) => x >= 0));
      expect(Number.isFinite(i)).toBe(true);
      expect(i).toBeGreaterThan(last);
      last = i;
    }
  });

  test("bottom bar holds the location link and the time controls", () => {
    const bar = html.slice(html.indexOf('class="bar"'));
    for (const s of ['href="#location"', 'data-action="gps"', 'name="date"', 'name="time"', 'name="step"', 'data-action="now"']) {
      expect(bar).toContain(s);
    }
    expect(html.match(/href="#location"/g)?.length).toBe(1);
    expect(html).not.toContain("<header");
  });

  test("location row shows source, zone and offset", () => {
    expect(html).toContain("Ręcznie, Europe/Warsaw, UTC+1, latem UTC+2");
  });

  test("day events: twilights, sun and moon in one list, sorted by time, with azimuths", () => {
    const section = html.slice(html.indexOf("Przebieg doby"), html.indexOf("Gdzie są teraz"));
    expect(section).not.toContain("według kierunku");
    for (const a of ["113°", "306°", "247°", "58°"]) expect(section).toContain(`>${a}<`);
    const order = [
      "04:52</b>", "05:21</b>", "05:32</b>", "06:12</b>", "06:48</b>", "11:36</b>", "13:38</b>", "16:23</b>", "16:59</b>", "17:39</b>", "18:19</b>", "22:12</b>",
    ].map((x) => section.indexOf(x));
    for (const i of order) expect(i).toBeGreaterThan(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(section.match(/<div class="event[ "]/g)).toHaveLength(12);
    expect(section).toContain('<b class="v when">11:36</b><span class="sym" style="color:#F2CF4A">☉\uFE0E</span><span class="what">Górowanie Słońca</span><span class="v az">180°</span>');
    expect(section).toContain('<span class="what">Górowanie Księżyca</span>');
    expect(section).toContain(`<span class="swatch square" style="background:${LIGHT_COLORS.astronomical}"></span><span class="what">Świt astronomiczny</span>`);
    expect(section).not.toContain("temu");
    expect(section).toContain(`<span class="sym" style="color:${LIGHT_COLORS.day}">☉\uFE0E</span><span class="what">Zachód Słońca</span>`);
    expect(section).toContain('<span class="sym" style="color:#C9CFDB">☽\uFE0E</span><span class="what">Wschód Księżyca');
    // Before 15:25 dimmed, after not.
    expect(section).toContain('<div class="event past"><b class="v when">13:38</b>');
    expect(section).toContain('<div class="event"><b class="v when">16:23</b>');
  });

  test("day length change is a delta under the day length", () => {
    expect(html).toContain(">dnia<");
    expect(html).toContain(">Δ −3 min 43 s<");
  });

  test("night across midnight is one arc, moon up across midnight is one arc", () => {
    expect(html.split(`fill="${LIGHT_COLORS.night}" stroke=`).length - 1).toBe(1);
    expect(html.split('fill="#C9CFDB" opacity="0.85"').length - 1).toBe(1);
  });

  test("now is marked on the rings only: a red line with an arrow on each side, nothing from the centre", () => {
    const now = html.match(/<g class="now">([\s\S]*?)<\/g>/)![1]!;
    expect(now.match(/<polygon /g)).toHaveLength(2);
    const [x1, y1, x2, y2] = now.match(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/)!.slice(1).map(Number) as [number, number, number, number];
    expect(Math.round(Math.hypot(x1 - 160, y1 - 160))).toBe(95);
    expect(Math.round(Math.hypot(x2 - 160, y2 - 160))).toBe(158);
    expect(html).not.toContain('x1="160" y1="160"');
  });

  test("first quarter shows a relative time", () => {
    expect(html).toContain("za 6 h 4 min");
  });

  test("DOM event contract", () => {
    for (const s of [
      'data-action="step-back"', 'data-action="step-forward"', 'data-action="now"',
      'data-action="tab-dial"', 'data-action="tab-horizon"', 'name="step"', 'name="time"',
      'value="2026-11-01"', 'value="15:25"', '<option value="hour" selected>', '<option value="month">1 mies.</option><option value="year">1 rok</option>',
    ]) {
      expect(html).toContain(s);
    }
  });
});

test("Lisbon shows sunrise in Lisbon time", () => {
  const s = mainState(LISBON);
  const html = renderMain(s);
  const rise = formatTime(sunInfo(s.instant, LISBON).rise!, "Europe/Lisbon");
  expect(html).toContain(`>${rise}</b>`);
  expect(html).toContain("value=\"14:25\"");
});

test("place name is escaped", () => {
  const html = renderMain(mainState({ ...POZNAN, name: "<b>Dom</b>" }));
  expect(html).toContain("&lt;b&gt;Dom&lt;/b&gt;");
  expect(html).not.toContain("<b>Dom");
});

test("Tromsø polar night", () => {
  const html = renderMain(mainState(TROMSO, new Date("2026-12-21T11:00:00Z")));
  expect(html).toContain("Noc polarna");
  expect(html).toContain('Słońce nie wschodzi <span class="k">(górowanie)</span>');
  expect(html).not.toContain("Wschód Słońca");
});

test("Tromsø polar night ring shows twilight bands", () => {
  const html = renderMain(mainState(TROMSO, new Date("2026-12-21T11:00:00Z")));
  for (const c of [LIGHT_COLORS.civil, LIGHT_COLORS.nautical, LIGHT_COLORS.astronomical, LIGHT_COLORS.night]) {
    expect(html).toMatch(new RegExp(`<path[^>]*fill="${c}"`));
  }
  expect(html).not.toMatch(new RegExp(`<path[^>]*fill="${LIGHT_COLORS.day}"`));
});

test("polar night: the sun's one row stands at its highest, between civil dawn and civil dusk", () => {
  const html = renderMain(mainState(TROMSO, new Date("2026-12-21T11:00:00Z")));
  const section = html.slice(html.indexOf("Przebieg doby"), html.indexOf("Gdzie są teraz"));
  const labels = [...section.matchAll(/<span class="what">([^<]+)</g)].map((x) => x[1]!.trim()).filter((l) => !l.includes("Księżyc"));
  expect(labels).toEqual([
    "Świt astronomiczny", "Świt żeglarski", "Świt cywilny", "Słońce nie wschodzi",
    "Zmierzch cywilny", "Zmierzch żeglarski", "Zmierzch astronomiczny",
  ]);
  expect(section).toContain('<b class="v when">11:42</b>');
  expect(section).toMatch(/Słońce nie wschodzi <span class="k">\(górowanie\)<\/span><\/span><span class="v az">180°/);
});

test("a moon that neither rises nor sets gets one row", () => {
  // Tromsø, 21–25 December 2026: the moon is near its northernmost and stays above the horizon all day.
  for (const date of ["2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24", "2026-12-25", "2026-12-26", "2026-12-27"]) {
    const html = renderMain(mainState(TROMSO, new Date(`${date}T11:00:00Z`)));
    const moonRows = [...html.matchAll(/<span class="what">([^<]*Księżyc[^<]*)</g)].map((x) => x[1]);
    const allDay = moonRows.filter((l) => l!.includes("Księżyc nie "));
    expect(allDay.length, date).toBe(moonRows.some((l) => l!.startsWith("Wschód") || l!.startsWith("Zachód")) ? 0 : 1);
  }
});

test("North Pole 2026-09-25 shows daylight until the last sunset and a long delta", () => {
  const pole = NORTH_POLE;
  const html = renderMain(mainState(pole, new Date("2026-09-25T06:12:00Z")));
  expect(html).toContain("5 h 16 min");
  expect(html).toContain(">Δ −18 h 44 min<");
  expect(html).not.toContain(">—</text>");
});

test("North Pole 2026-09-26 ring is civil twilight all day, pill not 'Dzień'", () => {
  const pole = NORTH_POLE;
  const html = renderMain(mainState(pole, new Date("2026-09-26T06:12:00Z")));
  expect(html).toContain(`fill="${LIGHT_COLORS.civil}"`);
  expect(html.split(`fill="${LIGHT_COLORS.night}" stroke=`).length - 1).toBe(0);
  expect(html).not.toContain(">Dzień</text>");
  expect(html).toContain(">Zmierzch cywilny</text>");
});

describe("sun direction section", () => {
  test("shows computed windows for azimuth 200 ±5", () => {
    const s = mainState(POZNAN);
    const html = renderMain(s);
    expect(html).not.toContain("Wersja poglądowa");
    expect(html).not.toContain("readonly");
    const w = sunDirectionWindows(s.instant, POZNAN, 200, 5);
    expect(w.length).toBe(1);
    const tz = "Europe/Warsaw";
    expect(html).toContain(`${formatTime(w[0]!.from, tz)}–${formatTime(w[0]!.to, tz)}`);
    expect(html).toContain(`dokładnie ${formatTime(w[0]!.exact!, tz)}`);
    expect(formatTime(w[0]!.exact!, tz)).toMatch(/^12:5[345]$/);
    expect(html).toContain("21,");
    expect(html).toMatch(/<input[^>]*name="dir-az"[^>]*value="200"/);
    expect(html).toContain('<span class="v compass" data-live>płd.</span>');
    expect(html).toContain('<option value="5" selected>±5°</option>');
    for (const t of [2, 10, 20]) expect(html).toContain(`<option value="${t}">±${t}°</option>`);
  });

  test("no window gives a message", () => {
    const html = renderMain(mainState(POZNAN, undefined, { azimuth: 0, tolerance: 5 }));
    expect(html).toContain("W tej dobie Słońce nie świeci z kierunku 0° (±5°).");
  });

  test("horizon draws the chosen direction", () => {
    const html = renderMain(mainState(POZNAN));
    expect(html).toContain(`<line class="dir" x1="${horizonX(200)}" y1="0" x2="${horizonX(200)}" y2="120"`);
    expect(html).toMatch(/<text[^>]*>200°<\/text>/);
    expect(html).toContain('<i class="sw-dir"></i>Wybrany kierunek');
  });

  // Axis labels left to right: mid-chart is where the sun is highest (south up north, north down south).
  const axis = (html: string) => [...html.matchAll(/<text x="[\d.]+" y="260">([^<]+)<\/text>/g)].map((x) => x[1]).join(" ");
  test("horizon is centred on south in the northern hemisphere", () => {
    expect(axis(renderMain(mainState(POZNAN)))).toBe("Pn Wsch Pd Zach Pn");
  });
  test("horizon is centred on north in the southern hemisphere", () => {
    const html = renderMain(mainState(SYDNEY));
    expect(axis(html)).toBe("Pd Zach Pn Wsch Pd");
    expect(html).toContain(`<line class="dir" x1="${horizonX(200, 0)}" y1="0"`);
  });



});

describe("other languages", () => {
  const render = (lang: Lang) => renderMain(mainState(POZNAN, undefined, undefined, lang));
  const POLISH = ["Wschód", "Zachód", "Księżyc", "Słońce", "Świt", "zmierzch", "Pory roku", "Ręcznie", "latem", "Teraz",
    "nad horyzontem", "Tarcza", "dokładnie", "Dokładność", "godz.", "dnia", "płd."];

  test("English has no Polish words", () => {
    const html = render("en");
    for (const s of ["Sunrise", "Sunset", "Moonrise", "06:48", "in 6 h 4 min", "Waning gibbous", "Seasons 2026", "When is the Sun at this bearing…", "Positions now",
      "Entered manually, Europe/Warsaw, UTC+1, summer UTC+2", "21.", "Now", ">S</span>", "Civil", "Nautical", "Astronomical"]) {
      expect(html).toContain(s);
    }
    for (const w of POLISH) expect(html).not.toContain(w);
  });

  test("French key labels", () => {
    const html = render("fr");
    for (const s of ["Lever du Soleil", "Coucher de la Lune", "Gibbeuse décroissante", "Saisons 2026", "Éclairement 53\u00a0%", "exactement à", ">de jour<", ">Δ −3 min 43 s<", "dans 6 h 4 min", "Maintenant", "Aube nautique"]) {
      expect(html).toContain(s);
    }
    for (const w of POLISH) expect(html).not.toContain(w);
  });

  test("German key labels", () => {
    const html = render("de");
    for (const s of ["Sonnenaufgang", "Monduntergang", "Jahreszeiten 2026", "Frühlingsanfang", "Aktuelle Positionen", "in 6 Std. 4 Min.", "Jetzt", "Bürgerl. Abenddämmerung", "Abnehmender Dreiviertelmond"]) {
      expect(html).toContain(s);
    }
    for (const w of POLISH) expect(html).not.toContain(w);
  });

  test("a GPS place without a name shows the default name in the language", () => {
    const gps: Place = { ...POZNAN, id: "gps", name: "", source: "gps" };
    expect(renderMain(mainState(gps, undefined, undefined, "fr"))).toContain("Ma position <svg");
    expect(renderMain(mainState({ ...gps, name: "Moja lokalizacja" }, undefined, undefined, "de"))).toContain("Mein Standort <svg");
  });

  test("southern hemisphere swaps season names in English", () => {
    const html = renderMain(mainState({ ...POZNAN, lat: -33.9 }, undefined, undefined, "en"));
    const i = html.indexOf("Autumn equinox");
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(html.indexOf("Winter solstice"));
  });

  test("polar copy in German", () => {
    const html = renderMain(mainState(TROMSO, new Date("2026-12-21T11:00:00Z"), undefined, "de"));
    expect(html).toContain("Polarnacht");
    expect(html).toContain('Sonne geht nicht auf <span class="k">(Höchststand)</span>');
  });
});

describe("sky section", () => {
  const html = renderMain(mainState(POZNAN));
  const sky = html.slice(html.indexOf('<section class="sky"'), html.indexOf("</section>", html.indexOf('<section class="sky"')));

  test("comes after the main screen's sections and before the footer", () => {
    const at = (s: string) => html.indexOf(s);
    expect(at("Kiedy Słońce będzie z kierunku…")).toBeLessThan(at('<section class="sky"'));
    expect(at('<section class="sky"')).toBeLessThan(at('<footer class="app-info">'));
  });

  test("shows its groups in order", () => {
    let last = -1;
    for (const h of ["Niebo", "Światło dziś", "Ta noc", ">Księżyc<", "Nadchodzące", "Dla dociekliwych"]) {
      const i = sky.indexOf(h);
      expect(i, h).toBeGreaterThan(last);
      last = i;
    }
  });

  test("planets and constellations in Polish, distances with grouped digits", () => {
    for (const s of ["Saturn", "Wenus", "Panna", "Superksiężyc", "Waga", "Czas gwiazdowy"]) expect(sky).toContain(s);
    expect(sky).toMatch(/\d{3}\s\d{3} km/);
  });

  test("every language renders it without gaps", () => {
    for (const lang of ["pl", "en", "fr", "de"] as Lang[]) {
      const page = renderMain(mainState(POZNAN, undefined, undefined, lang));
      expect(page).not.toContain("undefined");
      expect(page).not.toContain("NaN");
    }
  });

  test("no dark window in a Tromsø summer night, said in words", () => {
    const page = renderMain(mainState(TROMSO, new Date("2026-06-21T21:00:00Z")));
    expect(page).toContain("Tej nocy nie będzie całkiem ciemno");
  });
});
