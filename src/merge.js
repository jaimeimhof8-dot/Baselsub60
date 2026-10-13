// Sync ohne Datenverlust: Drei-Wege-Zusammenführung des App-Zustands (S).
// base = letzter Stand, auf den sich Gerät und Cloud geeinigt haben. Pro Eintrag gilt:
// nur hier geändert → lokal, nur in der Cloud geändert → Cloud, beide geändert → der neuere Gesamtstand (_t).
// Gelöschte Einträge (Häkchen entfernt) bleiben gelöscht, wenn die andere Seite sie nicht verändert hat.
// Reine Funktionen, ohne DOM.

/** Felder, die pro Eintrag zusammengeführt werden ({schlüssel: wert}). Alles andere zählt als Ganzes. */
export const MAP_FIELDS = ["done", "val", "rpe", "notes", "sched", "skip", "edit", "checkin", "dismiss", "weights", "sore", "extra", "solo", "onb"];

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
