// Backup als .json-Datei: Export mit Kopf (App, Version, Datum, Nutzer), Import mit Prüfung.
// Ältere Backups (reiner Datenstand ohne Kopf, aus "Backup als Text") werden weiterhin gelesen.
export const BACKUP_APP = "basel-sub60";
export const BACKUP_VERSION = 1;

export function makeBackup(state, { user, now = new Date() } = {}) {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), user: user || null, data: state };
}

export const backupFileName = (now = new Date()) =>
  `${BACKUP_APP}-backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}.json`;

const isObj = (o) => !!o && typeof o === "object" && !Array.isArray(o);

/** Text einer .json-Datei → {data, meta, summary}. Wirft mit code "invalid" bei allem, was kein Backup ist. */
export function readBackup(text) {
  const fail = () => { throw Object.assign(new Error("Das ist kein gültiges Backup"), { code: "invalid" }); };
  let o; try { o = JSON.parse(text); } catch (_) { fail(); }
  if (!isObj(o)) fail();
  let data = o, meta = { exportedAt: null, user: null, version: 0 };
  if (o.app !== undefined) {
    if (o.app !== BACKUP_APP || !isObj(o.data)) fail();
    if (o.version > BACKUP_VERSION) throw Object.assign(new Error("Backup stammt aus einer neueren App-Version"), { code: "newer" });
    data = o.data; meta = { exportedAt: o.exportedAt || null, user: o.user || null, version: o.version };
  }
  if (!isObj(data.done)) fail();
  const n = (x) => (isObj(x) ? Object.keys(x).length : 0);
  const summary = {
    done: n(data.done), notes: n(data.notes), rpe: n(data.rpe), checkins: n(data.checkin),
    changes: n(data.sched) + n(data.edit), strava: data.strava && isObj(data.strava.acts) ? n(data.strava.acts) : 0,
    plan: !!data.plan,
  };
  return { data, meta, summary };
}
