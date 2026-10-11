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
