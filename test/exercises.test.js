import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { hasChest, noChest, noChestDay, CHEST_SWAP } from "../src/exercises.js";
import { builtinPlan } from "../src/plan-store.js";
import { parsePlanText } from "../src/parser.js";
import { weightList, BASE_EXERCISES } from "../src/weights.js";
import { loadOf } from "../src/soreness.js";

test("Brustübungen werden erkannt, andere nicht", () => {
  for (const s of ["Bench Press 3×6", "Bankdrücken 4×5", "Kurzhantel-Bankdrücken 3×8", "Incline Bench Press 3×8", "Chest Press", "Floor Press 3×6", "Push-ups 3×15", "Liegestütze 20", "Dips 3×8", "Cable Flys 3×12", "Butterfly 3×12"])
    assert.ok(hasChest(s), s);
  for (const s of ["Push Press 3×6", "Shoulder Press 3×8", "Sled Push 50 m", "Pull-ups 3×6", "Burpee Broad Jumps 80 m", "Bent-over Row 3×8", "Butterfly-Effekt? nein: Flyer", ""])
    assert.ok(!hasChest(s), s);
});

test("Ersatz durch Push Press, Angaben bleiben", () => {
  assert.equal(CHEST_SWAP, "Push Press");
  assert.equal(noChest("Bench Press 3×6 RPE 7"), "Push Press 3×6 RPE 7");
  assert.equal(noChest("Bench Press RPE 7, Zirkel, 2 Durchgänge"), "Push Press RPE 7, Zirkel, 2 Durchgänge");
  assert.equal(noChest("Grundübungen – Back Squat, Bench Press, Shoulder Press"), "Grundübungen – Back Squat, Push Press, Shoulder Press");
  assert.equal(noChest(undefined), "");
});

test("noChestDay ersetzt Titel, Zeilen und Hinweis und lässt anderes unangetastet", () => {
  const day = { t: "Kraft 1", k: "kraft", i: ["Back Squat 3×5", "Bench Press 3×6"], n: "Bench Press sauber." };
  const out = noChestDay(day);
  assert.deepEqual(out.i, ["Back Squat 3×5", "Push Press 3×6"]);
  assert.equal(out.n, "Push Press sauber.");
  assert.deepEqual(day.i, ["Back Squat 3×5", "Bench Press 3×6"], "Original unverändert");
  const clean = { t: "Lauf", k: "lauf", i: ["4×1 km"] };
  assert.equal(noChestDay(clean), clean);
  assert.equal(noChestDay(null), null);
});

test("Eingebauter Plan enthält keine Brustübung, aber gleich viele Kraftzeilen", () => {
  const days = Object.values(builtinPlan().days);
  for (const d of days) for (const s of [d.t, d.n, ...(d.i || [])]) assert.ok(!hasChest(s || ""), s);
  assert.ok(days.some((d) => d.k === "kraft" && d.i.some((l) => l.startsWith("Push Press"))));
});

test("PDF-Import ersetzt Bankdrücken, auch bei Angaben aus dem Vorblock", () => {
  const text = readFileSync(new URL("./fixtures/plan-provisorisch.txt", import.meta.url), "utf8");
  const { days } = parsePlanText(text);
  for (const d of Object.values(days)) for (const s of [d.t, d.n, ...(d.i || [])]) assert.ok(!hasChest(s || ""), s);
  assert.equal(days[28].i.find((l) => l.startsWith("Push Press")), "Push Press 3×6 RPE 7");
});

test("Profil: keine Brustübung, Push Press als feste Übung", () => {
  assert.ok(BASE_EXERCISES.includes("Push Press") && !BASE_EXERCISES.some(hasChest));
  const labels = weightList([{ k: "kraft", i: ["Bankdrücken 3×6", "Dips 3×8", "Hip Thrust 3×8"] }]).map((e) => e.label);
  assert.ok(labels.includes("Hip Thrust"));
  assert.ok(!labels.some(hasChest));
});

test("Push Press belastet Schultern und Beine, nicht die Brust", () => {
  const z = loadOf({ k: "kraft", i: ["Push Press 3×6"] });
  assert.ok(z.includes("shoulders") && z.includes("quads"));
  assert.ok(!z.includes("chest"));
});

test("Service Worker cached jedes Modul aus src/", () => {
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const listed = JSON.parse(sw.match(/const SRC = (\[[^\]]*\])/)[1]);
  const files = readdirSync(new URL("../src/", import.meta.url)).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3));
  assert.deepEqual(files.filter((f) => !listed.includes(f)), []);
});
