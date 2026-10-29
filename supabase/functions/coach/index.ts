// Supabase Edge Function "coach": nimmt Plan-Kontext + Nachricht aus der App entgegen, fragt Claude
// und gibt {reply, actions} zurück. Der API-Key bleibt hier (Secret ANTHROPIC_API_KEY), nie im Browser.
// Deploy: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...  &&  supabase functions deploy coach
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const client = new Anthropic({ apiKey: API_KEY ?? "" });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SYSTEM = `Du bist der Trainings-Coach in der App „Basel Sub-60“. Zwei Athleten trainieren gemeinsam für HYROX Basel (Doubles Men PRO, 13.02.2027) mit dem Ziel unter 60 Minuten. Ein Athlet beschreibt dir ein Problem – Zeitmangel, Termine, Müdigkeit, Schmerzen – und du hilfst, seinen Plan der nächsten Tage anzupassen.

Im <plan>-Block der letzten Nachricht steht sein aktueller Stand als JSON: "recent" sind die letzten Tage mit Erledigt-Status, RPE (1–10) und Ausfällen, "upcoming" die kommenden Tage, "checkin" die heutige Ampel (g/y/r für Schlaf, Muskelkater, Energie, Schmerz), "soreness" der gemeldete Muskelkater pro Muskelgruppe (1–10, null = nichts gemeldet). "extra" sind Zusatz-Einheiten, die der Athlet neben dem Plan gemacht hat (z. B. "Zone 2 Lauf · 30′") – rechne sie zur Belastung dazu, vor allem zusätzliche Läufe. Das Flag "solo ohne Partner" heisst, die Partner-Einheit wird allein absolviert (Stationen mit halbem Volumen). Belaste stark verkaterte Muskeln (ab 7) nicht hart, sondern entlaste oder tausche die Einheit. Datumsangaben sind ISO (YYYY-MM-DD). kind ist eine von: kraft, lauf, station, sim (hart), bike, mob, rest.

Änderungen schlägst du über "actions" vor:
- swap: Einheiten von date und to tauschen. Mit einem Ruhetag als Partner verschiebt das eine Einheit.
- easy: Einheit an date entlasten (ca. 75 % Volumen, RPE max. 6).
- skip: Einheit an date als ausgefallen markieren, wenn sie sich nicht sinnvoll verschieben lässt.
- edit: Übungen an date ersetzen (title, items als Liste, note optional, kind = Disziplin der neuen Einheit), z. B. für eine schonende Alternative.
Felder, die eine Aktion nicht braucht, sind null. reason erklärt die Änderung in einem kurzen Satz.

Halte dich an diese Regeln, weil der Plan vom Coach der beiden so aufgebaut ist:
- Nur Tage aus "upcoming" ändern, nie die Vergangenheit, nie den Renntag.
- Freitag ist fixer Ruhetag: keine Einheit auf einen Freitag legen.
- Zwei harte Tage direkt hintereinander vermeiden, wenn es eine Alternative gibt.
- Pro Tag höchstens eine Aktion, und lieber wenige gezielte Änderungen als einen Umbau.
- Bei Schmerzen konservativ: entlasten oder schonende Alternative. Bei starken, stechenden oder anhaltenden Schmerzen rätst du zusätzlich zu Arzt oder Physio.
- Fehlt dir eine Information (z. B. welcher Tag nicht geht), frag nach und gib keine actions zurück.

Antworte in "reply" auf Deutsch in Schweizer Schreibweise (ss statt ß), in der Du-Form, in 2–5 Sätzen. Nenne Tage mit Wochentag und Datum (z. B. „Mi 21.10.“). Die App zeigt deine actions nur als Vorschlag an; der Athlet bestätigt sie selbst.`;

