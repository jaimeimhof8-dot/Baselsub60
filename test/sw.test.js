import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { loadOf } from "../src/soreness.js";

test("Service Worker cached jedes Modul aus src/", () => {
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const listed = JSON.parse(sw.match(/const SRC = (\[[^\]]*\])/)[1]);
  const files = readdirSync(new URL("../src/", import.meta.url)).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3));
  assert.deepEqual(files.filter((f) => !listed.includes(f)), []);
  assert.deepEqual(listed.filter((f) => !files.includes(f)), []);
});

test("Push Press belastet Schultern und Beine", () => {
  const z = loadOf({ k: "kraft", i: ["Push Press 3×6"] });
  assert.ok(z.includes("shoulders") && z.includes("quads"));
  assert.ok(!z.includes("chest"));
});

test("Angezeigte App-Version im Menü entspricht dem Cache-Namen des Service Workers", () => {
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const v = /const C = "hyrox-v(\d+)"/.exec(sw)[1];
  assert.match(html, new RegExp(`App-Version ${v}<`));
});
