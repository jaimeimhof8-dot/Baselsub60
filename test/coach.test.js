import { test } from "node:test";
import assert from "node:assert/strict";

test("buildCoachRequest: Analyse schickt Tag und Fingerabdruck mit (Server speichert das Ergebnis), Chat nicht", async () => {
  const { buildCoachRequest } = await import("../src/coach.js");
  const a = buildCoachRequest({ context: {}, chat: [], message: "x", mode: "analyse", job: { day: "2026-11-28", sig: "[1]" } });
  assert.deepEqual(a.job, { day: "2026-11-28", sig: "[1]" });
  const c = buildCoachRequest({ context: {}, chat: [], message: "x", job: { day: "2026-11-28", sig: "[1]" } });
  assert.equal(c.job, undefined);
});
