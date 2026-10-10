// Extrahiert den Text eines PDFs zeilenweise – gleiche Logik wie im Browser (src/pdf-import.js).
// Aufruf: node scripts/pdf-to-text.cjs <datei.pdf> [ausgabe.txt]
const fs = require("fs");
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");

async function main() {
  const [file, out] = process.argv.slice(2);
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    pages.push(tc.items);
  }
  const { itemsToLines } = await import("../src/pdftext.js");
  const text = pages.map(itemsToLines).join("\n");
  if (out) fs.writeFileSync(out, text, "utf8"); else process.stdout.write(text);
}
main().catch((e) => { console.error(e); process.exit(1); });
