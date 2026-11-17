import test from "node:test";
import assert from "node:assert/strict";
import { anProgHtml, anTableHtml, anTrendHtml, anWeeksHtml, anResultHtml, anPicker, anTabsHtml, anZonesHtml } from "../src/an-ui.js";

test("anProgHtml: nur bei Änderung ab 1 s", () => {
  assert.equal(anProgHtml(null), "");
  assert.equal(anProgHtml({ from: 3581, to: 3581.4, parts: {} }), "");
  const h = anProgHtml({ from: 3581, to: 3573, parts: { run: -8, st: 0, rox: 0 }, lo: 3532, hi: 3619 });
  assert.match(h, /59:41/);
  assert.match(h, /59:33/);
  assert.match(h, /−8 s/);
  assert.match(h, /Laufen −8 s, Stationen ±0 s/);
});

test("anTableHtml: Zellen werden maskiert, Zeilen mit sel sind Knöpfe, Klassen tragen das Präfix", () => {
  const h = anTableHtml({ cols: "1fr 50px", head: ["A", "B"], rows: [{ cells: ["<b>x</b>", { t: "+2", c: "bad" }], sel: "k|0|10|Lauf 1" }, { cells: ["y", "z"], pause: true }] });
  assert.ok(!h.includes("<b>x</b>"));
  assert.match(h, /&lt;b&gt;/);
  assert.match(h, /<button type="button" class="an3-tr"[^>]*data-an-sel="k\|0\|10\|Lauf 1"/);
  assert.match(h, /class="an3-tr an3-pause"/);
  assert.match(h, /class="an3-bad"/);
  assert.ok(!/class="tr/.test(h), "kein ungeprägter Klassenname");
});

test("anTrendHtml und anWeeksHtml: unter 3 Datenpunkten ein Hinweis statt Diagramm", () => {
  assert.match(anTrendHtml([{ pc: 240, label: "13.10." }, { pc: 241, label: "20.10." }], 240), /Noch zu wenig Daten \(2 von 3\)/);
  assert.match(anWeeksHtml("Wochenumfang", [{ label: "KW 1", parts: [{ v: 10, color: "#fff" }], total: "10 km" }]), /Noch zu wenig Daten \(1 von 3\)/);
  const t = anTrendHtml([{ pc: 252, label: "06.10." }, { pc: 246, label: "27.10." }, { pc: 240, label: "17.11." }], 240);
  assert.match(t, /Ziel 4:00/);
  assert.match(t, /4:00/);
  assert.match(t, /Ziel erreicht/);
  assert.match(t, /12 s schneller/);
});

test("anResultHtml: eine Aussage, Zahlen, Garmin-Zeile, Datenlage; ohne Aussage nur der Grund", () => {
  const m = { headline: { big: "3 von 4", label: "Intervalle im Ziel", status: { text: "1 verfehlt", tone: "bad" } }, numbers: [{ k: "Pace Arbeit", v: "4:01", unit: "/km", tone: "" }, { k: "Puls-Drift", v: "+9", unit: "bpm", tone: "warn" }], garmin: [{ k: "Belastung", v: "187" }], dataState: { text: "Garmin · 9 Runden", tone: "" } };
  const h = anResultHtml(m, { meta: "Lauf", title: "Tempo", color: "#64a8ff" });
  assert.match(h, /3 von 4/);
  assert.match(h, /an3-pill an3-bad/);
  assert.match(h, /Laut Garmin/);
  assert.match(h, /an3-cols an3-g/);
  assert.match(h, /Garmin · 9 Runden/);
  const none = anResultHtml({ headline: { big: "–", label: "kein Zieltempo im Plan", status: null }, numbers: [], garmin: [], dataState: { text: "x", tone: "warn" } }, { meta: "m", title: "t", color: "#fff" });
  assert.ok(!/an3-big/.test(none));
  assert.match(none, /kein Zieltempo im Plan/);
});

test("anPicker: Pfeile gesperrt ohne Nachbar, anTabsHtml markiert den aktiven Reiter, anZonesHtml zeigt Zeiten", () => {
  const p = anPicker({ date: "Di 13. Okt", sub: "Lauf", prev: null, next: 5 });
  assert.match(p, /aria-label="Ältere Einheit" disabled/);
  assert.ok(!/aria-label="Neuere Einheit" disabled/.test(p));
  assert.match(anTabsHtml(["A", "B"], "B"), /aria-selected="true" data-act="an-sub" data-t="B"/);
  assert.equal(anTabsHtml([], ""), "");
  assert.match(anZonesHtml([{ label: "Z2", sub: "141 bis 156 bpm", secs: 498, pct: 15, color: "#64a8ff" }]), /8:18/);
});
