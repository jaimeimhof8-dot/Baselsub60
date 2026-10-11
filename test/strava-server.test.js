import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureToken } from "../src/strava.js";
import { impact } from "../src/soreness.js";

test("Refresh über den Server: kein Secret, kein direkter Strava-Aufruf", async () => {
  const tok = { access: "a", refresh: "r1", expires: 1000, athlete: "Jaime" };
  const fetchFn = () => { throw new Error("darf nicht direkt zu Strava"); };
  let asked = null;
  const n = await ensureToken(fetchFn, tok, { now: 2000 * 1000, refresh: async (t) => { asked = t.refresh; return { access: "b", refresh: "r2", expires: 9999, athlete: null }; } });
  assert.equal(asked, "r1");
  assert.deepEqual(n, { access: "b", refresh: "r2", expires: 9999, athlete: "Jaime" });
});

test("Muskelkater-Hinweis: vollständige Übungsnamen ohne RPE", () => {
  const hit = impact({ k: "kraft", i: ["Back Squat RPE 7, Zirkel, 2 Durchgänge", "Bulgarian Split Squat 3×8 je Seite RPE 7"] }, { quads: 7 });
  assert.deepEqual(hit.names, ["Back Squat", "Bulgarian Split Squat"]);
  const run = impact({ k: "lauf", i: ["4×1km zusammen, RPE 8–9 (kein Sprint), 2′ Trabpause"] }, { calves: 6 });
  assert.deepEqual(run.names, ["4×1km zusammen"]);
});
