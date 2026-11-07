import { test } from "node:test";
import assert from "node:assert/strict";
import * as f from "../src/feedback.js";

const T = Date.parse("2026-11-06T12:00:00Z");
const mk = (o = {}) => f.newItem({ text: "Satz zu klein", cat: "design", ctx: { view: "today", date: "2026-11-06", plan: "Kraft A", step: 3 }, now: T, id: o.id || f.makeId(), ...o });

test("newItem: trimmt, begrenzt, lehnt leeren Text ab, kennt nur gültige Kategorien", () => {
  assert.equal(f.newItem({ text: "   ", cat: "idee" }), null);
  const it = mk({ text: "  hallo  ", cat: "unsinn" });
  assert.equal(it.text, "hallo");
  assert.equal(it.cat, "idee");
  assert.equal(it.status, "offen");
  assert.equal(f.newItem({ text: "x".repeat(5000), cat: "fehler" }).text.length, 2000);
  assert.match(f.makeId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(f.makeId(() => 0.5), /^[0-9a-f]{8}-/);
});

test("Speichern: roundtrip, kaputte Daten ergeben leeren Speicher", () => {
  let st = f.addItem(f.emptyStore(), mk({ id: "a" }));
  st = f.addItem(st, mk({ id: "b" }));
  const back = f.loadStore(f.saveStore(st));
  assert.deepEqual(back.items.map((x) => x.id), ["b", "a"]);
  assert.deepEqual(f.loadStore("{kaputt"), f.emptyStore());
  assert.deepEqual(f.loadStore(null), f.emptyStore());
  assert.equal(f.loadStore('{"items":[{"id":1},{"id":"z","text":"t"}],"del":[3,"q"]}').items.length, 1);
  assert.deepEqual(f.loadStore('{"items":[],"del":[3,"q"]}').del, ["q"]);
});

test("Status, Text, Löschen, Filter", () => {
  let st = f.addItem(f.addItem(f.emptyStore(), mk({ id: "a", now: T })), mk({ id: "b", now: T + 5000 }));
  st = f.setStatus(st, "a", "erledigt", T + 9000);
  assert.equal(st.items.find((x) => x.id === "a").updated_at, new Date(T + 9000).toISOString());
  assert.deepEqual(f.filterItems(st.items, "offen").map((x) => x.id), ["b"]);
  assert.deepEqual(f.filterItems(st.items, "erledigt").map((x) => x.id), ["a"]);
  assert.deepEqual(f.filterItems(st.items, "alle").map((x) => x.id), ["b", "a"]);
  assert.equal(f.setStatus(st, "a", "quatsch"), st);
  assert.equal(f.setText(st, "b", "  ", T), st);
  assert.equal(f.setText(st, "b", "neu", T).items.find((x) => x.id === "b").text, "neu");
  const del = f.removeItem(st, "a");
  assert.deepEqual(del.items.map((x) => x.id), ["b"]);
  assert.deepEqual(del.del, ["a"]);
  assert.equal(f.removeItem(del, "nix"), del);
});

test("reconcile: neuerer Stand gewinnt, Neues geht hoch, Lokales bleibt", () => {
  const a = { ...mk({ id: "a", now: T }) };
  const aRemoteNewer = { ...a, status: "erledigt", updated_at: new Date(T + 1000).toISOString() };
  const b = mk({ id: "b", now: T + 10 });
  const c = { ...mk({ id: "c", now: T + 20 }) };
  // a: remote neuer -> übernommen; b: nur lokal, nie hochgeladen -> push; c: nur remote -> übernommen
  let r = f.reconcile([a, b], [aRemoteNewer, c], []);
  assert.equal(r.items.find((x) => x.id === "a").status, "erledigt");
  assert.deepEqual(r.push.map((x) => x.id), ["b"]);
  assert.deepEqual(r.items.map((x) => x.id).sort(), ["a", "b", "c"]);
  // lokal neuer -> push
  const aLocalNewer = { ...a, text: "geändert", updated_at: new Date(T + 5000).toISOString(), sy: a.updated_at };
  r = f.reconcile([aLocalNewer], [{ ...a }], []);
  assert.deepEqual(r.push.map((x) => x.text), ["geändert"]);
  // gleich -> kein Push
  r = f.reconcile([{ ...a }], [{ ...a }], []);
  assert.equal(r.push.length, 0);
});

test("reconcile: Löschen wirkt in beide Richtungen", () => {
  const a = mk({ id: "a" });
  // lokal gelöscht: remote entfernen, nicht wieder übernehmen
  let r = f.reconcile([], [a], ["a"]);
  assert.deepEqual(r.items, []);
  assert.deepEqual(r.remove, ["a"]);
  // woanders gelöscht (lokal schon synchronisiert, remote fehlt): fällt weg statt neu hochgeladen
  r = f.reconcile([{ ...a, sy: a.updated_at }], [], []);
  assert.deepEqual(r.items, []);
  assert.equal(r.push.length, 0);
});

test("markSynced und Zeilen-Mapping", () => {
  const a = mk({ id: "a" });
  assert.equal(f.markSynced([a], ["a"], "Z")[0].sy, "Z");
  assert.equal(f.markSynced([a], ["x"], "Z")[0].sy, undefined);
  const row = f.toRow({ ...a, sy: "Z" });
  assert.equal("sy" in row, false);
  assert.deepEqual(Object.keys(row).sort(), ["cat", "created_at", "ctx", "id", "status", "text", "updated_at"]);
  const back = f.fromRow({ ...row, cat: "kaputt", status: "?" });
  assert.equal(back.cat, "idee");
  assert.equal(back.status, "offen");
  assert.equal(back.sy, row.updated_at);
});

test("describeElement: Pfad, Text, data-Werte (ohne DOM)", () => {
  const mkEl = (tagName, o = {}, parent = null) => {
    const e = { tagName, parentElement: parent, id: o.id || "", classList: o.cls || [], dataset: o.data || {}, textContent: o.text || "", children: [], getAttribute: (k) => (o.attrs || {})[k] || null };
    if (parent) parent.children.push(e);
    return e;
  };
  const main = mkEl("MAIN", { id: "main" });
  const card = mkEl("SECTION", { cls: ["card", "on"] }, main);
  mkEl("LI", { data: { j: "2" } }, card);
  const li = mkEl("LI", { data: { j: "3", act: "x" }, text: "  Back   Squat\n 3×5  ", cls: ["ex"] }, card);
  const d = f.describeElement(li);
  assert.equal(d.path, "main#main > section.card > li.ex:nth-of-type(2)");
  assert.equal(d.text, "Back Squat 3×5");
  assert.equal(d.data.j, "3");
  assert.equal(d.tag, "li");
  assert.deepEqual(f.describeElement(null), {});
});

test("Export: Text enthält Kontext, Filter wirkt, JSON ist gültig", () => {
  let st = f.emptyStore();
  st = f.addItem(st, mk({ id: "a", text: "Pause zu kurz", cat: "plan", ctx: { view: "focus", date: "2026-11-06", plan: "Kraft A", step: 3, el: { path: "div#focus > button.go", text: "Weiter", data: { j: "2" } } } }));
  st = f.addItem(st, mk({ id: "b", text: "Alles gut", cat: "idee" }));
  st = f.setStatus(st, "b", "erledigt", T + 1);
  const t = f.toText(st.items, { filter: "offen", now: T });
  assert.match(t, /1 offen/);
  assert.match(t, /\[Plan ändern\] offen/);
  assert.match(t, /Ansicht: Fokusmodus · 2026-11-06 · Kraft A · Schritt 3/);
  assert.match(t, /CSS-Pfad: div#focus > button\.go/);
  assert.match(t, /Element-Text: «Weiter»/);
  assert.match(t, /data-Werte: j=2/);
  assert.match(t, /Kommentar: Pause zu kurz/);
  assert.doesNotMatch(t, /Alles gut/);
  assert.match(f.toText(st.items, { filter: "alle", now: T }), /Alles gut/);
  assert.match(f.toText([], { now: T }), /keine Einträge/);
  const j = JSON.parse(f.toJson(st.items, { filter: "alle" }));
  assert.equal(j.items.length, 2);
  assert.equal(j.type, "feedback");
  assert.equal(JSON.parse(f.toJson(st.items, { filter: "offen" })).items.length, 1);
});