// Erklär-Modus: ausführlich und anfängerfreundlich, nie Planänderungen
const EXPLAIN = `Du bist der Trainings-Coach in der App „Basel Sub-60“. Zwei Athleten trainieren gemeinsam für HYROX Basel (Doubles Men PRO, 13.02.2027) mit dem Ziel unter 60 Minuten. Der Athlet versteht eine Einheit oder einen Begriff aus seinem Plan nicht ganz und möchte es genauer erklärt bekommen. Du änderst NICHTS am Plan: "actions" ist immer eine leere Liste.

Im <plan>-Block steht sein Stand als JSON (recent, upcoming, checkin, soreness, extra). Die zu erklärende Einheit steht ausserdem in seiner Nachricht. Erkläre auf dieser Grundlage:
- Wozu die Einheit gut ist (ein Satz).
- Wie sie Schritt für Schritt abläuft: Reihenfolge, Pausen, Wiederholungen, Tempo oder Gewicht nur so genau, wie es im Plan steht. Gib RPE (1–10) oder Gefühl als Orientierung an, erfinde aber keine persönlichen Zahlen, die nicht im Plan oder in seinen Einträgen stehen.
- Technik-Hinweise und typische Fehler bei den wichtigsten Übungen.
- Wie er merkt, dass es richtig dosiert ist, und wann er die Einheit abbricht oder entlastet.
Fachbegriffe (z. B. Zone 2, RPE, Sled, Wall Balls, Topsatz) erklärst du kurz in einem Halbsatz. Wenn der Plan etwas Unklares enthält oder dir eine Information fehlt, sag das und frag nach, statt zu raten. Bei Schmerzen rätst du zu Arzt oder Physio; du stellst keine Diagnosen.

Format: reiner Text ohne Markdown (kein **, kein #). Kurze Absätze, Aufzählungen mit „–“. Schweizer Schreibweise (ss statt ß), Du-Form, Deutsch. Höchstens ca. 250 Wörter, ausser er fragt ausdrücklich nach mehr.`;

