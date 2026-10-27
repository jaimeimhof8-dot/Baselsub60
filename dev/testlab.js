// Test-Labor (nur in der Testkopie auf Port 8081, ohne Cloud). Lädt vor der App-Logik (classic script vor dem Modul-Skript).
// Kann: jeden Klick beobachten (was hat sich im gespeicherten Zustand geändert?), Fehler sammeln, Abläufe aufnehmen und
// wiederholen (mit automatischen Erwartungen), alle Knöpfe jeder Ansicht durchklicken, Beispielstand und Datum wählen.
(() => {
  if (window.__tl) return;
  window.__tl = true;
  const LSK = "hx", ENDP = "/__feedback/tests", GOLD = "#e0bf6a";
  const SS = sessionStorage;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jget = (k, d) => { try { return JSON.parse(SS.getItem(k)) ?? d; } catch (_) { return d; } };
  const jset = (k, v) => { try { SS.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const job = () => jget("tl.job", null);
  const setJob = (j) => (j ? jset("tl.job", j) : SS.removeItem("tl.job"));
  const api = (m, b, url = ENDP) => fetch(url, { method: m, headers: { "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());

  // ---- Dialoge entschärfen (blockieren sonst die Seite) und Fehler sammeln
  const ERR = [];
  const addErr = (kind, msg) => { if (/Document hidden/.test(String(msg))) return; /* Tab im Hintergrund: Browser bricht Ansichtsübergänge ab, kein App-Fehler */ ERR.push({ kind, msg: String(msg).slice(0, 200), at: Date.now() }); if (ERR.length > 100) ERR.shift(); log({ kind: "error", text: kind + ": " + String(msg).slice(0, 160) }); };
  window.confirm = (m) => { log({ kind: "info", text: "confirm → ja: " + String(m).slice(0, 100) }); return true; };
  window.alert = (m) => log({ kind: "info", text: "alert: " + String(m).slice(0, 100) });
  window.prompt = () => "";
  addEventListener("error", (e) => addErr("JS-Fehler", `${e.message} (${(e.filename || "").split("/").pop()}:${e.lineno})`));
  addEventListener("unhandledrejection", (e) => addErr("Promise", e.reason && e.reason.message ? e.reason.message : e.reason));
  const ce = console.error;
  console.error = (...a) => { addErr("console.error", a.map((x) => (x && x.message) || x).join(" ")); ce.apply(console, a); };
  const of = window.fetch;
  window.fetch = function (u, o) {
    return of.apply(this, arguments).then((r) => { if (!r.ok && !String(u).includes("__feedback")) addErr("Netz " + r.status, u); return r; }, (e) => { if (!String(u).includes("__feedback")) addErr("Netz", u + " " + e.message); throw e; });
  };

  // ---- Start: Zustand vor dem Start der App setzen (Beispielstand, aufgenommener Stand)
  const clearHx = () => { for (const k of Object.keys(localStorage)) if (k === LSK || k.startsWith("hx:") || k.startsWith("hx_")) localStorage.removeItem(k); };
  const startState = (st) => {
    const base = (st && st.state) || (st && st.seed && window.TL_SEEDS && window.TL_SEEDS[st.seed] ? window.TL_SEEDS[st.seed]() : window.TL_SEEDS.leer());
    return st && st.merge ? Object.assign(base, st.merge) : base; // merge: Felder des Beispielstands ersetzen, z. B. {solo: {"2026-10-27": 1}}
  };
  const urlFor = (st) => "/" + (st && st.date ? "?heute=" + st.date : "");
  const J0 = job();
  if (J0 && J0.apply) { clearHx(); localStorage.setItem(LSK, JSON.stringify(J0.apply)); J0.apply = null; setJob(J0); }

  // ---- Zustand lesen, vergleichen
  const SKIP = new Set(["_t", "at", "garmin", "strava", "chat"]);
  const readState = () => { try { return JSON.parse(localStorage.getItem(LSK) || "{}"); } catch (_) { return {}; } };
  function flat(o, p, out) {
    if (o && typeof o === "object") {
      const ks = Object.keys(o);
      if (!ks.length) out[p || "/"] = Array.isArray(o) ? "[]" : "{}";
      for (const k of ks) { if (!p && SKIP.has(k)) continue; flat(o[k], p ? p + "/" + k : k, out); }
    } else out[p] = JSON.stringify(o);
    return out;
  }
  const snap = () => flat(readState(), "", {});
  function diff(a, b) {
    const d = [];
    for (const k of Object.keys(b)) if (!(k in a)) d.push({ t: "+", path: k, to: b[k] }); else if (a[k] !== b[k]) d.push({ t: "~", path: k, from: a[k], to: b[k] });
    for (const k of Object.keys(a)) if (!(k in b)) d.push({ t: "-", path: k, from: a[k] });
    return d;
  }
  const getPath = (o, path) => path.split("/").reduce((x, k) => (x == null ? undefined : x[k]), o);
  const fmtDiff = (x) => (x.t === "+" ? `+ ${x.path} = ${x.to}` : x.t === "-" ? `− ${x.path}` : `~ ${x.path}: ${x.from} → ${x.to}`);

  // ---- Elemente finden und beschreiben
  const isTl = (el) => !!(el && el.closest && el.closest("[data-tl],[data-fb]"));
  const INTER = 'button,a[href],summary,[role=button],[role=tab],[data-act],[data-fc],[data-v],[data-hold],input,select,textarea,label';
  const ATTRS = ["data-act", "data-fc", "data-v", "data-injd", "data-injm", "data-injs", "data-hold", "data-move", "data-i", "data-day", "data-c", "data-back", "data-k"];
  const visible = (el) => el.getClientRects().length > 0;
  const labelOf = (el) => (el.getAttribute("aria-label") || el.textContent || el.value || "").trim().replace(/\s+/g, " ").slice(0, 40);
  function selFor(el) {
    if (el.id) return "#" + CSS.escape(el.id);
    const q = (v) => v.split("\\").join("\\\\").split('"').join('\\"'); // Wert für einen Attribut-Selektor in Anführungszeichen
    const at = ATTRS.filter((a) => el.hasAttribute(a)).map((a) => `[${a}="${q(el.getAttribute(a))}"]`).join("");
    if (at) return el.tagName.toLowerCase() + at;
    const parts = [];
    let c = el;
    while (c && c !== document.body && parts.length < 4) {
      const cls = [...c.classList].slice(0, 2).map((x) => "." + CSS.escape(x)).join("");
      parts.unshift(c.tagName.toLowerCase() + cls);
      c = c.parentElement;
    }
    return parts.join(" > ");
  }
  function findEl(sel, text) {
    let c = [];
    try { c = [...document.querySelectorAll(sel)].filter((e) => visible(e) && !isTl(e)); } catch (_) {}
    if (c.length > 1 && text) { const f = c.filter((e) => labelOf(e).includes(text)); if (f.length) c = f; }
    if (c.length) return c[0];
    if (text) return [...document.querySelectorAll(INTER)].filter((e) => visible(e) && !isTl(e)).find((e) => labelOf(e) === text) || [...document.querySelectorAll(INTER)].filter((e) => visible(e) && !isTl(e)).find((e) => labelOf(e).includes(text)) || null;
    return null;
  }
  async function waitEl(sel, text, ms = 2500) {
    const t0 = Date.now();
    for (;;) { const e = findEl(sel, text); if (e || Date.now() - t0 > ms) return e; await sleep(120); }
  }
  async function ready() {
    const t0 = Date.now();
    for (;;) { const m = document.getElementById("main"); if (m && m.innerHTML.length > 200) return; if (Date.now() - t0 > 8000) return; await sleep(150); }
    // eslint-disable-next-line no-unreachable
  }
  async function mark(el) {
    const r = el.getBoundingClientRect();
    const b = document.createElement("div");
    b.setAttribute("data-tl", "");
    b.style.cssText = `position:fixed;z-index:120;pointer-events:none;border:2px solid ${GOLD};border-radius:6px;background:rgba(224,191,106,.2);left:${r.left - 3}px;top:${r.top - 3}px;width:${r.width + 6}px;height:${r.height + 6}px`;
    document.body.appendChild(b);
    await sleep(450);
    b.remove();
  }
  const fire = (el, type, init = {}) => el.dispatchEvent(new (type.startsWith("pointer") ? PointerEvent : MouseEvent)(type, { bubbles: true, cancelable: true, composed: true, pointerId: 1, isPrimary: true, clientX: el.getBoundingClientRect().left + 5, clientY: el.getBoundingClientRect().top + 5, ...init }));
  async function doHold(el, ms) {
    fire(el, "pointerdown"); fire(el, "mousedown");
    await sleep(ms);
    fire(el, "pointerup"); fire(el, "mouseup");
  }
  async function doInput(el, value) {
    if (el.type === "checkbox" || el.type === "radio") { if (el.checked !== !!value) el.click(); return; }
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ---- Protokoll (Beobachter)
  const LOG = [];
  function log(e) { LOG.unshift({ ...e, at: Date.now() }); if (LOG.length > 80) LOG.pop(); ui.dirty = true; scheduleRender(); }
  document.addEventListener("click", (ev) => {
    if (isTl(ev.target) || !ev.isTrusted) return;
    const el = ev.target.closest(INTER) || ev.target, before = snap(), text = labelOf(el) || selFor(el);
    setTimeout(() => { const d = diff(before, snap()); log({ kind: "click", text, diff: d }); }, 450);
  }, true);

  // ---- Aufnehmen
  let R = null; // laufende Aufnahme {name, start, steps}
  const loadRec = () => { const j = job(); R = j && j.kind === "rec" ? j : null; };
  const saveRec = () => { if (R) setJob(R); };
  let lastSnap = null, suppressClick = 0, holdStart = null;
  function pushStep(step) {
    if (!R) return;
    const before = lastSnap || snap();
    R.steps.push(step); saveRec(); ui.dirty = true; scheduleRender();
    setTimeout(() => {
      const after = snap(), d = diff(before, after).filter((x) => !/\/at$/.test(x.path) && !(x.t === "+" && ["{}", "[]", "null"].includes(x.to))).slice(0, 12); // leere Standardfelder, die die App beim ersten Speichern anlegt, sind Rauschen
      step.expect = d.map((x) => (x.t === "-" ? { kind: "state", path: x.path, op: "absent" } : { kind: "state", path: x.path, op: "eq", value: JSON.parse(x.to) }));
      lastSnap = after; saveRec(); ui.dirty = true; scheduleRender();
    }, 500);
  }
  document.addEventListener("click", (ev) => {
    if (!R || isTl(ev.target) || !ev.isTrusted || Date.now() < suppressClick) return;
    const el = ev.target.closest(INTER) || ev.target;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) && el.type !== "checkbox" && el.type !== "radio") return;
    pushStep({ type: "click", sel: selFor(el), text: labelOf(el), expect: [] });
  }, true);
  document.addEventListener("pointerdown", (ev) => { if (R && ev.isTrusted && !isTl(ev.target)) { const h = ev.target.closest("[data-hold]"); holdStart = h ? { h, t: Date.now() } : null; } }, true);
  document.addEventListener("pointerup", (ev) => {
    if (!R || !ev.isTrusted || !holdStart) return;
    const ms = Date.now() - holdStart.t, h = holdStart.h; holdStart = null;
    if (ms > 350) { suppressClick = Date.now() + 400; pushStep({ type: "hold", sel: selFor(h), text: labelOf(h), ms: Math.round(ms), expect: [] }); }
  }, true);
  document.addEventListener("change", (ev) => {
    if (!R || !ev.isTrusted || isTl(ev.target)) return;
    const el = ev.target;
    if (!["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) return;
    pushStep({ type: "input", sel: selFor(el), text: labelOf(el), value: el.type === "checkbox" || el.type === "radio" ? el.checked : el.value, expect: [] });
  }, true);

  // ---- Abspielen
  function evalExpect(ex) {
    const st = readState();
    if (ex.kind === "todo") return { s: "todo", m: ex.note };
    if (ex.kind === "state") {
      const v = getPath(st, ex.path);
      if (ex.op === "absent") return v === undefined ? { s: "ok", m: `${ex.path} fehlt` } : { s: "fail", m: `${ex.path} sollte fehlen, ist ${JSON.stringify(v)}` };
      if (ex.op === "exists") return v !== undefined ? { s: "ok", m: `${ex.path} vorhanden` } : { s: "fail", m: `${ex.path} fehlt` };
      return JSON.stringify(v) === JSON.stringify(ex.value) ? { s: "ok", m: `${ex.path} = ${JSON.stringify(ex.value)}` } : { s: "fail", m: `${ex.path}: erwartet ${JSON.stringify(ex.value)}, gefunden ${JSON.stringify(v)}` };
    }
    if (ex.kind === "prefixcount") {
      const o = getPath(st, ex.path) || {}, n = Object.keys(o).filter((k) => k.startsWith(ex.prefix)).length;
      const ok = (ex.min == null || n >= ex.min) && (ex.max == null || n <= ex.max);
      return { s: ok ? "ok" : "fail", m: `${ex.path}/${ex.prefix}…: ${n} Einträge (erwartet ${ex.min ?? 0}–${ex.max ?? "∞"})` };
    }
    if (ex.kind === "text") {
      const has = document.body.innerText.includes(ex.text);
      return has === (ex.present !== false) ? { s: "ok", m: `Text «${ex.text}» ${has ? "sichtbar" : "nicht sichtbar"}` } : { s: "fail", m: `Text «${ex.text}» ${has ? "ist sichtbar, sollte nicht" : "fehlt"}` };
    }
    if (ex.kind === "sel") {
      let has = false; try { has = !!document.querySelector(ex.sel); } catch (_) {}
      return has === (ex.present !== false) ? { s: "ok", m: `${ex.sel} ${has ? "vorhanden" : "nicht vorhanden"}` } : { s: "fail", m: `${ex.sel} ${has ? "vorhanden, sollte nicht" : "fehlt"}` };
    }
    return { s: "fail", m: "unbekannte Erwartung" };
  }
  async function runSteps(sc) {
    const res = { name: sc.name, steps: [], ok: true };
    const errStart = ERR.length;
    for (let i = 0; i < sc.steps.length; i++) {
      const st = sc.steps[i], r = { n: i + 1, text: `${st.type} ${st.text || st.sel || ""}`.trim(), checks: [] };
      res.steps.push(r);
      ui.progress = `${sc.name}: Schritt ${i + 1}/${sc.steps.length}`; ui.dirty = true; scheduleRender();
      if (st.type !== "wait") {
        const el = await waitEl(st.sel, st.text);
        if (!el) { r.checks.push({ s: "fail", m: `Element nicht gefunden: ${st.sel}${st.text ? " «" + st.text + "»" : ""}` }); res.ok = false; break; }
        el.scrollIntoView({ block: "center" });
        await mark(el);
        if (st.type === "click") el.click();
        else if (st.type === "hold") await doHold(el, Math.max(st.ms || 900, 700));
        else if (st.type === "input") await doInput(el, st.value);
      } else await sleep(st.ms || 500);
      await sleep(550);
      for (const ex of st.expect || []) { // Erwartung darf einen Moment brauchen (Ansicht rendert, Speichern läuft): bis 2 s erneut prüfen
        let c = evalExpect(ex);
        for (let k = 0; k < 10 && c.s === "fail"; k++) { await sleep(200); c = evalExpect(ex); }
        r.checks.push(c); if (c.s === "fail") res.ok = false;
      }
    }
    const newErr = ERR.slice(errStart);
    if (newErr.length) { res.ok = false; res.steps.push({ n: "–", text: "JS-/Netzfehler während des Ablaufs", checks: newErr.map((e) => ({ s: "fail", m: `${e.kind}: ${e.msg}` })) }); }
    return res;
  }
  function startPlay(list) {
    const first = list[0];
    setJob({ kind: "play", queue: list, qi: 0, results: [], apply: startState(first.start), url: urlFor(first.start) });
    location.href = urlFor(first.start);
  }
  async function continuePlay(j) {
    await ready(); await sleep(600);
    const sc = j.queue[j.qi];
    const res = await runSteps(sc);
    j.results.push(res); j.qi++;
    if (j.qi < j.queue.length) {
      const nx = j.queue[j.qi];
      j.apply = startState(nx.start); setJob(j);
      location.href = urlFor(nx.start);
      return;
    }
    const report = { kind: "ablauf", at: new Date().toISOString(), results: j.results };
    api("POST", report, "/__feedback/tests-result");
    jset("tl.report", report); setJob(null); ui.progress = ""; ui.tab = "res"; ui.open = true; ui.dirty = true; scheduleRender();
  }

  // ---- Auto-Durchlauf: jeder sichtbare Knopf jeder Ansicht, jeweils nach frischem Zustand
  function startAuto(seed, date) {
    const st = { seed, date };
    setJob({ kind: "auto", seed, date, views: null, vi: 0, ei: 0, results: [], apply: startState(st) });
    location.href = urlFor(st);
  }
  async function continueAuto(j) {
    await ready(); await sleep(500);
    if (!j.views) j.views = [...new Set([...document.querySelectorAll("[data-v]")].map((b) => b.dataset.v))];
    while (j.vi < j.views.length) {
      const v = j.views[j.vi];
      const nav = document.querySelector(`[data-v="${v}"]`);
      if (nav) nav.click();
      await sleep(600);
      const main = document.getElementById("main");
      const cands = [...main.querySelectorAll('button,a[href],summary,[role=button],[role=tab],[data-act],[data-fc],[data-hold]')].filter((e) => visible(e) && !isTl(e) && !e.disabled && !e.hasAttribute("data-v"));
      if (j.ei === 0) {
        const over = document.documentElement.scrollWidth > innerWidth + 2;
        j.results.push({ view: v, count: cands.length, overflow: over, empty: main.innerText.trim().length < 20, items: [] });
      }
      const rv = j.results[j.results.length - 1];
      if (j.ei >= cands.length) { j.vi++; j.ei = 0; setJob(j); continue; }
      const el = cands[j.ei];
      ui.progress = `Auto-Durchlauf: ${v} ${j.ei + 1}/${cands.length}`; ui.dirty = true; scheduleRender();
      const before = snap(), txt = document.body.innerText, e0 = ERR.length, label = labelOf(el) || selFor(el);
      el.scrollIntoView({ block: "center" });
      if (el.hasAttribute("data-hold")) await doHold(el, 1200); else el.click();
      await sleep(600);
      const d = diff(before, snap()), errs = ERR.slice(e0), changed = document.body.innerText !== txt || !!document.getElementById("focus");
      rv.items.push({ label, sel: selFor(el), state: d.slice(0, 6).map(fmtDiff), errors: errs.map((x) => `${x.kind}: ${x.msg}`), noEffect: !d.length && !changed && !errs.length });
      j.ei++; j.apply = startState({ seed: j.seed }); setJob(j);
      location.reload();
      return;
    }
    const report = { kind: "auto", at: new Date().toISOString(), seed: j.seed, results: j.results };
    api("POST", report, "/__feedback/tests-result");
    jset("tl.report", report); setJob(null); ui.progress = ""; ui.tab = "res"; ui.open = true; ui.dirty = true; scheduleRender();
  }

  // ---- Oberfläche
  const ui = { open: jget("tl.open", false), tab: jget("tl.tab", "log"), dirty: true, progress: "", scen: [], msg: "" };
  const root = document.createElement("div");
  root.setAttribute("data-tl", ""); root.setAttribute("data-fb", "");
  const css = document.createElement("style");
  css.textContent = `
  [data-tl]{box-sizing:border-box;font:400 13px/18px system-ui,sans-serif;color:var(--text,#f5f5f7)}
  .tl-box{position:fixed;right:12px;bottom:12px;z-index:2147483000;width:380px;max-height:62vh;overflow-y:auto;background:var(--card,#0e1016);border-radius:16px;padding:10px;box-shadow:var(--edge,none),0 8px 30px rgba(0,0,0,.6);display:flex;flex-direction:column;gap:8px}
  .tl-pill{position:fixed;right:12px;bottom:12px;z-index:2147483000;background:var(--card,#0e1016);padding:8px 14px;border-radius:999px;font-weight:600;box-shadow:var(--edge,none),0 4px 14px rgba(0,0,0,.5);cursor:pointer;border:0;color:inherit}
  .tl-b{border:0;background:var(--well,#161922);color:inherit;border-radius:999px;padding:5px 10px;font:600 12px system-ui;cursor:pointer}
  .tl-b.on{background:${GOLD};color:#16181a}.tl-b.red{background:#ff6961;color:#16181a}
  .tl-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .tl-it{background:var(--well,#161922);border-radius:10px;padding:7px 9px;display:flex;flex-direction:column;gap:2px;word-break:break-word}
  .tl-m{color:var(--muted,#9a9ba3);font-size:12px}.tl-ok{color:#30d158}.tl-fail{color:#ff6961}.tl-todo{color:#ff9f0a}
  .tl-box input,.tl-box select,.tl-box textarea{background:var(--well,#161922);color:inherit;border:0;border-radius:8px;padding:6px 8px;font:13px system-ui;max-width:100%}
  `;
  document.head.appendChild(css);
  document.body.appendChild(root);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  let rt = 0;
  function scheduleRender() { clearTimeout(rt); rt = setTimeout(render, 80); }
  const mark2 = (s) => (s === "ok" ? "✓" : s === "fail" ? "✗" : "⚠");

  function tabLog() {
    if (!LOG.length) return `<div class="tl-m">Noch nichts. Klicke in der App: hier steht, was sich im gespeicherten Zustand geändert hat und welche Fehler auftraten.</div>`;
    return LOG.slice(0, 40).map((e) => e.kind === "click"
      ? `<div class="tl-it"><b>${esc(e.text)}</b>${e.diff.length ? e.diff.slice(0, 8).map((x) => `<span class="tl-m">${esc(fmtDiff(x))}</span>`).join("") + (e.diff.length > 8 ? `<span class="tl-m">… +${e.diff.length - 8} weitere</span>` : "") : `<span class="tl-todo">kein gespeicherter Zustand geändert</span>`}</div>`
      : `<div class="tl-it"><span class="${e.kind === "error" ? "tl-fail" : "tl-m"}">${esc(e.text)}</span></div>`).join("");
  }
  function tabRec() {
    if (R) {
      return `<div class="tl-row"><b>● ${esc(R.name)}</b><button class="tl-b red" data-tl-a="rec-stop">■ Speichern</button><button class="tl-b" data-tl-a="rec-cancel">Verwerfen</button></div>
      <div class="tl-m">Klicke jetzt durch die App. Jeder Schritt bekommt als Erwartung, was er im Zustand geändert hat.</div>
      ${R.steps.map((s, i) => `<div class="tl-it"><div class="tl-row"><b>${i + 1}. ${esc(s.type)} ${esc(s.text || s.sel)}</b><button class="tl-b" data-tl-a="step-del" data-i="${i}">×</button></div>
        ${(s.expect || []).map((x, k) => `<span class="tl-m">${esc(x.kind === "state" ? `${x.path} ${x.op === "eq" ? "= " + JSON.stringify(x.value) : x.op === "absent" ? "fehlt" : "vorhanden"}` : x.kind + " " + (x.text || x.sel || x.note || ""))} <a data-tl-a="ex-del" data-i="${i}" data-k="${k}" style="cursor:pointer;color:${GOLD}">×</a></span>`).join("")}</div>`).join("")}
      <div class="tl-it"><span class="tl-m">Erwartung zum letzten Schritt hinzufügen:</span><div class="tl-row"><select id="tl-xk"><option value="text">Text sichtbar</option><option value="notext">Text nicht sichtbar</option><option value="sel">Element vorhanden</option><option value="nosel">Element weg</option><option value="todo">fehlt noch (Notiz)</option></select><input id="tl-xv" placeholder="Text / Selektor / Notiz" style="flex:1;min-width:120px"><button class="tl-b" data-tl-a="ex-add">＋</button></div></div>`;
    }
    const sd = Object.keys(window.TL_SEEDS).map((k) => `<option value="${k}">${k}</option>`).join("");
    return `<div class="tl-it"><b>Neuen Ablauf aufnehmen</b>
      <input id="tl-rn" placeholder="Name, z. B. Krank melden 3 Tage"><div class="tl-row"><select id="tl-rs">${sd}<option value="__cur">aktueller Stand</option></select><input id="tl-rd" type="date" value="2026-10-27"></div>
      <button class="tl-b on" data-tl-a="rec-start">● Aufnehmen starten</button><span class="tl-m">Die Seite lädt mit dem gewählten Stand und Datum neu. Danach alles ganz normal bedienen.</span></div>`;
  }
  function tabPlay() {
    if (!ui.scen.length) return `<div class="tl-m">Lade Abläufe …</div>`;
    return `<div class="tl-row"><button class="tl-b on" data-tl-a="play-all">▶ Alle abspielen</button></div>` + ui.scen.map((s, i) => `<div class="tl-it"><div class="tl-row"><b>${esc(s.name)}</b><span class="tl-m">${s.steps.length} Schritte${s.builtin ? " · mitgeliefert" : ""}</span></div>${s.note ? `<span class="tl-m">${esc(s.note)}</span>` : ""}
      <div class="tl-row"><button class="tl-b" data-tl-a="play" data-i="${i}">▶ Abspielen</button>${s.builtin ? "" : `<button class="tl-b" data-tl-a="scen-del" data-i="${i}">Löschen</button>`}</div></div>`).join("");
  }
  function tabAuto() {
    return `<div class="tl-it"><b>Auto-Durchlauf</b><span class="tl-m">Klickt in jeder Ansicht jeden sichtbaren Knopf einzeln an (jeweils mit frischem Beispielstand) und meldet Fehler, wirkungslose Knöpfe und Überlauf. Dauert einige Minuten, die Seite lädt dabei oft neu.</span>
      <div class="tl-row"><select id="tl-as">${Object.keys(window.TL_SEEDS).map((k) => `<option>${k}</option>`).join("")}</select><input id="tl-ad" type="date" value="2026-10-27"></div>
      <button class="tl-b on" data-tl-a="auto-start">⚙ Starten</button></div>`;
  }
  function tabStand() {
    return `<div class="tl-it"><b>Beispielstand und Datum</b><div class="tl-row"><select id="tl-ss">${Object.keys(window.TL_SEEDS).map((k) => `<option>${k}</option>`).join("")}</select><input id="tl-sd" type="date" value="${esc(new URLSearchParams(location.search).get("heute") || "2026-10-27")}"><button class="tl-b on" data-tl-a="seed-apply">Laden</button></div><span class="tl-m">Setzt den gespeicherten Zustand dieser Testkopie zurück. Deine echten Daten auf Port 8080 bleiben unberührt.</span></div>
      <div class="tl-it"><b>Zustand ansehen / einspielen</b><textarea id="tl-st" rows="5" placeholder="JSON"></textarea><div class="tl-row"><button class="tl-b" data-tl-a="st-show">Aktuellen anzeigen</button><button class="tl-b" data-tl-a="st-load">Einspielen</button></div></div>`;
  }
  function tabRes() {
    const r = jget("tl.report", null);
    if (!r) return `<div class="tl-m">Noch kein Ergebnis.</div>`;
    if (r.kind === "ablauf")
      return `<div class="tl-m">${esc(r.at)} · wurde auch nach .feedback/tests-result.json geschrieben</div>` + r.results.map((x) => `<div class="tl-it"><b class="${x.ok ? "tl-ok" : "tl-fail"}">${x.ok ? "✓" : "✗"} ${esc(x.name)}</b>${x.steps.map((s) => `<span class="tl-m">${esc(s.n)}. ${esc(s.text)}</span>` + s.checks.map((c) => `<span class="tl-${c.s}">&nbsp;&nbsp;${mark2(c.s)} ${esc(c.m)}</span>`).join("")).join("")}</div>`).join("");
    return `<div class="tl-m">${esc(r.at)} · Stand «${esc(r.seed)}»</div>` + r.results.map((v) => {
      const bad = v.items.filter((i) => i.errors.length), none = v.items.filter((i) => i.noEffect);
      return `<div class="tl-it"><b>${esc(v.view)} · ${v.count} Knöpfe</b>${v.overflow ? `<span class="tl-fail">✗ Überlauf nach rechts</span>` : ""}${v.empty ? `<span class="tl-fail">✗ Ansicht leer</span>` : ""}
        ${bad.map((i) => `<span class="tl-fail">✗ ${esc(i.label)}: ${esc(i.errors.join("; "))}</span>`).join("")}
        ${none.map((i) => `<span class="tl-todo">⚠ ohne Wirkung: ${esc(i.label)} (${esc(i.sel)})</span>`).join("")}
        ${!bad.length && !none.length && !v.overflow && !v.empty ? `<span class="tl-ok">✓ alles in Ordnung</span>` : ""}</div>`;
    }).join("");
  }
  function render() {
    if (!ui.dirty) return;
    ui.dirty = false;
    jset("tl.open", ui.open); jset("tl.tab", ui.tab);
    const keep = ["tl-rn", "tl-rd", "tl-rs", "tl-xk", "tl-xv", "tl-as", "tl-ad", "tl-ss", "tl-sd", "tl-st"].map((id) => { const e = root.querySelector("#" + id); return e ? [id, e.value, document.activeElement === e] : null; }).filter(Boolean);
    if (!ui.open) { root.innerHTML = `<button class="tl-pill" data-tl-a="open">🧪 Test${R ? " ●" : ""}${ERR.length ? ` · ${ERR.length} Fehler` : ""}</button>`; return; }
    const tabs = [["log", "Protokoll"], ["rec", R ? "● Aufnahme" : "Aufnehmen"], ["play", "Abspielen"], ["auto", "Auto"], ["stand", "Stand"], ["res", "Ergebnis"]];
    root.innerHTML = `<div class="tl-box"><div class="tl-row" style="justify-content:space-between"><b>🧪 Test-Labor <span class="tl-m">(Testkopie, ohne Cloud)</span></b><button class="tl-b" data-tl-a="close">–</button></div>
      <div class="tl-row">${tabs.map(([k, n]) => `<button class="tl-b ${ui.tab === k ? "on" : ""}" data-tl-a="tab" data-k="${k}">${n}</button>`).join("")}</div>
      ${ui.progress ? `<div class="tl-it"><span class="tl-todo">${esc(ui.progress)}</span></div>` : ""}
      ${ERR.length && ui.tab !== "log" ? `<div class="tl-m tl-fail">${ERR.length} Fehler im Protokoll</div>` : ""}
      ${ui.msg ? `<div class="tl-m">${esc(ui.msg)}</div>` : ""}
      ${{ log: tabLog, rec: tabRec, play: tabPlay, auto: tabAuto, stand: tabStand, res: tabRes }[ui.tab]()}</div>`;
    for (const [id, v, f] of keep) { const e = root.querySelector("#" + id); if (e) { e.value = v; if (f) e.focus(); } }
  }

  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-tl-a]");
    if (!b) return;
    const a = b.dataset.tlA, val = (id) => (root.querySelector("#" + id) || {}).value;
    if (a === "open") ui.open = true;
    else if (a === "close") ui.open = false;
    else if (a === "tab") { ui.tab = b.dataset.k; ui.msg = ""; if (ui.tab === "play") api("GET").then((l) => { ui.scen = l; ui.dirty = true; scheduleRender(); }); }
    else if (a === "seed-apply") { const st = { seed: val("tl-ss"), date: val("tl-sd") }; setJob({ kind: "idle", apply: startState(st) }); location.href = urlFor(st); return; }
    else if (a === "st-show") root.querySelector("#tl-st").value = JSON.stringify(readState(), null, 1);
    else if (a === "st-load") { try { const o = JSON.parse(val("tl-st")); setJob({ kind: "idle", apply: o }); location.reload(); return; } catch (_) { ui.msg = "Kein gültiges JSON"; } }
    else if (a === "auto-start") { startAuto(val("tl-as"), val("tl-ad")); return; }
    else if (a === "rec-start") {
      const name = (val("tl-rn") || "").trim(), date = val("tl-rd") || "", sel = val("tl-rs");
      if (!name) { ui.msg = "Bitte einen Namen eingeben."; }
      else {
        const state = sel === "__cur" ? readState() : startState({ seed: sel });
        setJob({ kind: "rec", name, start: { state, date, seed: sel === "__cur" ? null : sel }, steps: [], apply: state });
        location.href = urlFor({ date }); return;
      }
    } else if (a === "rec-stop") {
      if (R && R.steps.length) { await api("POST", { name: R.name, start: R.start, steps: R.steps }); ui.msg = `«${R.name}» gespeichert (${R.steps.length} Schritte). Unter «Abspielen» findest du es.`; }
      setJob(null); R = null; ui.tab = "play"; api("GET").then((l) => { ui.scen = l; ui.dirty = true; scheduleRender(); });
    } else if (a === "rec-cancel") { setJob(null); R = null; }
    else if (a === "step-del") { R.steps.splice(+b.dataset.i, 1); saveRec(); }
    else if (a === "ex-del") { R.steps[+b.dataset.i].expect.splice(+b.dataset.k, 1); saveRec(); }
    else if (a === "ex-add") {
      const k = val("tl-xk"), v = (val("tl-xv") || "").trim(), s = R && R.steps[R.steps.length - 1];
      if (s && (v || k)) s.expect.push(k === "text" ? { kind: "text", text: v, present: true } : k === "notext" ? { kind: "text", text: v, present: false } : k === "sel" ? { kind: "sel", sel: v, present: true } : k === "nosel" ? { kind: "sel", sel: v, present: false } : { kind: "todo", note: v });
      saveRec();
    } else if (a === "play") startPlay([ui.scen[+b.dataset.i]]);
    else if (a === "play-all") startPlay(ui.scen);
    else if (a === "scen-del") { await api("DELETE", { name: ui.scen[+b.dataset.i].name }); ui.scen = await api("GET"); }
    ui.dirty = true; render();
  });

  // ---- Start der laufenden Jobs, sobald die App steht
  (async () => {
    await (document.readyState === "complete" ? 0 : new Promise((r) => addEventListener("load", r)));
    ui.dirty = true; render();
    const j = job();
    if (!j) return;
    if (j.kind === "rec") { loadRec(); lastSnap = snap(); ui.open = true; ui.tab = "rec"; ui.dirty = true; render(); }
    else if (j.kind === "play") { ui.open = true; ui.tab = "res"; ui.dirty = true; render(); continuePlay(j); }
    else if (j.kind === "auto") { ui.open = true; ui.tab = "res"; ui.dirty = true; render(); continueAuto(j); }
    else if (j.kind === "idle") setJob(null);
  })();
})();
