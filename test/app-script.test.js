import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

// index.html enthält die ganze App-Logik in einem Modul-Skript. Ein Syntaxfehler oder ein doppelt vergebener Name
// (z. B. zwei `const SIM`) lässt die App mit leerem Bildschirm starten und wird von keinem anderen Test bemerkt.
test("Modul-Skript in index.html hat keine Syntaxfehler und keine doppelten Namen", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(m, "Modul-Skript nicht gefunden");
  const file = join(mkdtempSync(join(tmpdir(), "hx-")), "app.mjs");
  writeFileSync(file, m[1]);
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (e) {
    assert.fail(String(e.stderr).split("\n").slice(0, 6).join("\n"));
  }
});
