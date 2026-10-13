// Minimaler statischer Server für die lokale Entwicklung (ES-Module brauchen http://, nicht file://).
// Aufruf: npm run dev  ->  http://localhost:8080
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = +process.env.PORT || 8080;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".css": "text/css", ".txt": "text/plain; charset=utf-8" };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  if (path.startsWith("..") || /^(node_modules|test|scripts|supabase)\b/.test(path)) { res.writeHead(404); return res.end(); }
  try {
    const body = await readFile(join(ROOT, path || "index.html"));
    res.writeHead(200, { "Content-Type": TYPES[extname(path || "index.html")] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch (_) { res.writeHead(404); res.end("Not found"); }
}).listen(PORT, () => console.log(`Basel Sub-60 läuft auf http://localhost:${PORT}`));
