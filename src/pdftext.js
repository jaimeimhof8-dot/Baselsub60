// Wandelt pdf.js-Textitems einer Seite in Textzeilen um (gruppiert nach y-Position).
export function itemsToLines(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str || !it.transform) continue;
    const x = it.transform[4], y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < 2.5);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x, s: it.str, w: it.width || 0 });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((r) => {
      r.parts.sort((a, b) => a.x - b.x);
      let line = "", end = null;
      for (const p of r.parts) {
        if (end != null && p.x - end > 1.5 && !line.endsWith(" ") && !p.s.startsWith(" ")) line += " ";
        line += p.s;
        end = p.x + p.w;
      }
      return line.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean)
    .join("\n");
}
