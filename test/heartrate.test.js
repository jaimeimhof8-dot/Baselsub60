import test from "node:test";
import assert from "node:assert/strict";
import { parseHeartRate, buildHeartRate } from "../src/ftms.js";

const dv = (...bytes) => new DataView(new Uint8Array(bytes).buffer);

test("Puls: 8-Bit-Wert aus Heart Rate Measurement", () => {
  assert.equal(parseHeartRate(dv(0x00, 168)), 168);
});

test("Puls: 16-Bit-Wert (Flag Bit 0) wird gelesen", () => {
  assert.equal(parseHeartRate(dv(0x01, 0xa8, 0x00)), 168);
});

test("Puls: weitere Felder nach dem Wert stören nicht", () => {
  // Flags: Sensor-Kontakt (Bit 1+2), danach RR-Intervall. Gelesen wird nur der Puls.
  assert.equal(parseHeartRate(dv(0x16, 150, 0x20, 0x03)), 150);
});

test("Puls: fehlende oder unsinnige Daten ergeben null", () => {
  assert.equal(parseHeartRate(null), null);
  assert.equal(parseHeartRate(dv(0x00)), null);
  assert.equal(parseHeartRate(dv(0x01, 0xa8)), null); // 16-Bit-Flag, aber nur ein Byte Wert
  assert.equal(parseHeartRate(dv(0x00, 0)), null); // Sensor ohne Hautkontakt meldet 0
  assert.equal(parseHeartRate(dv(0x00, 255)), null);
});

test("Puls: Simulator-Paket wird wie ein echter Sensor gelesen", () => {
  for (const bpm of [60, 168, 200]) assert.equal(parseHeartRate(new DataView(buildHeartRate(bpm).buffer)), bpm);
});