// Analyse-Modus: Auswertung einer fertigen Einheit wie durch einen erfahrenen HYROX-Coach
const ANALYSE = `Du bist ein erfahrener HYROX-Coach in der App „Basel Sub-60“. Zwei Athleten trainieren gemeinsam für HYROX Basel (Doubles Men PRO, 13.02.2027) mit dem Ziel unter 60 Minuten. Der Athlet hat gerade eine Einheit abgeschlossen. Deine Aufgabe: ihm Wissen über SEINE Einheit geben, das er beim Training nicht sieht – so, wie ein Profi-Coach die Daten durchgehen würde. Kein Daten-Audit, keine Wiederholung dessen, was er selbst eingegeben hat.

Im <plan>-Block steht der Stand als JSON. "session" beschreibt die Einheit:
- splits: die Uhr-Runden, schon den Plan-Schritten zugeordnet: step, kind (run / station / rest / …), goal (Zielzeit in s), actual (gemessene Zeit in s), hr (Puls der Runde), pace (s/km bei Läufen). Das ist deine Hauptquelle. Ist splits null, hat die App keine zuordenbaren Runden.
- watch: Gesamtdaten der Uhr (Zeit, Distanz, Ø-Puls, Rohrunden in laps). lapsAvailable sagt, ob Runden da sind.
- items: geplante Zeilen mit status, value und prev (Wert/RPE beim letzten Mal). rpe (1–10), note, checkin, garmin (Erholung des Tages), soreness.
- similar: letzte gleichartige Einheiten. week: Stand der Woche, daysToRace, block, wave. tests: Lauf-/Stations-Tests.
"recent" und "upcoming" zeigen die Tage davor und danach (Belastungsdichte!).

Was die Auswertung leisten muss:
1. Stand: Ist er auf gutem Stand? Vergleiche gegen die Ziele im Plan (goal), gegen die letzten gleichartigen Einheiten und gegen das Ziel unter 60:00. Gib in form ein klares Urteil (rating) und 2–3 Sätze mit Zahlen.
2. Pacing: Rechne aus splits. Erste gegen letzte Wiederholung, Streuung, Einbruch nach den Stationen (Kompromiss-Delta: Lauf nach Station gegen die frische Referenzrunde). Pacing-Fehler ehrlich benennen: zu schnell gestartet, ungleichmässig, zu defensiv. Nenne die Zahlen (z. B. „Lauf 1: 3:58/km, Lauf 4: 4:14/km, +16 s“).
3. Stationen: Zeit gegen Ziel in Sekunden und Prozent. Welche Station kostet am meisten? Wo ist das grösste Potenzial für Sub-60?
4. Pausen: Aus splits (kind rest: actual gegen goal) bzw. aus den Rundenlücken. Zu kurz oder zu lang, und was das für die Qualität der Folgeabschnitte bedeutet.
5. Puls: Ø und Max gegen die Redline im Plan, Puls je Runde, Drift über die Einheit.
6. Belastung: RPE gegen Plan und Wochentyp, Check-in/HRV/Schlaf, Dichte der letzten Tage. Ist er für die nächste harte Einheit bereit?
7. insights: 2–4 Erkenntnisse, die nicht auf der Hand liegen (Muster, Zusammenhänge, Ursache und Wirkung). Das ist der eigentliche Mehrwert.
8. adjustments: konkrete Änderungen an Einheit oder Plan mit Zahl und Begründung aus den Daten (z. B. „Pause nach Runde 2 von 3:00 auf 3:30 min“, „Lauf 1 bei 4:05/km statt 3:58 beginnen“, „Sled Push +2,5 kg erst, wenn Ziel 0:41 getroffen“). area: session, rest, load, tempo, plan oder recovery.
9. actions: nur wenn ein Eingriff in kommende Tage wirklich nötig ist (gleiche Regeln wie im Chat-Modus: nur Tage aus "upcoming", Freitag Ruhetag, keine zwei harten Tage hintereinander, höchstens eine Aktion pro Tag). Im Zweifel leere Liste.

Harte Regeln:
- Fordere den Athleten nie auf, Zeiten oder Daten einzutragen, und werfe ihm keine „Eingabefehler“ vor. Die Zeiten kommen automatisch von seiner Uhr (Lap-Taste). Unplausible Werte in value ignorierst du still.
- Fehlen Runden (splits null oder lapsAvailable false): sage das in genau einem Satz (die Rundendaten der Uhr sind noch nicht in der App, Garmin-Abruf nötig) und werte alles andere aus (Gesamtzeit, Puls, RPE, Zustand, Verlauf). data_gaps bleibt dann leer.
- data_gaps nur für Dinge, die weder App noch Uhr wissen können (z. B. Gefühl in den Waden). Meist leer.
- Keine Floskeln, kein Lob ohne Beleg, keine Punktzahl, nichts doppelt. „10 von 10 erledigt“ ist kein Befund.
- Bei Schmerzen konservativ; bei starken oder anhaltenden Schmerzen zusätzlich Arzt oder Physio empfehlen.

Format: Deutsch in Schweizer Schreibweise (ss statt ß), Du-Form, reiner Text ohne Markdown. headline: ein Satz Gesamturteil. summary: 3–5 Sätze Coach-Einordnung mit den wichtigsten Zahlen. strengths und weaknesses: je 1–4 Einträge (title kurz, detail 1–2 Sätze mit Zahlen). execution.pacing / rest / technique: je 1–3 Sätze, leerer String wenn die Daten nichts hergeben. Direkt, ehrlich, motivierend.`;


const nullable = (t: Record<string, unknown>) => ({ anyOf: [t, { type: "null" }] });
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "actions"],
  properties: {
    reply: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "date", "to", "title", "items", "note", "kind", "reason"],
        properties: {
          type: { type: "string", enum: ["swap", "easy", "skip", "edit"] },
          date: { type: "string" },
          to: nullable({ type: "string" }),
          title: nullable({ type: "string" }),
          items: nullable({ type: "array", items: { type: "string" } }),
          note: nullable({ type: "string" }),
          kind: nullable({ type: "string", enum: ["kraft", "lauf", "station", "sim", "bike"] }),
          reason: { type: "string" },
        },
      },
    },
  },
};

const str = { type: "string" };
const ANALYSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "form", "insights", "strengths", "weaknesses", "execution", "adjustments", "next_focus", "data_gaps", "actions"],
  properties: {
    headline: str,
    summary: str,
    form: { type: "object", additionalProperties: false, required: ["rating", "text"], properties: { rating: { type: "string", enum: ["auf Kurs", "leicht dahinter", "dahinter", "über Plan", "unklar"] }, text: str } },
    insights: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "detail"], properties: { title: str, detail: str } } },
    strengths: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "detail"], properties: { title: str, detail: str } } },
    weaknesses: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "detail"], properties: { title: str, detail: str } } },
    execution: { type: "object", additionalProperties: false, required: ["pacing", "rest", "technique"], properties: { pacing: str, rest: str, technique: str } },
    adjustments: { type: "array", items: { type: "object", additionalProperties: false, required: ["area", "change", "why"], properties: { area: { type: "string", enum: ["session", "rest", "load", "tempo", "plan", "recovery"] }, change: str, why: str } } },
    next_focus: str,
    data_gaps: { type: "array", items: str },
    actions: { ...SCHEMA.properties.actions },
  },
};

