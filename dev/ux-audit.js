// UX-Check für die Handy-Ansicht (nur Entwicklung, wird nie ausgeliefert).
// Findet, was man auf einem statischen Design-Bild nicht sieht: verdeckte Knöpfe, Inhalt unter der Tab-Leiste,
// seitliches Überlaufen, zu kleine Treffer, abgeschnittene Texte.
// Aufruf in der Browser-Konsole der Testkopie:  await uxAudit()   oder   await uxAudit(["today","week"])
// Beispielstand vorher laden:  /?seed=voll&heute=2026-10-13   (Seeds: voll, leer, checkin, analyse, vergleich)
(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const SKIP = '[class*="tl-"],[class*="fb-"],#tl,#fb,[id^="tl"],[id^="fb"]';
  const INTER = 'button,a[href],[role="button"],summary,select,textarea,input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),[data-act]';
  const visible = (e) => {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0.05 && !e.closest(SKIP) && !e.closest("[hidden],[inert]") && !(e.closest("details:not([open])") && e.tagName !== "SUMMARY" && !e.closest("summary")) && !(r.width <= 2 && r.height <= 2);
  };
  // Schwebende Entwicklungs-Werkzeuge (Test, Kommentare, Handy) liegen direkt unter <body> und gehören nicht zur App
  const isDevTool = (e) => { const t = e.closest("body > *"); return !!t && !["main", "nav"].includes(t.tagName.toLowerCase()) && /Kommentar|Test|Chat|Handy/.test(t.textContent.slice(0, 80)) && getComputedStyle(t).position === "fixed"; };
  const name = (e) => {
    const t = (e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 28);
    return `${e.tagName.toLowerCase()}${e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : ""} "${t}"`;
  };
  const nav = () => { const n = document.querySelector("#nav"); if (!n || n.hidden || !n.getBoundingClientRect().height) return null; const r = n.getBoundingClientRect(); return r.top > innerHeight / 2 ? r : null; };

  async function checkView(v) {
    const found = new Map();
    const add = (kind, e, extra) => { const k = kind + "|" + name(e); if (!found.has(k)) found.set(k, { kind, el: name(e), extra: extra || "" }); };
    const root = document.scrollingElement;
    if (root.scrollWidth > innerWidth + 1) found.set("overflow", { kind: "Seitlicher Überlauf", el: "Seite", extra: `${root.scrollWidth}px > ${innerWidth}px` });
    root.scrollTo(0, 0); await sleep(120);
    const step = Math.max(200, innerHeight * 0.6);
    let y = 0, guard = 0;
    for (;;) {
      const n = nav();
      for (const e of document.querySelectorAll(INTER)) {
        if (!visible(e)) continue;
        const r = e.getBoundingClientRect();
        if (r.bottom <= 0 || r.top >= innerHeight) continue;
        const h = Math.round(r.height), w = Math.round(r.width);
        if ((h < 43 || w < 30) && !e.closest("label") && !(e.tagName === "INPUT" && h >= 36)) add("Treffer zu klein", e, `${w}×${h}px`);
        // Verdeckt? Nur der sichtbare Teil über der Tab-Leiste zählt, der Rest wird beim Scrollen erreicht.
        const top = Math.max(r.top, 0), bot = Math.min(r.bottom, n ? n.top : innerHeight);
        if (bot - top > 8) {
          const px = r.left + r.width / 2, py = (top + bot) / 2, hit = document.elementFromPoint(px, py);
          if (hit && hit !== e && !e.contains(hit) && !hit.contains(e) && !hit.closest(SKIP) && !isDevTool(hit)) add("Verdeckt", e, `von ${name(hit)}`);
        }
      }
      for (const e of document.querySelectorAll("main *")) {
        if (e.children.length > 3 || !e.textContent.trim() || !visible(e)) continue;
        const cs = getComputedStyle(e);
        if (e.scrollWidth > e.clientWidth + 2 && /hidden|clip/.test(cs.overflowX) && cs.textOverflow !== "ellipsis" && e.clientWidth > 0) add("Text abgeschnitten", e, `${e.scrollWidth}px in ${e.clientWidth}px`);
      }
      const max = root.scrollHeight - innerHeight;
      if (y >= max - 2 || ++guard > 40) break;
      y = Math.min(max, y + step); root.scrollTo(0, y); await sleep(90);
    }
    // Ende der Seite: Ist der letzte Knopf noch frei über der Tab-Leiste?
    const n = nav();
    if (n) {
      const all = [...document.querySelectorAll("main " + INTER.split(",").join(", main "))].filter(visible);
      const last = all.filter((e) => e.getBoundingClientRect().bottom > 0).sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
      if (last && last.getBoundingClientRect().bottom > n.top + 1) add("Unter Tab-Leiste", last, `Ende ${Math.round(last.getBoundingClientRect().bottom)} > Leiste ${Math.round(n.top)}`);
    }
    root.scrollTo(0, 0);
    return [...found.values()];
  }

  window.uxAudit = async function (views) {
    const out = {};
    const list = views || [...new Set([...document.querySelectorAll("[data-v]")].map((b) => b.dataset.v))];
    const err = [];
    const onErr = (e) => err.push(String(e.message || e.reason));
    addEventListener("error", onErr); addEventListener("unhandledrejection", onErr);
    for (const v of list) {
      const b = [...document.querySelectorAll(`[data-v="${v}"]`)].find((x) => x.offsetParent !== null) || document.querySelector(`[data-v="${v}"]`);
      if (!b) { out[v] = [{ kind: "Kein Zugang", el: "data-v=" + v, extra: "" }]; continue; }
      b.click(); await sleep(900);
      out[v] = await checkView(v);
    }
    removeEventListener("error", onErr); removeEventListener("unhandledrejection", onErr);
    if (err.length) out["(JS-Fehler)"] = err.map((m) => ({ kind: "JS-Fehler", el: m.slice(0, 100), extra: "" }));
    return out;
  };
})();
