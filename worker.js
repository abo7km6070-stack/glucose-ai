// Cloudflare Worker — photo analysis proxy for Preventive Glucose AI
// Secrets:  ANTHROPIC_API_KEY  (wrangler secret put ANTHROPIC_API_KEY)
// Vars:     ALLOWED_ORIGIN = "https://<user>.github.io"
// Photos are forwarded to the model and never stored.
const MODEL = "claude-sonnet-5-5";
const DAILY_LIMIT = 300; // per Worker instance, simple guard

let count = 0, day = new Date().toISOString().slice(0, 10);

export default {
  async fetch(req, env) {
    const origin = req.headers.get("origin") || "";
    const allow = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "access-control-allow-origin": allow === "*" ? "*" : (origin === allow ? origin : allow),
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return new Response("POST only", { status: 405, headers: cors });
    if (allow !== "*" && origin !== allow) return new Response("forbidden", { status: 403, headers: cors });

    const today = new Date().toISOString().slice(0, 10);
    if (today !== day) { day = today; count = 0; }
    if (++count > DAILY_LIMIT) return new Response("limit", { status: 429, headers: cors });

    let body;
    try { body = await req.json(); } catch { return new Response("bad json", { status: 400, headers: cors }); }
    const { image, mediaType = "image/jpeg", foods = {} } = body || {};
    if (!image || image.length > 6_000_000) return new Response("bad image", { status: 400, headers: cors });

    const list = Object.entries(foods).slice(0, 200).map(([k, v]) => `${k} = ${String(v).slice(0, 60)}`).join("\n");
    const prompt = `You are a clinical dietitian specialised in Saudi cuisine. Look at the meal photo and estimate what is on it.
Known Saudi foods (use these keys when an item matches; the app already knows their values per 100 g):
${list}
Rules:
- Estimate grams from visual cues (dinner plate ~26 cm, Saudi tray ~60 cm, cup 240 ml, date ~10 g, khubz ~90 g). Be realistic.
- If the food is on a large shared tray for several people, set "shared": true and give grams for the WHOLE tray.
- Rice cooked with meat/ghee maps to the kabsa/mandi keys, not plain rice.
- For items with no matching key use key "other" and give per-100g values.
- confidence: 0-1, how sure you are of the identity AND amount.
- If the photo is not food, return an empty items array.
Reply with only JSON:
{"summary_ar":"وصف قصير","shared":false,"items":[{"key":"kabsa_chicken","name_ar":"كبسة دجاج","grams":350,"carb_per100":0,"fiber_per100":0,"protein_per100":0,"fat_per100":0,"gi":0,"liquid":false,"confidence":0.8}],"notes_ar":""}`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 1200,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
          { type: "text", text: prompt },
        ] }],
      }),
    });
    if (!r.ok) return new Response("upstream " + r.status, { status: 502, headers: cors });
    const data = await r.json();
    const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("");
    const m = text.match(/\{[\s\S]*\}/);
    let out = { items: [] };
    try { if (m) out = JSON.parse(m[0]); } catch {}
    return new Response(JSON.stringify(out), { headers: { ...cors, "content-type": "application/json" } });
  },
};
