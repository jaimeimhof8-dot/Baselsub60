// Sync ohne Datenverlust: Drei-Wege-Zusammenführung des App-Zustands (S).
// base = letzter Stand, auf den sich Gerät und Cloud geeinigt haben. Pro Eintrag gilt:
// nur hier geändert → lokal, nur in der Cloud geändert → Cloud, beide geändert → der neuere Gesamtstand (_t).
// Gelöschte Einträge (Häkchen entfernt) bleiben gelöscht, wenn die andere Seite sie nicht verändert hat.
// Reine Funktionen, ohne DOM.

/** Felder, die pro Eintrag zusammengeführt werden ({schlüssel: wert}). Alles andere zählt als Ganzes. */
export const MAP_FIELDS = ["done", "val", "rpe", "notes", "sched", "skip", "edit", "checkin", "dismiss", "weights", "sore", "extra", "solo", "onb", "review", "later"];

const isObj = (o) => !!o && typeof o === "object" && !Array.isArray(o);

/** JSON mit sortierten Schlüsseln – gleiche Inhalte ergeben denselben Text. */
export function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  return v === undefined ? "null" : JSON.stringify(v);
}
const same = (a, b) => stable(a) === stable(b);

/** Ein Wert: wer hat gegenüber base geändert? */
function pick(base, local, remote, localNewer) {
  if (same(local, remote)) return local;
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;
  return localNewer ? local : remote;
}

function mergeMap(base, local, remote, localNewer) {
  const b = isObj(base) ? base : {}, l = isObj(local) ? local : {}, r = isObj(remote) ? remote : {};
  const out = {};
  for (const k of new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])) {
    const v = pick(b[k], l[k], r[k], localNewer);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Lokalen Stand und Cloud-Stand zusammenführen.
 * @param base   letzter gemeinsamer Stand oder null (erste Synchronisation: alles wird vereinigt)
 * @returns neuer Zustand (die Eingaben bleiben unverändert)
 */
export function mergeState(base, local, remote) {
  if (!isObj(remote)) return local;
  if (!isObj(local)) return remote;
  const b = isObj(base) ? base : {};
  const localNewer = (local._t || 0) >= (remote._t || 0);
  const out = {};
  for (const k of new Set([...Object.keys(b), ...Object.keys(local), ...Object.keys(remote)])) {
    let v;
    if (k === "_t") v = Math.max(local._t || 0, remote._t || 0);
    else if (MAP_FIELDS.includes(k)) v = mergeMap(b[k], local[k], remote[k], localNewer);
    else if (k === "strava" && isObj(local.strava) && isObj(remote.strava)) {
      const bs = isObj(b.strava) ? b.strava : {};
      v = { ...pick(bs, local.strava, remote.strava, localNewer),
        acts: mergeMap(bs.acts, local.strava.acts, remote.strava.acts, localNewer),
        at: Math.max(local.strava.at || 0, remote.strava.at || 0) };
    } else if (k === "garmin" && isObj(local.garmin) && isObj(remote.garmin)) {
      const bg = isObj(b.garmin) ? b.garmin : {};
      v = { ...pick(bg, local.garmin, remote.garmin, localNewer),
        well: mergeMap(bg.well, local.garmin.well, remote.garmin.well, localNewer),
        at: Math.max(local.garmin.at || 0, remote.garmin.at || 0) };
    } else v = pick(b[k], local[k], remote[k], localNewer);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Wie viel steckt in einem Stand: Einträge aller Listen-Felder, Strava/Garmin-Werte, ausgefüllte Tests, importierter Plan. */
export function countEntries(s) {
  if (!isObj(s)) return 0;
  const n = (o) => (isObj(o) ? Object.keys(o).length : 0);
  let c = MAP_FIELDS.reduce((sum, k) => sum + n(s[k]), 0);
  if (isObj(s.strava)) c += n(s.strava.acts);
  if (isObj(s.garmin)) c += n(s.garmin.well);
  const filled = (v) => (Array.isArray(v) ? v.reduce((x, y) => x + filled(y), 0) : isObj(v) ? Object.values(v).reduce((x, y) => x + filled(y), 0) : String(v ?? "").trim() ? 1 : 0);
  c += filled(s.tests);
  if (isObj(s.plan)) c += 1;
  return c;
}

/**
 * mergeState mit Schutz vor Massenlöschung. Ein Sync löscht nie mehr als die Hälfte der Einträge auf einmal
 * (ab 5 Einträgen) – so etwas tippt niemand von Hand, das ist ein leeres oder veraltetes Gerät
 * (z. B. nach Abmelden/Anmelden). Dann wird ohne Basis vereinigt: nichts geht verloren, beide Seiten bleiben.
 * Ausnahme: Backup/Wiederherstellung ersetzt bewusst alles, das läuft ohne Zusammenführung (App: replaceCloud).
 */
export function safeMerge(base, local, remote) {
  const out = mergeState(base, local, remote);
  if (!isObj(base) || !isObj(local) || !isObj(remote)) return out;
  const before = Math.max(countEntries(local), countEntries(remote)), after = countEntries(out);
  if (before - after >= 5 && after < before / 2) return mergeState(null, local, remote);
  return out;
}
