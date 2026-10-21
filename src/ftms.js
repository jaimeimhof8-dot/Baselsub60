// Laufband über Bluetooth (FTMS, Fitness Machine Service 0x1826): Treadmill Data lesen (Geschwindigkeit, Distanz).
// Nur Android-Chrome (Web Bluetooth); iPhone-Safari kann das nicht. Reine Funktionen, ohne DOM.
// Ob ein bestimmtes Laufband diesen Standard sendet, zeigt erst der Versuch mit dem Gerät.

export const FTMS_SERVICE = 0x1826;
export const TREADMILL_DATA = 0x2acd;

/** Treadmill-Data-Paket bauen (Gegenstück zu parseTreadmill): Geschwindigkeit in km/h, Distanz in Metern. Für den Laufband-Simulator und Tests. */
export function buildTreadmill(kmh, distM) {
  const v = Math.round(kmh * 100), d = Math.round(distM);
  return new Uint8Array([0x04, 0x00, v & 0xff, (v >> 8) & 0xff, d & 0xff, (d >> 8) & 0xff, (d >> 16) & 0xff]);
}

/**
 * Treadmill Data (Bluetooth SIG, FTMS) auswerten.
 * Aufbau: Flags (16 Bit), dann je nach Flag: Geschwindigkeit (0,01 km/h; fehlt, wenn Bit 0 gesetzt), Durchschnittsgeschwindigkeit (Bit 1),
 * Gesamtdistanz (24 Bit, Meter; Bit 2). Alles danach wird nicht gebraucht.
 * @param {DataView} dv
 * @returns {{kmh: number|null, distM: number|null, pace: number|null}} pace in s/km
 */
export function parseTreadmill(dv) {
  if (!dv || dv.byteLength < 2) return { kmh: null, distM: null, pace: null };
  const flags = dv.getUint16(0, true);
  let o = 2, kmh = null, distM = null;
  const has = (n) => (flags & (1 << n)) !== 0;
  if (!has(0)) { if (dv.byteLength < o + 2) return { kmh, distM, pace: null }; kmh = dv.getUint16(o, true) / 100; o += 2; }
  if (has(1)) o += 2;
  if (has(2)) { if (dv.byteLength >= o + 3) distM = dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getUint8(o + 2) << 16); }
  return { kmh, distM, pace: kmh && kmh > 0.5 ? Math.round(3600 / kmh) : null };
}
