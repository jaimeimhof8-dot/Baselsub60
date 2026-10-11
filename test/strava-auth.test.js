import { test } from "node:test";
import assert from "node:assert/strict";
import { callServer, completeOAuth, syncErrorText, serverErrorText, MSG } from "../src/strava-auth.js";
import { ensureToken } from "../src/strava.js";

/* invoke-Attrappen im Format von supabase-js `functions.invoke` */
const ok = (data) => async () => ({ data, error: null });
// HTTP-Fehler: FunctionsHttpError mit der Response in error.context
const http = (status, body) => async () => ({ data: null, error: Object.assign(new Error("Edge Function returned a non-2xx status code"),
  { context: new Response(typeof body === "string" ? body : JSON.stringify(body), { status }) }) });
// Netzwerkfehler: FunctionsFetchError, context ist der Fetch-Fehler (keine Response)
const netFail = async () => ({ data: null, error: Object.assign(new Error("Failed to send a request to the Edge Function"), { context: new TypeError("fetch failed") }) });

const TOK = { access: "acc1", refresh: "ref1", expires: 2000000000, athlete: "Jaime" };
const noFetch = () => { throw new Error("darf Strava nicht direkt aufrufen"); };

/** Callback-Ablauf mit Attrappen; gibt Ergebnis, gespeicherte Tokens und gesendete Bodies zurück. */
async function callback(invoke, extra = {}) {
  const sent = [], stored = [];
  const r = await completeOAuth({ code: "abc123def", server: true, fetchFn: noFetch, store: (t) => stored.push(t),
    invoke: async (b) => { sent.push(b); return invoke(b); }, ...extra });
  return { r, sent, stored };
}

/* ---------- 1) Token-Tausch über die Edge Function ---------- */

test("OAuth-Code geht an die Edge Function, Token wird gespeichert", async () => {
  const { r, sent, stored } = await callback(ok(TOK));
  assert.deepEqual(sent, [{ action: "exchange", code: "abc123def" }], "nur Code + Aktion, kein Secret");
  assert.ok(!JSON.stringify(sent).includes("secret"));
  assert.deepEqual(stored, [TOK]);
  assert.deepEqual(r, { ok: true, msg: MSG.connected, tok: TOK });
});

test("Abgelaufenes Token wird über die Edge Function erneuert", async () => {
  const sent = [];
  const invoke = async (b) => { sent.push(b); return { data: { access: "acc2", refresh: "ref2", expires: 2100000000, athlete: null }, error: null }; };
  const old = { ...TOK, expires: 1000 };
  const n = await ensureToken(noFetch, old, { now: 999 * 1000, refresh: (t) => callServer(invoke, { action: "refresh", refresh: t.refresh }) });
  assert.deepEqual(sent, [{ action: "refresh", refresh: "ref1" }]);
  assert.deepEqual(n, { access: "acc2", refresh: "ref2", expires: 2100000000, athlete: "Jaime" }, "Name bleibt erhalten");
  // Noch gültig → kein Aufruf
  assert.equal(await ensureToken(noFetch, TOK, { now: 1000, refresh: () => assert.fail("kein Refresh nötig") }), TOK);
});

/* ---------- 2) Fehler und Offline ---------- */

test("Ungültiger oder abgelaufener Code: Strava lehnt ab → neu verbinden, nichts gespeichert", async () => {
  const { r, stored } = await callback(http(502, { error: "strava", status: 400 }));
  assert.equal(r.ok, false); assert.equal(r.msg, MSG.rejected); assert.deepEqual(stored, []);
});

test("Secrets fehlen auf dem Server", async () => {
  const { r, stored } = await callback(http(500, { error: "no_secret" }));
  assert.equal(r.msg, MSG.noSecret); assert.deepEqual(stored, []);
});

test("Edge Function nicht deployt (404 ohne JSON)", async () => {
  const { r } = await callback(http(404, "Function not found"));
  assert.equal(r.msg, MSG.notDeployed);
});

