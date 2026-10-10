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

Im <plan>-Block der letzten Nachricht steht sein aktueller Stand als JSON: "recent" sind die letzten Tage mit Erledigt-Status, RPE (1–10) und Ausfällen, "upcoming" die kommenden Tage, "checkin" die heutige Ampel (g/y/r für Schlaf, Muskelkater, Energie, Schmerz), "soreness" der gemeldete Muskelkater pro Muskelgruppe (1–10, null = nichts gemeldet). Belaste stark verkaterte Muskeln (ab 7) nicht hart, sondern entlaste oder tausche die Einheit. Datumsangaben sind ISO (YYYY-MM-DD). kind ist eine von: kraft, lauf, station, sim (hart), bike, mob, rest.

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

type Msg = { role: "user" | "assistant"; content: string };

function readBody(b: unknown): { context: unknown; history: Msg[]; message: string } | null {
  if (!b || typeof b !== "object") return null;
  const { context, history, message } = b as Record<string, unknown>;
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
  return { context, history: clean, message: message.trim() };
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
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      // Cache-Punkt auf dem festen System-Prompt: der <plan>-Teil ändert sich bei jeder Anfrage
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
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
    return json(JSON.parse(text.text));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "rate_limit" }, 429);
    if (e instanceof Anthropic.APIError) { console.error("Claude API", e.status, e.message); return json({ error: "upstream" }, 502); }
    if (e instanceof SyntaxError) return json({ error: "bad_json" }, 502);
    throw e;
  }
});
