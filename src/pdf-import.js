// PDF -> Text im Browser. pdf.js wird erst beim ersten Import vom CDN geladen (ca. 300 KB).
import { itemsToLines } from "./pdftext.js";

const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/";
let loading = null;

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!loading) {
    loading = new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = PDFJS + "pdf.min.js";
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js"; ok(window.pdfjsLib); };
      s.onerror = () => { loading = null; fail(Object.assign(new Error("PDF-Leser konnte nicht geladen werden (offline?)"), { code: "pdfjs" })); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/** Datei (PDF oder Text/Markdown) -> Klartext mit einer Zeile pro Textzeile. */
export async function fileToText(file) {
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return file.text();
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    pages.push(itemsToLines(tc.items));
  }
  return pages.join("\n");
}
