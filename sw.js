const C = "hyrox-v6";
const FILES = ["./", "./index.html", "./config.js", "./manifest.json", "./icon.svg", "./icon-180.png", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  // Datenbank- und Login-Anfragen nie cachen, nur App-Dateien, Schriften und Bibliotheken
  if (e.request.method !== "GET" || new URL(e.request.url).hostname.endsWith("supabase.co")) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