test("Nicht angemeldet bzw. kein Mitglied", async () => {
  assert.equal((await callback(http(401, { error: "forbidden" }))).r.msg, MSG.forbidden);
  assert.equal((await callback(http(403, { error: "forbidden" }))).r.msg, MSG.forbidden);
});

test("Netzwerkfehler und Serverfehler ohne lesbare Antwort", async () => {
  assert.equal((await callback(netFail)).r.msg, MSG.down);
  assert.equal((await callback(http(500, "<html>Bad Gateway</html>"))).r.msg, MSG.down);
  // Antwort ohne Tokens wird nicht gespeichert
  const { r, stored } = await callback(ok({ athlete: "Jaime" }));
  assert.equal(r.ok, false); assert.deepEqual(stored, []);
});

test("Offline: kein Aufruf, klare Meldung", async () => {
  const { r, sent } = await callback(ok(TOK), { online: false });
  assert.deepEqual(sent, []); assert.equal(r.msg, MSG.offline);
  // fetch wirft TypeError (z. B. Verbindung bricht ab) → ebenfalls Offline-Meldung
  const { r: r2 } = await callback(async () => { throw new TypeError("Failed to fetch"); });
  assert.equal(r2.msg, MSG.offline);
});

test("Rückkehr von Strava ohne Code: abgelehnt oder abgebrochen, kein Aufruf", async () => {
  const none = () => assert.fail("kein Aufruf ohne Code");
  assert.deepEqual(await completeOAuth({ err: "access_denied", server: true, invoke: none, store: none }), { ok: false, msg: MSG.denied });
  assert.deepEqual(await completeOAuth({ code: "", server: true, invoke: none, store: none }), { ok: false, msg: MSG.aborted });
});

test("Vorschau-Modus ohne Cloud: lokaler Tausch, Fehler mit Hinweis auf die Callback-Domain", async () => {
  const stored = [];
  const good = async (url, opt) => { assert.match(url, /strava\.com\/oauth\/token/); assert.equal(JSON.parse(opt.body).client_secret, "s");
    return { ok: true, json: async () => ({ access_token: "a", refresh_token: "r", expires_at: 1, athlete: { firstname: "Jaime" } }) }; };
  const r = await completeOAuth({ code: "abc123def", server: false, fetchFn: good, cfg: { clientId: "1", secret: "s" }, store: (t) => stored.push(t) });
  assert.equal(r.ok, true); assert.deepEqual(stored, [{ access: "a", refresh: "r", expires: 1, athlete: "Jaime" }]);
  const bad = async () => ({ ok: false, status: 400, json: async () => ({}) });
  const r2 = await completeOAuth({ code: "abc123def", server: false, fetchFn: bad, cfg: { clientId: "1", secret: "s" }, host: "jaime.github.io", store: () => assert.fail() });
  assert.equal(r2.ok, false); assert.match(r2.msg, /Callback-Domain \(jaime\.github\.io\)/);
});

test("Fehlertexte beim Synchronisieren", () => {
  assert.equal(syncErrorText(new TypeError("Failed to fetch")), MSG.offline);
  assert.equal(syncErrorText(new Error("x"), { online: false }), MSG.offline);
  assert.equal(syncErrorText(Object.assign(new Error("x"), { code: "strava" })), MSG.expired);
  assert.equal(syncErrorText(Object.assign(new Error("x"), { code: "auth" })), MSG.expired);
  assert.equal(syncErrorText(Object.assign(new Error("x"), { code: "token", status: 401 })), MSG.expired);
  assert.equal(syncErrorText(Object.assign(new Error("Strava-Limit erreicht, später nochmals versuchen"), { code: "rate" })), "Strava-Limit erreicht, später nochmals versuchen");
  assert.equal(serverErrorText(0, ""), MSG.down);
});
