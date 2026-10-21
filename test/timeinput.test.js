import { test } from "node:test";
import assert from "node:assert/strict";
import { normTime, normTimes } from "../src/timeinput.js";

test("Ziffern ohne Doppelpunkt werden zu m:ss", () => {
  assert.equal(normTime("352"), "3:52");
  assert.equal(normTime("1203"), "12:03");
  assert.equal(normTime("400"), "4:00");
});

test("Punkt, Komma und Apostroph ersetzen den Doppelpunkt", () => {
  assert.equal(normTime("3.52"), "3:52");
  assert.equal(normTime("3,52"), "3:52");
  assert.equal(normTime("3'52"), "3:52");
  assert.equal(normTime("3:52"), "3:52");
});

test("Stunden mit fünf Ziffern", () => {
  assert.equal(normTime("10320"), "1:03:20");
});

test("Ungültige Sekunden und Text bleiben unverändert", () => {
  assert.equal(normTime("375"), "375");
  assert.equal(normTime("3.75"), "3.75");
  assert.equal(normTime("ok"), "ok");
  assert.equal(normTime("45"), "45");
  assert.equal(normTime(""), "");
  assert.equal(normTime(null), "");
});

test("Listen: alles oder nichts", () => {
  assert.equal(normTimes("352 355 358"), "3:52 3:55 3:58");
  assert.equal(normTimes("3:52 355"), "3:52 3:55");
  assert.equal(normTimes("352 gut"), "352 gut");
  assert.equal(normTimes("  "), "");
});
