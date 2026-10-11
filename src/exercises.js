// Kein Brustmuskel-Training: Bankdrücken und andere horizontale Brustübungen haben keinen
// Hyrox-Transfer. Sie werden überall durch Push Press ersetzt (Überkopf mit Beinantrieb,
// Transfer auf Wall Balls). Reine Funktionen, ohne DOM.

const NAMES = String.raw`(?:(?:kurzhantel-?|schrägbank-?|flach)?bankdrücken|(?:incline |decline |dumbbell |db |close[- ]grip )?bench press(?:es)?|chest press|brustpresse|floor press|push-?ups?|liegestütze?n?|dips|butterfly|(?:chest |cable )?fl(?:y|ys|ies)|cable cross(?:overs?)?)`;
const CHEST_G = new RegExp(String.raw`(?<![\wäöü-])${NAMES}(?![\wäöü-])`, "gi");
const CHEST = new RegExp(CHEST_G.source, "i");

export const CHEST_SWAP = "Push Press";

/** Enthält der Text eine Brustübung? */
export const hasChest = (s) => CHEST.test(String(s ?? ""));

/** Brustübungen im Text durch Push Press ersetzen ("Bench Press 3×6 RPE 7" → "Push Press 3×6 RPE 7"). */
export const noChest = (s) => String(s ?? "").replace(CHEST_G, CHEST_SWAP);

/** Einheit ohne Brustübungen. Gibt dasselbe Objekt zurück, wenn nichts zu ersetzen ist. */
export function noChestDay(day) {
  if (!day || ![day.t, day.n, ...(day.i || [])].some(hasChest)) return day;
  return { ...day, t: noChest(day.t), n: noChest(day.n), i: (day.i || []).map(noChest) };
}
