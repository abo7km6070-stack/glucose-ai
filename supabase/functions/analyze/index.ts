// Photo / text / lab analysis for signed-in users. Secret needed: GEMINI_API_KEY (optional GEMINI_MODEL).
import { createClient } from "npm:@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const DAILY_LIMIT = 40;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return json({ error: "not_configured" }, 503);
  const url = Deno.env.get("SUPABASE_URL")!;
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: "auth" }, 401);
  const { data: n } = await admin.rpc("bump_ai_usage", { p_user: user.id, p_day: new Date().toISOString().slice(0, 10) });
  if ((n ?? 0) > DAILY_LIMIT) return json({ error: "limit" }, 429);
  let body: { parts?: unknown[] };
  try { body = await req.json(); } catch { return json({ error: "bad" }, 400); }
  const parts = Array.isArray(body.parts) ? body.parts.slice(0, 3) : null;
  if (!parts || JSON.stringify(parts).length > 3_000_000) return json({ error: "bad" }, 400);
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } }),
  });
  if (!r.ok) return json({ error: "upstream", status: r.status, detail: (await r.text()).slice(0, 300) }, 502);
  const d = await r.json();
  return json({ text: (d.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("") });
});