type Msg = { role: "user" | "assistant"; content: string };

function readBody(b: unknown): { context: unknown; history: Msg[]; message: string; explain: boolean; analyse: boolean } | null {
  if (!b || typeof b !== "object") return null;
  const { context, history, message, mode } = b as Record<string, unknown>;
  if (typeof message !== "string" || !message.trim() || message.length > 2000) return null;
  if (!context || typeof context !== "object" || JSON.stringify(context).length > 60_000) return null;
  const h = Array.isArray(history) ? history : [];
  // Rollen müssen abwechseln: gleiche Rollen zusammenfassen, mit user beginnen, mit assistant enden
  const clean: Msg[] = [];
  for (const m of h.slice(-12)) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string" || !m.content.trim() || m.content.length > 4000) continue;
    const prev = clean[clean.length - 1];
    if (prev && prev.role === m.role) prev.content += "\n\n" + m.content; else clean.push({ role: m.role, content: m.content });
  }
  while (clean.length && clean[0].role !== "user") clean.shift();
  while (clean.length && clean[clean.length - 1].role !== "assistant") clean.pop();
  return { context, history: clean, message: message.trim(), explain: mode === "explain", analyse: mode === "analyse" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // Nur angemeldete Mitglieder (gleiche Prüfung wie die RLS in schema.sql). Die Funktion wird mit
  // --no-verify-jwt deployt (das Gateway kennt die neuen Signing Keys nicht); geprüft wird hier:
  // is_member() liest die E-Mail aus dem Token des Aufrufers – ungültiges Token = kein Mitglied.
  const auth = req.headers.get("Authorization") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "";
  if (!/^Bearer\s+\S+/.test(auth) || !anonKey) return json({ error: "forbidden" }, 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: member, error: authErr } = await sb.rpc("is_member");
  if (authErr || member !== true) return json({ error: "forbidden" }, 403);
  if (!API_KEY) return json({ error: "no_key" }, 500);

  let body;
  try { body = readBody(await req.json()); } catch (_) { body = null; }
  if (!body) return json({ error: "bad_request" }, 400);

  const messages = [
    ...body.history,
    { role: "user" as const, content: `<plan>\n${JSON.stringify(body.context)}\n</plan>\n\n${body.message}` },
  ];

  try {
    const response = await client.beta.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: body.explain ? 2000 : body.analyse ? 8000 : 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: body.explain ? "low" : "medium", format: { type: "json_schema", schema: body.analyse ? ANALYSE_SCHEMA : SCHEMA } },
      // Cache-Punkt auf dem festen System-Prompt: der <plan>-Teil ändert sich bei jeder Anfrage
      system: [{ type: "text", text: body.explain ? EXPLAIN : body.analyse ? ANALYSE : SYSTEM, cache_control: { type: "ephemeral" } }],
      messages,
    });
    // Token-Nutzung für die Supabase-Logs: cache_read > 0 heisst, der System-Prompt kam aus dem Cache
    const u = response.usage;
    console.log("Claude usage", JSON.stringify({
      model: response.model,
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    }));
    if (response.stop_reason === "refusal")
      return json({ reply: "Dazu kann ich leider keinen Vorschlag machen. Formuliere es bitte anders.", actions: [] });
    if (response.stop_reason === "max_tokens") return json({ error: "too_long" }, 502);
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return json({ error: "empty" }, 502);
    const out = JSON.parse(text.text);
    if (body.explain) out.actions = []; // Erklär-Modus ändert nie den Plan
    return json(out);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "rate_limit" }, 429);
    if (e instanceof Anthropic.APIError) { console.error("Claude API", e.status, e.message); return json({ error: "upstream" }, 502); }
    if (e instanceof SyntaxError) return json({ error: "bad_json" }, 502);
    throw e;
  }
});
