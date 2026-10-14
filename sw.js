const C = "hyrox-v45";
const SRC = ["dates", "util", "plan-data", "plan-store", "parser", "pdftext", "pdf-import", "adapt", "strava", "share", "backup", "coach", "weights", "profile", "structure", "plan-later", "soreness", "validate", "strava-auth", "garmin", "dashboard", "solo", "extras", "merge", "swap"].map(f => "./src/" + f + ".js");
const FILES = ["./", "./index.html", "./config.js", "./manifest.json", "./icon.svg", "./icon-180.png", "./icon-192.png", "./icon-512.png", ...SRC];
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  // Datenbank-, Login- und Strava-Anfragen nie cachen, nur App-Dateien, Schriften und Bibliotheken
  const host = new URL(e.request.url).hostname;
  if (e.request.method !== "GET" || host.endsWith("supabase.co") || host.endsWith("strava.com") || host.endsWith("garmin.com")) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok || r.type === "opaque") { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); } return r; }).catch(() => caches.match(e.request)));
});
