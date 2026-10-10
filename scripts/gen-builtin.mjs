// Erzeugt src/plan-later.js: Woche 5 bis Taper des eingebauten Plans, mit dem PDF-Parser aus dem
// Coach-PDF (Text in test/fixtures/plan-provisorisch.txt) gelesen. So zeigen auch diese Wochen
// Übungszeilen statt nur des Titels. Aufruf nach Änderungen am Parser oder am Plan-Text:
//   node scripts/gen-builtin.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { parsePlanText } from "../src/parser.js";
import { RACE_IDX } from "../src/plan-data.js";

const text = readFileSync(new URL("../test/fixtures/plan-provisorisch.txt", import.meta.url), "utf8");
const { days } = parsePlanText(text);
const out = {};
for (const [k, d] of Object.entries(days)) {
  const idx = +k;
  if (idx < 28 || idx >= RACE_IDX) continue;
  const { src, ...day } = d;
  out[idx] = day;
}
const body = Object.entries(out).map(([k, d]) => `  ${k}: ${JSON.stringify(d)}`).join(",\n");
writeFileSync(new URL("../src/plan-later.js", import.meta.url),
  `// GENERIERT von scripts/gen-builtin.mjs – nicht von Hand ändern.\n` +
  `// Eingebauter Plan ab Woche 5 (Block B bis Taper, Stand 18.09.2026), aus dem Coach-PDF gelesen.\n` +
  `export const LATER_DAYS = {\n${body}\n};\n`);
console.log(`${Object.keys(out).length} Tage geschrieben`);
