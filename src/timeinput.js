// Zeiteingabe auf dem Handy: Die Ziffern-Tastatur hat keinen Doppelpunkt, darum wird "352" zu "3:52".
// Reine Funktionen, ohne DOM.

const SEP = /^(\d{1,2})[.,'′’:](\d{2})$/;

/** Eine Zeit zu "m:ss" (oder "h:mm:ss") ergänzen. Alles, was keine eindeutige Zeit ist, bleibt unverändert.
 * "352" → "3:52", "1203" → "12:03", "3.52" / "3,52" / "3'52" → "3:52", "10320" → "1:03:20". */
export function normTime(v) {
  const s = String(v == null ? "" : v).trim();
  let m = s.match(SEP);
  if (m) return +m[2] < 60 ? `${+m[1]}:${m[2]}` : s;
  m = s.match(/^(\d{1,2})(\d{2})$/);
  if (m && s.length >= 3) return +m[2] < 60 ? `${+m[1]}:${m[2]}` : s;
  m = s.match(/^(\d)(\d{2})(\d{2})$/);
  if (m) return +m[2] < 60 && +m[3] < 60 ? `${m[1]}:${m[2]}:${m[3]}` : s;
  return s;
}

/** Mehrere Zeiten, durch Leerzeichen getrennt ("352 355 358" → "3:52 3:55 3:58"). Ist ein Teil keine Zeit, bleibt alles unverändert. */
export function normTimes(v) {
  const s = String(v == null ? "" : v).trim();
  const parts = s.split(/\s+/).filter(Boolean);
  if (!parts.length) return s;
  const out = parts.map(normTime);
  return out.every((p, i) => /^\d+(:\d{2}){1,2}$/.test(p) && (p !== parts[i] || /:/.test(parts[i]))) ? out.join(" ") : s;
}
