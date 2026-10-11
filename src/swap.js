// Tagesdaten beim Tauschen zweier Einheiten mitnehmen. Ändert den übergebenen Zustand direkt.
// Wandert mit der Einheit: Häkchen und Werte ("datum|zeile") und der Solo-Schalter ("datum").
// Bleibt am Datum: Notizen, RPE, Check-in und Zusatz-Einheiten – sie beschreiben, was an dem Tag war.

export function swapDayData(state, ka, kb) {
  const A = ka + "|", B = kb + "|";
  for (const m of [state.done, state.val]) {
    if (!m) continue;
    const ea = [], eb = [];
    for (const k of Object.keys(m)) { if (k.startsWith(A)) ea.push(k); else if (k.startsWith(B)) eb.push(k); }
    const va = ea.map((k) => [k.slice(A.length), m[k]]), vb = eb.map((k) => [k.slice(B.length), m[k]]);
    [...ea, ...eb].forEach((k) => delete m[k]);
    va.forEach(([s, v]) => (m[B + s] = v));
    vb.forEach(([s, v]) => (m[A + s] = v));
  }
  if (state.solo) {
    const a = state.solo[ka], b = state.solo[kb];
    delete state.solo[ka]; delete state.solo[kb];
    if (a) state.solo[kb] = a;
    if (b) state.solo[ka] = b;
  }
  if (state.skip) { delete state.skip[ka]; delete state.skip[kb]; }
}
