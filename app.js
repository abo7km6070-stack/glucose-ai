"use strict";
/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ic = (n, cls = "") => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const r0 = x => Math.round(x), r1 = x => Math.round(x * 10) / 10;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const LOC = "ar-u-nu-latn";
const fmtTime = ts => new Date(ts).toLocaleTimeString(LOC, {hour: "numeric", minute: "2-digit"});
const fmtDay = ts => { const d = new Date(ts), t = new Date(), k = x => x.toDateString();
  if (k(d) === k(t)) return "اليوم"; const y = new Date(t); y.setDate(t.getDate() - 1); if (k(d) === k(y)) return "أمس";
  return d.toLocaleDateString(LOC, {weekday: "long", day: "numeric", month: "long"}); };
const firstName = n => { const w = String(n || "").trim().split(/\s+/); return /^(أبو|ابو|أم|ام|بن|عبد)$/.test(w[0]) && w[1] ? w[0] + " " + w[1] : w[0] || ""; };
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const uid = p => p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const sign = n => `<span class="ltr">${n > 0 ? "+" : ""}${r0(n)}</span>`;
const minsTxt = t => t < 60 ? `${t} دقيقة` : t % 60 ? `${Math.floor(t / 60)} س و${t % 60} د` : `${t / 60} ساعة`;
function toast(t) { const e = $("#toast"); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => e.hidden = true, 3200); }

/* ================= local storage (IndexedDB) ================= */
const Store = {
  db: null, mem: {kv: {}, meals: {}, readings: {}},
  async open() { try { this.db = await new Promise((res, rej) => { const r = indexedDB.open("pga", 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("kv"); d.createObjectStore("meals", {keyPath: "id"}); d.createObjectStore("readings", {keyPath: "id"}); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); } catch (e) { this.db = null; } },
  _p(store, mode, fn) { return new Promise((res, rej) => { const t = this.db.transaction(store, mode), q = fn(t.objectStore(store)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); },
  async get(k) { if (!this.db) return this.mem.kv[k] ?? null; return (await this._p("kv", "readonly", s => s.get(k))) ?? null; },
  async set(k, v) { if (!this.db) { this.mem.kv[k] = v; return; } return this._p("kv", "readwrite", s => s.put(v, k)); },
  async del(k) { if (!this.db) { delete this.mem.kv[k]; return; } return this._p("kv", "readwrite", s => s.delete(k)); },
  async all(store) { if (!this.db) return Object.values(this.mem[store]); return (await this._p(store, "readonly", s => s.getAll())) || []; },
  async put(store, v) { if (!this.db) { this.mem[store][v.id] = v; return; } return this._p(store, "readwrite", s => s.put(v)); },
  async remove(store, id) { if (!this.db) { delete this.mem[store][id]; return; } return this._p(store, "readwrite", s => s.delete(id)); },
  async clearAll() { if (!this.db) { this.mem = {kv: {}, meals: {}, readings: {}}; return; } for (const s of ["kv", "meals", "readings"]) await this._p(s, "readwrite", x => x.clear()); }
};

/* ================= cloud (Supabase: email sign-in + sync) ================= */
const Cloud = {
  sb: null, user: null, state: "off", photoCache: {},
  init() { const c = window.PGA_CONFIG || {}; if (c.supabaseUrl && c.supabaseKey && window.supabase) { try { this.sb = window.supabase.createClient(c.supabaseUrl, c.supabaseKey, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}}); } catch (e) { this.sb = null; } } },
  get on() { return !!this.sb; },
  async session() { if (!this.sb) return null; try { const {data} = await this.sb.auth.getSession(); this.user = data.session ? data.session.user : null; } catch (e) { this.user = null; } return this.user; },
  async sendCode(email) { const {error} = await this.sb.auth.signInWithOtp({email, options: {shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname}}); if (error) throw error; },
  async verify(email, token) { const {data, error} = await this.sb.auth.verifyOtp({email, token, type: "email"}); if (error) throw error; this.user = data.user; return data.user; },
  async signOut() { try { await this.sb.auth.signOut(); } catch (e) {} this.user = null; },
  setState(s) { this.state = s; const e = $("#sync-dot"); if (e) e.className = "sync " + ({ok: "", off: "off", err: "err", busy: ""}[s] || ""); },
  async pushProfile() { if (!this.user) return;
    const {error} = await this.sb.from("profiles").upsert({user_id: this.user.id, profile: S.profile, model: S.model, calib: S.calib, updated_at: new Date().toISOString()}); if (error) throw error; },
  async pushMeal(m) { if (!this.user) return;
    if (m.photo && m.photo.startsWith("data:") && !m.photo_path) { const blob = await (await fetch(m.photo)).blob(), path = `${this.user.id}/${m.id}.jpg`;
      const {error: ue} = await this.sb.storage.from("meal-photos").upload(path, blob, {contentType: "image/jpeg", upsert: true}); if (!ue) { m.photo_path = path; await Store.put("meals", m); } }
    const {photo, ...data} = m;
    const {error} = await this.sb.from("meals").upsert({id: m.id, user_id: this.user.id, ts: new Date(m.ts).toISOString(), grade: m.grade, peak: m.pred.peak, data, photo_path: m.photo_path || null, updated_at: new Date().toISOString()}); if (error) throw error;
    await this.sb.from("meal_items").delete().eq("meal_id", m.id);
    const rows = m.items.map(it => { const d = itemData(it) || {c: 0, f: 0, p: 0, fat: 0, kcal: 0}, k = it.grams / 100;
      return {meal_id: m.id, user_id: this.user.id, food_id: it.key, name: it.name, grams: it.grams, carbs: r1(d.c * k), fiber: r1((d.f || 0) * k), protein: r1((d.p || 0) * k), fat: r1((d.fat || 0) * k), kcal: r0((d.kcal || 0) * k)}; });
    if (rows.length) await this.sb.from("meal_items").insert(rows); },
  async pushReading(r) { if (!this.user) return;
    const {error} = await this.sb.from("readings").upsert({id: r.id, user_id: this.user.id, ts: new Date(r.ts).toISOString(), v: r.v, kind: r.kind, meal_id: r.mealId || null, minutes: r.minutes ?? null, expected: r.expected ?? null, followed: r.followed ?? null, data: r, updated_at: new Date().toISOString()}); if (error) throw error; },
  async deleteMeal(m) { if (!this.user) return; await this.sb.from("readings").delete().eq("meal_id", m.id); await this.sb.from("meal_items").delete().eq("meal_id", m.id); await this.sb.from("meals").delete().eq("id", m.id); if (m.photo_path) await this.sb.storage.from("meal-photos").remove([m.photo_path]); },
  async photoURL(path) { if (this.photoCache[path]) return this.photoCache[path]; const {data} = await this.sb.storage.from("meal-photos").createSignedUrl(path, 7 * 86400); if (data) this.photoCache[path] = data.signedUrl; return this.photoCache[path]; },
  async sync() { if (!this.user) return; this.setState("busy");
    try {
      const [{data: pr}, {data: ms}, {data: rs}] = await Promise.all([this.sb.from("profiles").select("*").eq("user_id", this.user.id).maybeSingle(), this.sb.from("meals").select("*"), this.sb.from("readings").select("*")]);
      if (pr && pr.profile) { const cloudNewer = !S.profile || (pr.profile.updated || 0) >= (S.profile.updated || 0);
        if (cloudNewer) { await saveKV("profile", pr.profile, true); if (pr.model) await saveKV("model", pr.model, true); if (pr.calib) await saveKV("calib", pr.calib, true); } else await this.pushProfile(); }
      else if (S.profile) await this.pushProfile();
      const cloudM = new Set((ms || []).map(x => x.id)), cloudR = new Set((rs || []).map(x => x.id));
      for (const row of ms || []) if (!S.meals.find(m => m.id === row.id)) { const m = {...row.data, id: row.id, photo_path: row.photo_path}; await Store.put("meals", m); S.meals.push(m); }
      for (const row of rs || []) if (!S.readings.find(r => r.id === row.id)) { const r = {...row.data, id: row.id}; await Store.put("readings", r); S.readings.push(r); }
      for (const m of S.meals) if (!cloudM.has(m.id)) await this.pushMeal(m);
      for (const r of S.readings) if (!cloudR.has(r.id)) await this.pushReading(r);
      S.meals.sort((a, b) => b.ts - a.ts); S.readings.sort((a, b) => b.ts - a.ts);
      this.setState("ok"); return !!(pr && pr.profile);
    } catch (e) { this.setState("err"); return null; } },
  async safe(fn) { if (!this.user) return; try { await fn(); this.setState("ok"); } catch (e) { this.setState("err"); } }
};

/* ================= state ================= */
const S = {profile: null, model: null, calib: null, calibRun: null, settings: {provider: "none", model: "gemini-3.8-flash"}, meals: [], readings: [], scan: null, foodQ: "", foodCat: "all", logFilter: "all", usda: null, guest: false};
async function loadAll() {
  [S.profile, S.model, S.calib, S.calibRun] = await Promise.all(["profile", "model", "calib", "calibRun"].map(k => Store.get(k)));
  S.settings = {...S.settings, ...(await Store.get("settings") || {})}; S.guest = !!(await Store.get("guest"));
  S.meals = (await Store.all("meals")).sort((a, b) => b.ts - a.ts);
  S.readings = (await Store.all("readings")).sort((a, b) => b.ts - a.ts);
  if (S.profile && !S.model) S.model = priorModel(S.profile);
}
async function saveKV(k, v, fromCloud) { S[k] = v; await Store.set(k, v); if (!fromCloud && ["profile", "model", "calib"].includes(k)) Cloud.safe(() => Cloud.pushProfile()); }
async function putMeal(m) { await Store.put("meals", m); Cloud.safe(() => Cloud.pushMeal(m)); }
async function putReading(r) { await Store.put("readings", r); Cloud.safe(() => Cloud.pushReading(r)); }

/* ================= physiology model =================
   s   = mg/dL peak rise per 1 unit of glycemic load (1 g glucose = 1 unit). Prior anchored on Buchanan & McKiddie 1967
         (healthy adults ≈ +38 mg/dL after 50 g glucose ⇒ s≈0.8), raised by HbA1c / status, BMI, waist, age, activity.
   tpG = minutes to peak after a glucose drink; solid meals peak ~15 min later. */
const GLUCOSE_DELAY = 15;
function bmi(p) { return p && p.height && p.weight ? p.weight / Math.pow(p.height / 100, 2) : null; }
function bmiCat(b) { return b < 18.5 ? ["نحافة", "#4E95D9"] : b < 25 ? ["وزن طبيعي", "var(--gA)"] : b < 30 ? ["زيادة وزن", "var(--gC)"] : b < 35 ? ["سمنة درجة ١", "var(--gD)"] : ["سمنة درجة ٢ أو أكثر", "var(--gE)"]; }
function a1cCat(a) { return a < 5.7 ? ["طبيعي", "A"] : a < 6.5 ? ["ما قبل السكري", "C"] : a < 7 ? ["سكري، ضمن الهدف", "B"] : a < 8 ? ["سكري، فوق الهدف", "D"] : ["سكري، مرتفع", "E"]; }
function priorModel(p) {
  let s = {none: 0.85, pre: 1.35, t2: 2.1, t1: 2.5, gdm: 1.6}[p.status] || 1.0;
  if (p.a1c) s = clamp(0.8 + (p.a1c - 5.2) * 0.95, 0.7, 3.2);
  const b = bmi(p); if (b >= 30) s *= 1.1; if (p.age >= 60) s *= 1.08;
  if (p.waist && p.waist > (p.sex === "f" ? 88 : 102)) s *= 1.05;
  if (p.activity === "low") s *= 1.05; if (p.activity === "high") s *= 0.92;
  if (p.meds && p.meds.met && !p.a1c) s *= 0.92;
  let tpG = {none: 30, pre: 45, t2: 60, t1: 60, gdm: 45}[p.status] || 45; if (p.age >= 60) tpG += 5; if (p.dxYears === "10+") tpG += 5;
  const g0 = p.fbg || {none: 92, pre: 108, t2: 135, t1: 140, gdm: 95}[p.status] || 100;
  return {s, tpG, g0, n: 0, calibrated: false, log: []};
}
function totals(items) {
  let c = 0, f = 0, p = 0, fat = 0, gl = 0, liqGL = 0, kcal = 0;
  for (const it of items) { const g = it.g, F = it.data; if (!F) continue; const avail = Math.max(0, F.c - F.f) * g / 100;
    c += F.c * g / 100; f += F.f * g / 100; p += F.p * g / 100; fat += F.fat * g / 100;
    const l = avail * F.gi / 100; gl += l; if (F.liquid) liqGL += l; kcal += (F.kcal || (F.c * 4 + F.p * 4 + F.fat * 9)) * g / 100; }
  return {c, f, p, fat, gl, liqGL, kcal};
}
const FACT = {order: {carb: 1, mixed: 0.82, veg: 0.6}, walk: {"0": 1, "10": 0.88, "20": 0.82}, time: {morning: 1, noon: 1, evening: 1.08, iftar: 1.1}};
function predict(items, ctx, model, prof, g0over) {
  const T = totals(items), meds = (prof && prof.meds) || {}, solidGL = T.gl - T.liqGL, st = ctx.state || {};
  const mix = 1 / (1 + 0.004 * T.fat + 0.003 * T.p + 0.02 * T.f);
  let m = (FACT.walk[ctx.walk] ?? 1) * mix * (FACT.time[ctx.time] ?? 1), delay = 0;
  if (st.sleep) m *= 1.08; if (st.stress) m *= 1.1; if (st.ex) m *= 0.9;
  if (meds.glp) { m *= 0.6; delay += 30; } if (meds.acar) { m *= 0.78; delay += 15; }
  const effGL = solidGL * (FACT.order[ctx.order] ?? 0.82) + T.liqGL;
  const rise = Math.max(0, model.s * effGL * m), g0 = g0over || (model.g0 + (st.prev ? 12 : 0));
  let tp = model.tpG + GLUCOSE_DELAY + delay; if (T.fat > 25) tp += 15; if (ctx.order === "veg") tp += 10; if (T.f > 8) tp += 10;
  if (solidGL < 1 && T.liqGL > 0) tp = Math.max(25, model.tpG); tp = Math.min(tp, 140);
  const tail = tp * 1.1 + T.fat * 1.2, n = (model.n || 0) + (model.calibrated ? 3 : 0), cv = Math.max(0.12, 0.35 / Math.sqrt(1 + n));
  const curve = []; for (let t = 0; t <= 240; t += 5) { let y; if (t <= tp) { const x = t / tp; y = rise * x * x * Math.exp(2 * (1 - x)); } else { const x = (t - tp) / tail; y = rise * Math.exp(-1.2 * x * x); } curve.push([t, g0 + y]); }
  const out = {T, rise, peak: g0 + rise, tp, cv, curve, g0}; out.grade = gradeOf(out); return out;
}
function gradeOf(p) { if (p.peak < 140 && p.rise < 35) return "A"; if (p.peak < 145) return "B"; if (p.peak < 165) return "C"; if (p.peak < 185) return "D"; return "E"; }
const GRADE_TXT = {A: "ممتازة على سكرك", B: "جيدة", C: "متوسطة", D: "ترفع السكر", E: "ترفع السكر كثير"};
const GRADE_SCORE = {A: 96, B: 82, C: 64, D: 44, E: 24};
const valAt = (curve, t) => curve.reduce((a, b) => Math.abs(b[0] - t) < Math.abs(a[0] - t) ? b : a)[1];
const autoTime = () => { const h = new Date().getHours(); return h >= 4 && h < 11 ? "morning" : h < 16 ? "noon" : "evening"; };
function curModel() { return S.model || priorModel(S.profile || EXAMPLE); }
const EXAMPLE = {name: "", age: 55, sex: "m", height: 170, weight: 88, status: "pre", meds: {}, cond: {}};

/* ================= safety gate ================= */
function gateOf(p) {
  const out = {level: "ok", msgs: []}, c = p.cond || {}, m = p.meds || {};
  if (p.status === "t1" || p.status === "gdm" || c.preg || c.ckd || (p.age && p.age < 18)) { out.level = "stop"; out.msgs.push("حالتك (سكري النوع الأول، الحمل، أمراض الكلى المتقدمة، أو العمر تحت ١٨) تحتاج متابعة طبية مباشرة. التطبيق يعرض معلومات الأكل فقط بدون توقعات."); }
  if (c.hypo) { if (out.level === "ok") out.level = "caution"; out.msgs.push("عندك نوبات هبوط متكررة: راجع طبيبك قبل أي تغيير في الأكل أو المشي."); }
  if (m.ins || m.su) { if (out.level === "ok") out.level = "caution"; out.msgs.push("أدويتك (إنسولين أو سلفونيل يوريا) ممكن تسبب هبوط، فما نقترح عليك تقليل النشويات، واختبار الجلوكوز ممنوع لك."); }
  if (p.status === "none" && ((p.a1c && p.a1c >= 6.5) || (p.fbg && p.fbg >= 126))) { if (out.level === "ok") out.level = "caution"; out.msgs.push("أرقامك في نطاق السكري. لازم تأكيد التشخيص عند الطبيب أولاً."); }
  if (m.glp) out.msgs.push("أدوية GLP-1 تبطّئ تفريغ المعدة، فقمتك أقل وأبطأ. النموذج يحسبها.");
  return out;
}
function calAllowed(p) {
  if (!p) return [false, "احفظ ملفك أولاً."];
  const g = gateOf(p), m = p.meds || {};
  if (g.level === "stop") return [false, "اختبار الجلوكوز غير مناسب لحالتك."];
  if (m.ins || m.su) return [false, "ممنوع مع الإنسولين أو السلفونيل يوريا لخطر الهبوط."];
  if ((p.cond || {}).hypo) return [false, "ممنوع مع نوبات الهبوط المتكررة."];
  if (p.status === "none" && ((p.a1c && p.a1c >= 6.5) || (p.fbg && p.fbg >= 126))) return [false, "أرقامك في نطاق السكري. أكّد التشخيص عند الطبيب أولاً."];
  if (p.status === "t2" && (!p.a1c || p.a1c >= 7.5)) return [false, "لمرضى النوع الثاني: مسموح فقط إذا التراكمي أقل من ٧٫٥ وبموافقة الطبيب."];
  return [true, p.status === "t2" ? "مسموح بجرعة ٥٠ جم فقط وبموافقة طبيبك." : ""];
}

/* ================= food helpers ================= */
const CAT_ICON = {rice: "bowl", wheat: "bowl", bread: "bowl", meat: "bowl", fish: "bowl", soup: "bowl", breakfast: "bowl", dairy: "drop", sweet: "spark", dates: "leaf", drink: "drop", fast: "bowl", salad: "leaf", other: "bowl"};
function ftile(F, cls = "") { const u = F && F.id && imgURL(F.id, cls.includes("lg") ? 640 : 160);
  return `<span class="ftile ${cls}">${u ? `<img src="${u}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}${ic(CAT_ICON[F && F.cat] || "bowl")}</span>`; }
function itemData(it) { return it.data || FOODS[it.key] || (S.usda && usdaFood(S.usda.find(x => x.id === it.key))); }
function usdaFood(x) { return x && {id: x.id, ar: x.name_en, en: x.name_en, cat: x.cat, kcal: x.kcal, c: x.carb, f: x.fiber || 0, p: x.protein || 0, fat: x.fat || 0, gi: x.gi, src: "USDA", unit: [x.unit_name || "100 g", x.unit_g || 100], liquid: x.cat === "drink"}; }
async function loadUSDA() { if (S.usda) return S.usda; try { S.usda = await (await fetch("data/usda_sr28.json")).json(); } catch (e) { S.usda = []; } return S.usda; }
function searchFoods(q, cat, limit = 40) { q = q.trim(); return Object.values(FOODS).filter(f => (cat === "all" || f.cat === cat) && (!q || f.ar.includes(q))).slice(0, limit); }
function searchUSDA(q, limit = 30) { if (!S.usda || q.trim().length < 2) return []; const ws = q.trim().toLowerCase().split(/\s+/); return S.usda.filter(x => ws.every(w => x.name_en.toLowerCase().includes(w))).slice(0, limit).map(usdaFood); }

/* ================= charts ================= */
function curveSVG(series, opts = {}) {
  const W = 360, H = 220, L = 34, R = 8, T = 22, B = 26;
  const vals = series.flatMap(s => s.pts.map(p => s.band ? s.g0 + (p[1] - s.g0) * (1 + s.band) : p[1]));
  const ymin = Math.min(70, Math.floor(Math.min(...vals) / 10) * 10 - 10), ymax = Math.max(200, Math.ceil(Math.max(...vals) / 20) * 20 + 10);
  const xmax = opts.xmax || 240, X = t => L + (W - L - R) * t / xmax, Y = v => T + (H - T - B) * (1 - (v - ymin) / (ymax - ymin));
  let g = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || "منحنى السكر")}" style="direction:ltr">`;
  g += `<rect x="${L}" y="${Y(ymax)}" width="${W - L - R}" height="${Y(180) - Y(ymax)}" fill="var(--gE-s)"/><rect x="${L}" y="${Y(180)}" width="${W - L - R}" height="${Y(140) - Y(180)}" fill="var(--gC-s)"/>`;
  g += `<text x="${W - R - 4}" y="${Y(180) + 13}" font-size="10" text-anchor="end" fill="var(--gD)" font-family="IBM Plex Sans Arabic">انتبه</text><text x="${W - R - 4}" y="${Y(ymax) + 13}" font-size="10" text-anchor="end" fill="var(--gE)" font-family="IBM Plex Sans Arabic">مرتفع</text>`;
  for (let v = Math.ceil(ymin / 40) * 40; v <= ymax; v += 40) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${Y(v) + 4}" font-size="10.5" text-anchor="end" fill="var(--muted)" font-family="Readex Pro">${v}</text>`;
  for (const t of opts.ticks || [0, 60, 120, 180, 240]) g += `<text x="${X(t)}" y="${H - B + 17}" font-size="10.5" text-anchor="middle" fill="var(--muted)" font-family="Readex Pro">${opts.tickFmt ? opts.tickFmt(t) : t === 0 ? "الأكل" : t / 60 + "س"}</text>`;
  for (const s of series) {
    if (s.band) { const up = s.pts.map(p => [X(p[0]), Y(s.g0 + (p[1] - s.g0) * (1 + s.band))]), dn = s.pts.map(p => [X(p[0]), Y(s.g0 + (p[1] - s.g0) * (1 - s.band))]).reverse();
      g += `<path d="M${up.map(p => p.map(n => n.toFixed(1)).join(",")).join("L")}L${dn.map(p => p.map(n => n.toFixed(1)).join(",")).join("L")}Z" fill="${s.color}" opacity=".12"/>`; }
    if (s.line !== false && s.pts.length > 1) g += `<path d="M${s.pts.map(p => X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1)).join("L")}" fill="none" stroke="${s.color}" stroke-width="${s.w || 3}" stroke-dasharray="${s.dash || ""}" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (s.dots) for (const p of s.pts) g += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="${s.r || 5}" fill="${p[2] || s.color}" stroke="#fff" stroke-width="2"/>${s.labels ? `<text x="${X(p[0])}" y="${Y(p[1]) - 10}" font-size="11.5" font-weight="600" text-anchor="middle" fill="var(--ink)" font-family="Readex Pro">${r0(p[1])}</text>` : ""}`;
    if (s.peak) g += `<circle cx="${X(s.peak[0])}" cy="${Y(s.peak[1])}" r="5.5" fill="${s.color}" stroke="#fff" stroke-width="2"/><text x="${X(s.peak[0])}" y="${Y(s.peak[1]) - 10}" font-size="13" font-weight="700" text-anchor="middle" fill="var(--ink)" font-family="Readex Pro">${r0(s.peak[1])}</text>`;
  }
  return g + "</svg>";
}
function ringSVG(val, size = 116, label = "") {
  const r = size / 2 - 9, C = 2 * Math.PI * r, f = val == null ? 0 : clamp(val, 0, 100) / 100;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-label="${esc(label)}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="currentColor" stroke-opacity=".25" stroke-width="10" fill="none"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="currentColor" stroke-width="10" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - f)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="Readex Pro" font-weight="700" font-size="${size * 0.3}">${val == null ? "—" : r0(val)}</text></svg>`;
}

/* ================= router ================= */
const MAIN = ["today", "log", "insights", "foods", "me"], FLOWS = ["start", "auth", "onboard", "scan", "calib"];
let tickTimer = null;
function go(h) { if (location.hash === "#" + h) route(); else location.hash = h; }
function route() {
  let h = location.hash.slice(1) || "today";
  if (h.includes("access_token") || h.includes("error")) { history.replaceState(null, "", location.pathname + "#today"); h = "today"; }
  if (!S.profile && !["start", "auth", "onboard"].includes(h)) { h = "start"; history.replaceState(null, "", "#start"); }
  if (h === "onboard" && !OB.started) startOnboard(!!S.profile);
  clearInterval(tickTimer); tickTimer = null;
  const flow = $("#flow");
  if (FLOWS.includes(h)) { flow.hidden = false; document.body.style.overflow = "hidden"; $("#tabbar").hidden = true; renderFlow(h); flow.scrollTop = 0; return; }
  flow.hidden = true; flow.innerHTML = ""; document.body.style.overflow = ""; $("#tabbar").hidden = false;
  if (!MAIN.includes(h)) h = "today";
  $$(".tab").forEach(a => a.setAttribute("aria-current", a.dataset.tab === h ? "page" : "false"));
  ({today: viewToday, log: viewLog, insights: viewInsights, foods: viewFoods, me: viewMe})[h]();
  hydratePhotos(); window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
function renderFlow(h) { ({start: renderStart, auth: renderAuth, onboard: renderOnboard, scan: renderScan, calib: renderCalib})[h](); }
async function hydratePhotos(root = document) { if (!Cloud.user) return; for (const el of $$("[data-photo-path]", root)) { const u = await Cloud.photoURL(el.dataset.photoPath).catch(() => null); if (u) { const img = document.createElement("img"); img.src = u; img.alt = ""; img.className = el.className; el.replaceWith(img); } } }

/* ================= sheets ================= */
function openSheet(html, bind) {
  const bg = document.createElement("div"); bg.className = "sheet-bg";
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  $("#sheet-root").appendChild(bg); const sheet = $(".sheet", bg);
  const close = () => { bg.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = e => { if (e.key === "Escape") close(); };
  bg.addEventListener("click", e => { if (e.target === bg) close(); }); document.addEventListener("keydown", onKey);
  $$("[data-close]", sheet).forEach(b => b.onclick = close);
  bind && bind(sheet, close); hydratePhotos(sheet);
  return close;
}
function alertSheet(kind, title, body) { openSheet(`<div class="note ${kind}" style="font-size:1.05rem">${ic("shield")}<span><b>${esc(title)}</b><br>${esc(body)}</span></div><button class="btn primary block" data-close>فهمت</button>`); }

/* ================= meal helpers ================= */
const mealReadings = m => S.readings.filter(r => r.mealId === m.id).sort((a, b) => a.minutes - b.minutes);
function mealStatus(m) { const now = Date.now(), due = m.ts + m.measureAt * 60000;
  if (mealReadings(m).length) return {k: "done"}; if (now < due - 10 * 60000) return {k: "wait", mins: r0((due - now) / 60000)}; if (now <= due + 120 * 60000) return {k: "due"}; return {k: "missed"}; }
function mealName(m) { return m.title || m.items.map(i => i.name).slice(0, 3).join("، ") || "وجبة"; }
function thumbHTML(m, cls = "thumb") { if (m.photo) return `<img class="${cls}" src="${m.photo}" alt="">`; if (m.photo_path) return `<div class="${cls}" data-photo-path="${esc(m.photo_path)}">${ic("image")}</div>`;
  const first = m.items.map(i => FOODS[i.key]).find(f => f && imgURL(f.id)); return first ? `<img class="${cls}" src="${imgURL(first.id, 160)}" alt="" referrerpolicy="no-referrer">` : `<div class="${cls}">${ic("bowl")}</div>`; }
function mealPlanPred(m) { return m.combo && m.followedPlan !== false ? m.combo : m.pred; }

/* ================= START + AUTH ================= */
function renderStart() {
  $("#flow").innerHTML = `<div class="flowwrap">
    <div class="row" style="gap:12px;margin-top:6px"><img src="icon.svg" width="52" height="52" alt="" style="border-radius:16px"><div><b style="font-family:var(--f-d);font-size:1.15rem">Preventive Glucose AI</b><br><span class="small muted">مساعدك قبل كل وجبة</span></div></div>
    <div class="welcome-hero">
      <svg viewBox="0 0 320 140" aria-hidden="true"><rect x="0" y="0" width="320" height="140" rx="18" fill="#fff"/><path d="M14 112 C70 112 92 26 150 26 C208 26 222 96 306 92" fill="none" stroke="#E8B4AE" stroke-width="7" stroke-linecap="round" stroke-dasharray="2 12"/><path d="M14 112 C80 112 100 64 150 64 C200 64 230 100 306 99" fill="none" stroke="#11876A" stroke-width="7" stroke-linecap="round"/><circle cx="150" cy="26" r="7" fill="#C93C34"/><circle cx="150" cy="64" r="8" fill="#11876A"/><text x="88" y="34" font-size="14" text-anchor="middle" font-family="Readex Pro" fill="#C93C34">بدون نصايح</text><text x="246" y="124" font-size="14" text-anchor="middle" font-family="Readex Pro" fill="#0B6B53">مع خطتك</text></svg>
      <h2 style="font-size:1.6rem">اعرف وش يسوي الأكل في سكرك قبل ما تاكل</h2>
      <p class="muted">صوّر صحنك، ونعطيك السكر المتوقع، وخطوات بسيطة تنزّله.</p>
    </div>
    <div class="stack">
      <div class="feat"><span class="oi">${ic("camera")}</span><span><b>صوّر وجبتك</b><br><span class="small muted">أكثر من ١٦٠ أكلة سعودية، و٨ آلاف صنف عالمي</span></span></div>
      <div class="feat"><span class="oi">${ic("drop")}</span><span><b>قِس بعد الأكل</b><br><span class="small muted">ونقارن قراءتك بالتوقع ونتعلم جسمك</span></span></div>
      <div class="feat"><span class="oi">${ic("cloud")}</span><span><b>بياناتك محفوظة</b><br><span class="small muted">${Cloud.on ? "ادخل بإيميلك من أي جهاز" : "في جهازك، مع نسخة احتياطية"}</span></span></div>
    </div>
    <div class="flowfoot" style="margin-top:auto">
      ${Cloud.on ? `<button class="btn primary block" id="st-new">${ic("mail")} ابدأ بإيميلك</button>` : `<button class="btn primary block" id="st-guest">ابدأ</button>`}
      ${Cloud.on ? `<button class="btn ghost block" id="st-guest">جرّب بدون حساب</button>` : ""}
    </div></div>`;
  $("#st-new") && ($("#st-new").onclick = () => go("auth"));
  $("#st-guest").onclick = async () => { S.guest = true; await Store.set("guest", true); startOnboard(false); go("onboard"); };
}
const AUTH = {step: "email", email: "", err: ""};
function renderAuth() {
  const A = AUTH;
  const body = A.step === "email" ? `<h2>وش إيميلك؟</h2><p class="sub">نرسل لك رسالة دخول على إيميلك، بدون كلمة مرور. بنفس الإيميل تدخل من أي جوال أو كمبيوتر وتلقى بياناتك.</p>
      <div class="field"><label for="au-e">الإيميل</label><input id="au-e" class="input" type="email" inputmode="email" autocomplete="email" value="${esc(A.email)}" placeholder="name@example.com" style="direction:ltr;text-align:right"></div>`
    : `<h2>افتح إيميلك</h2><p class="sub">أرسلنا رسالة إلى <b class="ltr">${esc(A.email)}</b>. اضغط الرابط اللي فيها من <b>نفس الجهاز</b> وتدخل مباشرة. إذا وصلك رمز من ٦ أرقام اكتبه هنا. (شيك على الرسائل غير المرغوبة إذا ما لقيتها)</p>
      <div class="otp" role="group" aria-label="رمز الدخول">${[0, 1, 2, 3, 4, 5].map(i => `<input inputmode="numeric" maxlength="1" data-i="${i}" aria-label="رقم ${i + 1}" autocomplete="${i ? "off" : "one-time-code"}">`).join("")}</div>
      <button class="link" id="au-resend" style="align-self:flex-start">ما وصلني، أرسل مرة ثانية</button>`;
  $("#flow").innerHTML = `<div class="flowwrap"><div class="flowhead"><button class="iconbtn" id="au-back" aria-label="رجوع">${ic("back")}</button></div>
    <div class="flowbody">${body}${A.err ? `<div class="note bad">${ic("x")}<span>${esc(A.err)}</span></div>` : ""}<p class="xs muted">بياناتك الصحية خاصة بحسابك فقط، ومحمية بصلاحيات على مستوى كل مستخدم.</p></div>
    <div class="flowfoot"><button class="btn primary block" id="au-go">${A.step === "email" ? "أرسل رسالة الدخول" : "دخول بالرمز"}</button></div></div>`;
  const R = $("#flow");
  $("#au-back").onclick = () => { if (A.step === "code") { A.step = "email"; A.err = ""; renderAuth(); } else go("start"); };
  if (A.step === "email") { const e = $("#au-e"); setTimeout(() => e.focus(), 60); e.onkeydown = ev => { if (ev.key === "Enter") $("#au-go").click(); };
    $("#au-go").onclick = async () => { const email = e.value.trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { A.err = "اكتب الإيميل بشكل صحيح."; renderAuth(); return; }
      const b = $("#au-go"); b.disabled = true; b.textContent = "يرسل…"; A.email = email;
      try { await Cloud.sendCode(email); A.step = "code"; A.err = ""; } catch (er) { A.err = /rate|limit|seconds/i.test(er.message || "") ? "طلبت رموز كثيرة. انتظر دقيقة وجرّب." : "ما قدرنا نرسل الرمز. تأكد من الإيميل والاتصال."; }
      renderAuth(); }; }
  else {
    const boxes = $$(".otp input", R); setTimeout(() => boxes[0].focus(), 60);
    const code = () => boxes.map(b => b.value).join("");
    boxes.forEach((b, i) => { b.oninput = () => { b.value = b.value.replace(/\D/g, "").slice(-1); if (b.value && i < 5) boxes[i + 1].focus(); if (code().length === 6) $("#au-go").click(); };
      b.onkeydown = e => { if (e.key === "Backspace" && !b.value && i) boxes[i - 1].focus(); };
      b.onpaste = e => { const t = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6); if (t.length === 6) { e.preventDefault(); t.split("").forEach((d, j) => boxes[j].value = d); $("#au-go").click(); } }; });
    $("#au-resend").onclick = async () => { try { await Cloud.sendCode(A.email); toast("أرسلنا رمز جديد"); } catch (e) { toast("انتظر دقيقة وجرّب"); } };
    $("#au-go").onclick = async () => { if (code().length !== 6) return; const b = $("#au-go"); b.disabled = true; b.textContent = "يتحقق…";
      try { await Cloud.verify(A.email, code()); await afterLogin(); } catch (er) { A.err = "الرمز غير صحيح أو انتهى. اطلب رمز جديد."; renderAuth(); } };
  }
}
async function afterLogin() {
  S.guest = false; await Store.del("guest"); AUTH.step = "email"; AUTH.err = "";
  await Cloud.sync();
  if (S.profile) { toast("أهلاً " + firstName(S.profile.name)); go("today"); }
  else { startOnboard(false); go("onboard"); }
}

/* ================= TODAY ================= */
function viewToday() {
  clearInterval(tickTimer); tickTimer = null;
  const p = S.profile || {}, md = curModel(), now = Date.now(), today = S.meals.filter(m => sameDay(m.ts, now));
  const score = avg(today.map(m => GRADE_SCORE[m.grade])), [calOk] = calAllowed(p);
  const due = S.meals.filter(m => mealStatus(m).k === "due"), waiting = S.meals.filter(m => mealStatus(m).k === "wait");
  const run = S.calibRun && S.calibRun.stage !== "done" ? S.calibRun : null;
  let tasks = "";
  for (const m of due) tasks += `<button class="card task alert" data-read="${m.id}"><span class="ic">${ic("drop")}</span><span><b>حان وقت القياس</b><br><span class="small">${esc(mealName(m))}</span></span>${ic("next")}</button>`;
  for (const m of waiting) tasks += `<div class="card task brand"><span class="ic">${ic("clock")}</span><span><b>قِس بعد ${minsTxt(mealStatus(m).mins)}</b><br><span class="small muted">${esc(mealName(m))} · الساعة ${fmtTime(m.ts + m.measureAt * 60000)}</span></span><span></span></div>`;
  if (run) tasks += `<a class="card task" href="#calib"><span class="ic">${ic("flask")}</span><span><b>اختبار المعايرة شغّال</b><br><span class="small muted" id="today-calib">كمّل القراءات</span></span>${ic("next")}</a>`;
  else if (!md.calibrated && calOk) tasks += `<a class="card task" href="#calib"><span class="ic">${ic("flask")}</span><span><b>الخطوة الأهم: اختبار المعايرة</b><br><span class="small muted">ساعتين الصبح على الريق. يخلي التوقع على مقاس جسمك.</span></span>${ic("next")}</a>`;
  $("#view").innerHTML = `<section class="screen">
    <div class="topbar"><div><div class="eyebrow">${new Date().toLocaleDateString(LOC, {weekday: "long", day: "numeric", month: "long"})}</div><h1>${new Date().getHours() < 12 ? "صباح الخير" : "مساء الخير"}${p.name ? "، " + esc(firstName(p.name)) : ""}</h1></div>
      <a class="avatar" href="#me" aria-label="حسابي">${esc((p.name || "؟").trim().charAt(0) || "؟")}</a></div>
    <a href="#scan" class="btn primary block" style="min-height:66px;font-size:1.2rem">${ic("camera")} سجّل وجبتك الحين</a>
    ${tasks}
    <div class="hero"><div>${ringSVG(score, 112, "مؤشر اليوم")}</div>
      <div class="stats"><small>مؤشر وجبات اليوم من ١٠٠</small>
        <div class="stat"><b class="num">${today.length}</b> <small>وجبات</small> · <b class="num">${today.filter(m => mealPlanPred(m).peak < 140).length}</b> <small>تحت ١٤٠</small></div>
        <small>${score == null ? "يبدأ المؤشر مع أول وجبة تسجلها اليوم" : score >= 80 ? "يومك ممتاز، استمر" : score >= 60 ? "يوم مقبول، فيه مجال للتحسين" : "وجبات اليوم ثقيلة، جرّب البدائل"}</small></div></div>
    <div class="card"><div class="row between"><h3>وجبات اليوم</h3><a class="link" href="#log">السجل كامل</a></div>
      ${today.length ? `<div class="list">${today.map(mealRow).join("")}</div>` : `<p class="muted">ما سجلت أكل اليوم.</p>`}</div>
    <div class="grid2">
      <button class="card task brand" data-act="quickread" style="grid-template-columns:1fr;justify-items:start"><span class="ic">${ic("drop")}</span><b>سجّل قراءة</b></button>
      <button class="card task brand" data-act="compare" style="grid-template-columns:1fr;justify-items:start"><span class="ic">${ic("compare")}</span><b>قارن أكلتين</b></button>
    </div>
    ${gateOf(p).level !== "ok" ? `<div class="note">${ic("shield")}<span>${esc(gateOf(p).msgs[0])}</span></div>` : ""}
  </section>`;
  bindMealRows();
  $$("[data-read]").forEach(b => b.onclick = () => openReadingSheet(S.meals.find(m => m.id === b.dataset.read)));
  $("[data-act=quickread]").onclick = () => openReadingSheet(null);
  $("[data-act=compare]").onclick = () => openCompare();
  if (run) { const upd = () => { const e = $("#today-calib"); if (!e) return; const nx = nextDue(run); e.textContent = nx ? (nx.left > 0 ? `القراءة الجاية بعد ${fmtLeft(nx.left)}` : `حان وقت قراءة ${nx.t} دقيقة`) : "احسب النتيجة"; }; upd(); tickTimer = setInterval(upd, 1000); }
}
function mealRow(m) {
  const st = mealStatus(m), rs = mealReadings(m);
  const sub = rs.length ? `قستَ <b class="num">${rs[rs.length - 1].v}</b> · توقعنا ${rs[rs.length - 1].expected ?? "—"}` : st.k === "due" ? `<b class="gt-D">قِس الحين</b>` : `السكر المتوقع <b class="num">${r0(mealPlanPred(m).peak)}</b>`;
  return `<button class="meal" data-meal="${m.id}">${thumbHTML(m)}<span style="min-width:0"><span class="t">${esc(mealName(m))}</span><span class="small muted">${fmtTime(m.ts)} · ${sub}</span></span><span class="grade g-${m.grade}">${m.grade}</span></button>`;
}
function bindMealRows(root = document) { $$("[data-meal]", root).forEach(b => b.onclick = () => openMealSheet(S.meals.find(m => m.id === b.dataset.meal))); }

/* ================= LOG ================= */
function viewLog() {
  const f = S.logFilter;
  const items = [...S.meals.map(m => ({t: "m", ts: m.ts, m})), ...S.readings.filter(r => !r.mealId).map(r => ({t: "r", ts: r.ts, r}))]
    .filter(x => f === "all" || (f === "meals" && x.t === "m") || (f === "readings" && x.t === "r")).sort((a, b) => b.ts - a.ts);
  const groups = []; for (const x of items) { const k = new Date(x.ts).toDateString(); let g = groups.find(g => g.k === k); if (!g) groups.push(g = {k, ts: x.ts, xs: []}); g.xs.push(x); }
  const KIND = {fasting: "صائم", pre: "قبل الأكل", post: "بعد الأكل", random: "عشوائية"};
  $("#view").innerHTML = `<section class="screen">
    <div class="topbar"><h1>السجل</h1><button class="iconbtn" data-act="add" aria-label="سجّل قراءة">${ic("plus")}</button></div>
    <div class="chips">${[["all", "الكل"], ["meals", "الوجبات"], ["readings", "القراءات"]].map(([k, l]) => `<button class="chip" data-f="${k}" aria-pressed="${f === k}">${l}</button>`).join("")}</div>
    ${groups.length ? groups.map(g => `<div class="daylabel">${fmtDay(g.ts)}</div><div class="card"><div class="list">${g.xs.map(x => x.t === "m" ? mealRow(x.m) :
      `<div class="lrow"><span class="oi">${ic("drop")}</span><span><b class="num">${x.r.v}</b> <span class="small muted">ملجم/دسل · ${KIND[x.r.kind] || ""}</span><br><span class="xs muted">${fmtTime(x.r.ts)}</span></span><span class="pill ${x.r.v < 70 ? "gs-E gt-E" : x.r.v < 140 ? "gs-A gt-A" : x.r.v < 180 ? "gs-C gt-C" : "gs-E gt-E"}">${x.r.v < 70 ? "منخفض" : x.r.v < 140 ? "طبيعي" : x.r.v < 180 ? "مرتفع" : "عالي"}</span></div>`).join("")}</div></div>`).join("") :
    `<div class="card"><div class="empty"><div class="art">${ic("list")}</div><b>السجل فاضي</b><p class="muted">كل وجبة تسجلها وكل قراءة تدخلها تظهر هنا.</p><a class="btn primary" href="#scan">${ic("camera")} سجّل أول وجبة</a></div></div>`}
  </section>`;
  $$("[data-f]").forEach(b => b.onclick = () => { S.logFilter = b.dataset.f; viewLog(); hydratePhotos(); });
  $("[data-act=add]").onclick = () => openReadingSheet(null);
  bindMealRows();
}

/* ================= INSIGHTS ================= */
function viewInsights() {
  const md = curModel(), withR = [];
  for (const m of S.meals) for (const r of mealReadings(m)) if (r.expected != null) withR.push({m, r});
  const mae = avg(withR.map(x => Math.abs(x.r.v - x.r.expected)));
  const byFood = {};
  for (const m of S.meals) { const rs = mealReadings(m); if (!rs.length) continue; const rise = Math.max(...rs.map(r => r.v)) - (m.pred.g0 || md.g0);
    const its = m.items.map(it => ({...it, data: itemData(it)})).filter(it => it.data), T = totals(its.map(i => ({g: i.grams, data: i.data})));
    for (const it of its) { const gl = Math.max(0, it.data.c - it.data.f) * it.grams / 100 * it.data.gi / 100; if (T.gl && gl / T.gl >= 0.25) (byFood[it.name] = byFood[it.name] || {a: [], key: it.key}).a.push(rise); } }
  const ranked = Object.entries(byFood).map(([n, o]) => ({n, key: o.key, v: avg(o.a), c: o.a.length})).sort((a, b) => b.v - a.v);
  const week = S.meals.filter(m => Date.now() - m.ts < 7 * 864e5), gc = {A: 0, B: 0, C: 0, D: 0, E: 0}; week.forEach(m => gc[m.grade]++);
  const t0 = new Date(); t0.setHours(0, 0, 0, 0); const start = t0.getTime() - 13 * 864e5;
  const pts = S.readings.filter(r => r.ts >= start).map(r => [(r.ts - start) / 864e5 * 10, r.v, r.v < 70 || r.v >= 180 ? "var(--gE)" : r.v >= 140 ? "var(--gC)" : "var(--gA)"]);
  $("#view").innerHTML = `<section class="screen">
    <div class="topbar"><h1>رؤاك</h1></div>
    <div class="card"><div class="row between"><h3>نموذج جسمك</h3><span class="pill ${md.calibrated ? "gs-A gt-A" : "gs-C gt-C"}">${md.calibrated ? "معاير" : "تقدير أولي"}</span></div>
      <div class="kpis"><div class="kpi"><small>حساسية السكر</small><b class="num">${r1(md.s)}</b></div><div class="kpi"><small>قمتك بعد</small><b class="num">${r0(md.tpG + GLUCOSE_DELAY)} د</b></div><div class="kpi"><small>دقة التوقع</small><b class="num">${mae != null ? "±" + r0(mae) : "—"}</b></div></div>
      <p class="small muted">${md.calibrated ? `تعلّم من ${md.n || 0} قراءة بعد الأكل.` : "مبني على بياناتك فقط. اختبار المعايرة والقراءات بعد الأكل تخليه يعرف جسمك."}</p>
      ${!md.calibrated && calAllowed(S.profile)[0] ? `<a class="btn primary block" href="#calib">${ic("flask")} ابدأ اختبار المعايرة</a>` : ""}</div>
    <div class="card"><h3>تقييم وجباتك هالأسبوع</h3>
      ${week.length ? `<div class="bar">${"ABCDE".split("").map(k => gc[k] ? `<i class="g-${k}" style="width:${gc[k] / week.length * 100}%"></i>` : "").join("")}</div><div class="legend">${"ABCDE".split("").filter(k => gc[k]).map(k => `<span><i class="dot g-${k}"></i>${k}: ${gc[k]}</span>`).join("")}</div>` : `<p class="muted">ما فيه وجبات هالأسبوع.</p>`}</div>
    <div class="card"><h3>أكلات ترفع سكرك أنت</h3>
      ${ranked.length ? `<div class="list">${ranked.slice(0, 6).map(x => `<div class="lrow">${ftile(FOODS[x.key] || {cat: "other"})}<span><b>${esc(x.n)}</b><br><span class="xs muted">من ${x.c} قراءة</span></span><span class="pill ${x.v >= 60 ? "gs-E gt-E" : x.v >= 35 ? "gs-C gt-C" : "gs-A gt-A"}">${sign(x.v)}</span></div>`).join("")}</div>` :
      `<p class="muted">تظهر بعد ما تدخل قراءات بعد الوجبات. نفس الأكل يأثر على كل شخص بشكل مختلف، وهنا تشوف تأثيره عليك أنت.</p>`}</div>
    <div class="card"><h3>قراءاتك آخر أسبوعين</h3>
      ${pts.length ? `<div class="chart">${curveSVG([{pts, color: "var(--brand2)", dots: true, line: false, r: 6}], {xmax: 140, ticks: [0, 35, 70, 105, 135], tickFmt: t => new Date(start + t / 10 * 864e5).toLocaleDateString(LOC, {day: "numeric", month: "numeric"}), label: "القراءات"})}</div>` : `<p class="muted">ما فيه قراءات بعد.</p>`}</div>
    ${S.calib ? `<div class="card"><h3>نتيجة اختبار المعايرة</h3><div class="chart">${calibChart(S.calib)}</div><p class="small muted">${esc(S.calib.shape || "")}</p></div>` : ""}
  </section>`;
}

/* ================= FOODS ================= */
function foodPred(F) { return predict([{g: F.unit[1], data: F}], {order: "mixed", walk: "0", time: "noon"}, curModel(), S.profile); }
function viewFoods() {
  $("#view").innerHTML = `<section class="screen">
    <div class="topbar"><h1>مكتبة الأكل</h1></div>
    <label class="searchbox">${ic("search")}<input id="fq" type="search" placeholder="ابحث: كبسة، جريش، تمر…" value="${esc(S.foodQ)}" aria-label="ابحث عن أكل"></label>
    <div class="chips">${CATS.map(([k, l]) => `<button class="chip" data-cat="${k}" aria-pressed="${S.foodCat === k}">${l}</button>`).join("")}</div>
    <div class="card"><div class="list" id="flist"></div></div>
    <div class="card soft"><h3>البحث الموسّع</h3><p class="small muted">قاعدة USDA الأمريكية: ٨٧٨٩ صنف بالإنجليزي (مثل: oats، lentils، chicken breast).</p>
      <label class="searchbox" style="background:#fff">${ic("search")}<input id="uq" type="search" placeholder="Search in English…" style="direction:ltr" aria-label="ابحث بالإنجليزي"></label><div class="list" id="ulist"></div></div>
    <p class="xs muted">التقييم محسوب على حصة واحدة لجسمك أنت. المصادر: هيئة الغذاء والدواء ٢٠٢٦، دراسات سعودية منشورة، وUSDA. الصور من ويكيميديا كومنز.</p>
  </section>`;
  const row = f => { const p = foodPred(f), avail = Math.max(0, f.c - f.f) * f.unit[1] / 100;
    return `<button class="lrow" data-food="${esc(f.id)}">${ftile(f)}<span style="min-width:0"><b>${esc(f.ar)}</b><br><span class="xs muted">${esc(f.unit[0])} ${r0(f.unit[1])} جم · نشويات ${r0(avail)} جم</span></span><span class="grade g-${p.grade}" style="width:42px;height:42px;font-size:1.1rem">${p.grade}</span></button>`; };
  const draw = () => { const list = searchFoods(S.foodQ, S.foodCat, 200);
    $("#flist").innerHTML = list.length ? list.map(row).join("") : `<div class="empty"><b>ما لقينا "${esc(S.foodQ)}"</b><p class="small muted">جرّب البحث الموسّع تحت بالإنجليزي.</p></div>`;
    $$("#flist [data-food]").forEach(b => b.onclick = () => openFoodSheet(FOODS[b.dataset.food])); };
  draw();
  $("#fq").oninput = e => { S.foodQ = e.target.value; draw(); };
  $$("[data-cat]").forEach(b => b.onclick = () => { S.foodCat = b.dataset.cat; $$("[data-cat]").forEach(x => x.setAttribute("aria-pressed", x === b)); draw(); });
  $("#uq").oninput = async e => { const q = e.target.value; await loadUSDA(); const res = searchUSDA(q, 25);
    $("#ulist").innerHTML = res.map(row).join("") || (q.length > 1 ? `<p class="small muted" style="padding:8px 0">ما فيه نتائج.</p>` : "");
    $$("#ulist [data-food]").forEach(b => b.onclick = () => openFoodSheet(res.find(x => x.id === b.dataset.food))); };
}
function openFoodSheet(F) {
  const p = foodPred(F), sw = SWAPS[F.id], avail = Math.max(0, F.c - F.f) * F.unit[1] / 100;
  openSheet(`${imgURL(F.id) ? ftile(F, "lg") : ""}
    <div class="row" style="gap:14px"><span class="grade g-${p.grade}">${p.grade}</span><div style="min-width:0"><h2 style="font-size:1.35rem">${esc(F.ar)}</h2><span class="small muted">${esc(SRC_NAME[F.src] || F.src)}</span></div></div>
    <div class="kpis"><div class="kpi"><small>الحصة (${esc(F.unit[0])})</small><b class="num">${r0(F.unit[1])} جم</b></div><div class="kpi"><small>نشويات بالحصة</small><b class="num">${r0(avail)} جم</b></div><div class="kpi"><small>سكرك المتوقع</small><b class="num">${r0(p.peak)}</b></div></div>
    <div class="card"><table class="tbl"><tr><th>لكل ١٠٠ جم</th><th>القيمة</th></tr>
      <tr><td>سعرات</td><td class="num">${r0(F.kcal)}</td></tr><tr><td>كربوهيدرات</td><td class="num">${r1(F.c)} جم</td></tr><tr><td>ألياف</td><td class="num">${r1(F.f)} جم</td></tr>
      <tr><td>بروتين</td><td class="num">${r1(F.p)} جم</td></tr><tr><td>دهون</td><td class="num">${r1(F.fat)} جم</td></tr><tr><td>المؤشر الجلايسيمي</td><td class="num">${F.gi || "—"}${F.src === "QD" || !F.gi ? "" : " (تقدير)"}</td></tr></table></div>
    ${sw ? `<div class="note ok">${ic("swap")}<span><b>بديل أخف:</b> ${esc(sw[2])}</span></div>` : ""}
    <div class="grid2"><button class="btn primary" data-a="meal">${ic("plus")} سجّل وجبة</button><button class="btn" data-a="cmp">${ic("compare")} قارن</button></div>`,
  (sh, close) => { $("[data-a=meal]", sh).onclick = () => { close(); newScan(); S.scan.items.push(foodItem(F, F.unit[1])); S.scan.stage = "items"; go("scan"); };
    $("[data-a=cmp]", sh).onclick = () => { close(); openCompare(FOODS[F.id] ? F.id : undefined); }; });
}
function openCompare(a = "kabsa_chicken", b = "jareesh") {
  const opts = sel => CATS.slice(1).map(([k, l]) => `<optgroup label="${l}">${Object.values(FOODS).filter(f => f.cat === k && f.c > 2).map(f => `<option value="${f.id}" ${f.id === sel ? "selected" : ""}>${esc(f.ar)}</option>`).join("")}</optgroup>`).join("");
  openSheet(`<h2 style="font-size:1.35rem">قارن أكلتين</h2><p class="muted">حصة واحدة من كل أكلة، على جسمك أنت.</p>
    <div class="field"><label for="ca">الأكلة الأولى</label><select id="ca" class="input">${opts(a)}</select></div>
    <div class="field"><label for="cb">الأكلة الثانية</label><select id="cb" class="input">${opts(b)}</select></div>
    <div id="cout"></div><button class="btn block" data-close>تم</button>`, sh => {
    const draw = () => { const A = FOODS[$("#ca", sh).value], B = FOODS[$("#cb", sh).value], pa = foodPred(A), pb = foodPred(B), best = pa.peak <= pb.peak ? A : B, diff = Math.abs(pa.peak - pb.peak);
      $("#cout", sh).innerHTML = `<div class="beforeafter"><div class="box gs-${pa.grade}">${ftile(A)}<small>${esc(A.ar)}</small><b class="num">${r0(pa.peak)}</b></div><b class="muted" style="font-size:1rem">مقابل</b><div class="box gs-${pb.grade}">${ftile(B)}<small>${esc(B.ar)}</small><b class="num">${r0(pb.peak)}</b></div></div>
        <p style="font-size:1.08rem">${diff < 5 ? "الأكلتين متقاربتين على سكرك." : `<b>${esc(best.ar)}</b> أخف على سكرك بفرق تقريباً <b class="num">${r0(diff)}</b>.`}</p>`;
      $$("#cout .ftile", sh).forEach(t => { t.style.margin = "0 auto 6px"; }); };
    $("#ca", sh).onchange = draw; $("#cb", sh).onchange = draw; draw(); });
}

/* ================= ME ================= */
function viewMe() {
  const p = S.profile || {}, st = S.settings, b = bmi(p);
  const DX = {none: "بدون تشخيص", pre: "ما قبل السكري", t2: "سكري النوع الثاني", t1: "سكري النوع الأول", gdm: "سكري الحمل"};
  $("#view").innerHTML = `<section class="screen">
    <div class="topbar"><h1>حسابي</h1></div>
    <div class="card"><div class="row" style="gap:14px"><span class="avatar" style="width:60px;height:60px;font-size:1.5rem">${esc((p.name || "؟").charAt(0))}</span><div style="min-width:0"><h3>${esc(p.name || "")}</h3><span class="small muted">${p.age || "—"} سنة · ${DX[p.status] || ""}</span></div></div>
      <div class="kpis"><div class="kpi"><small>الوزن</small><b class="num">${p.weight || "—"}</b></div><div class="kpi"><small>كتلة الجسم</small><b class="num">${b ? r1(b) : "—"}</b></div><div class="kpi"><small>التراكمي</small><b class="num">${p.a1c ? p.a1c + "%" : "—"}</b></div></div>
      <button class="btn ghost block" data-a="edit">عدّل بياناتي</button></div>
    <div class="card">${Cloud.user ? `<div class="lrow"><span class="oi">${ic("cloud")}</span><span style="min-width:0"><b>محفوظ في حسابك</b><br><span class="xs muted ltr">${esc(Cloud.user.email || "")}</span></span><span id="sync-dot" class="sync ${Cloud.state === "err" ? "err" : ""}"><i></i>${Cloud.state === "err" ? "ما تزامن" : "متزامن"}</span></div>
        <div class="grid2"><button class="btn sm" data-a="sync">زامن الحين</button><button class="btn sm ghost" data-a="out">${ic("logout")} خروج</button></div>`
      : Cloud.on ? `<div class="lrow"><span class="oi">${ic("cloud")}</span><span><b>بياناتك في هذا الجهاز فقط</b><br><span class="xs muted">سجّل بإيميلك عشان تنحفظ وتفتحها من أي جهاز</span></span><span></span></div><a class="btn primary block" href="#auth">${ic("mail")} سجّل بإيميلك</a>`
      : `<div class="lrow"><span class="oi">${ic("cloud")}</span><span><b>بياناتك في هذا الجهاز فقط</b><br><span class="xs muted">خذ نسخة احتياطية كل فترة</span></span><span></span></div>`}</div>
    <div class="card"><div class="list">
      <a class="lrow" href="#calib"><span class="oi">${ic("flask")}</span><span><b>اختبار المعايرة</b><br><span class="xs muted">${S.calib ? "آخر اختبار " + fmtDay(S.calib.ts) : "ما سويته بعد"}</span></span>${ic("next")}</a>
      <button class="lrow" data-a="ai"><span class="oi">${ic("spark")}</span><span><b>تحليل الصور</b><br><span class="xs muted">${st.provider === "gemini" && st.key ? "مفعّل" : st.provider === "worker" && st.endpoint ? "مفعّل (خادم خاص)" : "غير مفعّل"}</span></span>${ic("next")}</button>
      <button class="lrow" data-a="notif"><span class="oi">${ic("bell")}</span><span><b>تذكير القياس</b><br><span class="xs muted">${"Notification" in window ? (Notification.permission === "granted" ? "مفعّل" : "غير مفعّل") : "غير مدعوم"}</span></span>${ic("next")}</button>
      <button class="lrow" data-a="backup"><span class="oi">${ic("download")}</span><span><b>نسخة احتياطية</b><br><span class="xs muted">نزّل بياناتك كملف</span></span>${ic("next")}</button>
      <button class="lrow" data-a="method"><span class="oi">${ic("book")}</span><span><b>كيف يحسب التطبيق والمصادر</b></span>${ic("next")}</button>
    </div></div>
    <div class="note">${ic("shield")}<span>أداة مساعدة لنمط الحياة، وليست تشخيصاً ولا بديلاً عن الطبيب. لا تغيّر جرعة أي دواء بناءً عليها.</span></div>
    <p class="xs muted" style="text-align:center">Preventive Glucose AI · نسخة تجريبية ٤</p>
  </section>`;
  $("[data-a=edit]").onclick = () => { startOnboard(true); go("onboard"); };
  $("[data-a=ai]").onclick = openAISettings;
  $("[data-a=notif]").onclick = async () => { if (!("Notification" in window)) return toast("المتصفح ما يدعم التنبيهات"); const r = await Notification.requestPermission(); toast(r === "granted" ? "تفعّل التذكير" : "ما تفعّل التذكير"); viewMe(); };
  $("[data-a=backup]").onclick = openBackup; $("[data-a=method]").onclick = openMethod;
  $("[data-a=sync]") && ($("[data-a=sync]").onclick = async () => { const r = await Cloud.sync(); toast(r === null ? "ما قدرنا نزامن، تأكد من الاتصال" : "تمت المزامنة"); viewMe(); });
  $("[data-a=out]") && ($("[data-a=out]").onclick = () => openSheet(`<h2 style="font-size:1.3rem">تسجيل الخروج</h2><p class="muted">بياناتك محفوظة في حسابك. تبي تمسحها من هذا الجهاز بعد الخروج؟</p>
    <button class="btn primary block" data-o="keep">اخرج وخلّها في الجهاز</button><button class="btn block" data-o="wipe">اخرج وامسحها من الجهاز</button><button class="btn ghost block" data-close>إلغاء</button>`, (sh, close) => {
    $$("[data-o]", sh).forEach(b => b.onclick = async () => { await Cloud.signOut(); if (b.dataset.o === "wipe") { await Store.clearAll(); Object.assign(S, {profile: null, model: null, calib: null, calibRun: null, meals: [], readings: []}); } close(); toast("سجلت خروج"); go(S.profile ? "today" : "start"); }); }));
}
function openAISettings() {
  const st = S.settings;
  openSheet(`<h2 style="font-size:1.35rem">تحليل الصور</h2><p class="muted">بدون تحليل تختار الأكل بالبحث. مع التحليل يتعرّف على صحنك ويقدّر الكميات.</p>
    <div class="stack">${[["none", "بدون تحليل", "تختار الأكل بنفسك"], ["gemini", "Google Gemini (مجاني)", "مفتاح مجاني من Google"], ["worker", "خادم خاص", "Cloudflare Worker"]].map(([k, t, d]) => `<button class="opt" data-p="${k}" aria-pressed="${st.provider === k}"><span class="oi">${ic(k === "none" ? "search" : "spark")}</span><span><b>${t}</b><span>${d}</span></span><span class="tick">${ic("check")}</span></button>`).join("")}</div>
    <div id="pg" class="stack"></div>
    <div class="grid2"><button class="btn" data-a="test">جرّب</button><button class="btn primary" data-a="save">احفظ</button></div>
    <p class="xs muted">المفتاح ينحفظ في هذا الجهاز فقط ولا ينرفع لحسابك.</p>`, (sh, close) => {
    let prov = st.provider;
    const fields = () => { $("#pg", sh).innerHTML = prov === "gemini" ? `<div class="note info">${ic("spark")}<span>افتح <b class="ltr">aistudio.google.com/apikey</b>، سجّل بحساب قوقل، اضغط Create API key، وانسخه هنا.</span></div>
      <div class="field"><label for="ak">المفتاح</label><input id="ak" class="input" type="password" autocomplete="off" value="${esc(st.key || "")}" style="direction:ltr"></div>
      <div class="field"><label for="am">الموديل</label><input id="am" class="input" value="${esc(st.model || "gemini-3.8-flash")}" style="direction:ltr"></div>` :
      prov === "worker" ? `<div class="field"><label for="ae">رابط الخادم</label><input id="ae" class="input" type="url" value="${esc(st.endpoint || "")}" style="direction:ltr"></div>` : ""; };
    fields();
    $$("[data-p]", sh).forEach(b => b.onclick = () => { prov = b.dataset.p; $$("[data-p]", sh).forEach(x => x.setAttribute("aria-pressed", x === b)); fields(); });
    const read = () => ({...S.settings, provider: prov, key: $("#ak", sh)?.value.trim() ?? S.settings.key, model: $("#am", sh)?.value.trim() || S.settings.model, endpoint: $("#ae", sh)?.value.trim() ?? S.settings.endpoint});
    $("[data-a=save]", sh).onclick = async () => { S.settings = read(); await Store.set("settings", S.settings); toast("انحفظت"); close(); if (location.hash === "#me") viewMe(); };
    $("[data-a=test]", sh).onclick = async () => { const b = $("[data-a=test]", sh); b.disabled = true; b.textContent = "يجرّب…"; try { await aiPing(read()); toast("شغّال ✓"); } catch (e) { toast("ما اشتغل: " + aiErrText(e)); } b.disabled = false; b.textContent = "جرّب"; };
  });
}
function openBackup() {
  openSheet(`<h2 style="font-size:1.35rem">نسخة احتياطية</h2><p class="muted">${Cloud.user ? "بياناتك محفوظة في حسابك. النسخة هنا إضافية." : "بياناتك في هذا الجهاز فقط. خذ نسخة كل فترة."}</p>
    <button class="btn primary block" data-a="exp">${ic("download")} نزّل نسخة</button><button class="btn block" data-a="imp">${ic("upload")} استرجع من نسخة</button><input type="file" id="impf" accept="application/json,.json" hidden>
    <div class="divider"></div><button class="btn ghost block" data-a="wipe" style="color:var(--gE)">${ic("trash")} امسح بيانات هذا الجهاز</button>
    <div id="wc" hidden class="note bad"><span><b>متأكد؟</b> ${Cloud.user ? "تنمسح من هذا الجهاز وتبقى في حسابك." : "المسح نهائي."}<br><span class="row" style="margin-top:8px"><button class="btn sm primary" data-a="wy">امسح</button><button class="btn sm" data-a="wn">تراجع</button></span></span></div>`, (sh, close) => {
    $("[data-a=exp]", sh).onclick = () => { const data = {app: "preventive-glucose-ai", v: 4, exported: new Date().toISOString(), profile: S.profile, model: S.model, calib: S.calib, meals: S.meals, readings: S.readings};
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], {type: "application/json"})); a.download = "glucose-backup-" + new Date().toISOString().slice(0, 10) + ".json"; document.body.appendChild(a); a.click(); a.remove(); };
    $("[data-a=imp]", sh).onclick = () => $("#impf", sh).click();
    $("#impf", sh).onchange = async e => { try { const d = JSON.parse(await e.target.files[0].text()); if (!d || d.app !== "preventive-glucose-ai") throw 0;
      for (const k of ["profile", "model", "calib"]) if (d[k]) await saveKV(k, d[k]); for (const m of d.meals || []) await putMeal(m); for (const r of d.readings || []) await putReading(r);
      await loadAll(); toast("رجعت بياناتك"); close(); go("today"); } catch (err) { toast("الملف غير صالح"); } };
    $("[data-a=wipe]", sh).onclick = () => $("#wc", sh).hidden = false; $("[data-a=wn]", sh).onclick = () => $("#wc", sh).hidden = true;
    $("[data-a=wy]", sh).onclick = async () => { await Store.clearAll(); if (Cloud.user) await Cloud.signOut(); Object.assign(S, {profile: null, model: null, calib: null, calibRun: null, meals: [], readings: []}); OB.started = false; close(); go("start"); };
  });
}
function openMethod() {
  openSheet(`<h2 style="font-size:1.35rem">كيف يحسب التطبيق</h2>
    <ol class="stack small" style="padding-inline-start:20px;margin:0">
      <li><b>حساسيتك</b> = ارتفاع السكر في اختبار الجلوكوز ÷ جرامات الجلوكوز. قبل الاختبار تُقدّر من التراكمي والوزن والخصر والعمر والنشاط.</li>
      <li><b>حمل الوجبة</b> = مجموع (النشويات × المؤشر الجلايسيمي ÷ ١٠٠). المؤشر محسوب بالنسبة للجلوكوز، فالمعايرة بالجلوكوز تنطبق مباشرة.</li>
      <li><b>السكر المتوقع</b> = سكرك قبل الأكل + حساسيتك × الحمل × أثر: ترتيب الأكل، المشي، البروتين والدهون والألياف، أدويتك، النوم والتوتر.</li>
      <li><b>التعلّم</b>: كل قراءة بعد الأكل تقارن بالتوقع وتعدّل حساسيتك.</li></ol>
    <h3>المصادر</h3><div class="list small">
      ${[["https://www.sfda.gov.sa/en/news/5521984", "جداول تركيب الأغذية السعودية — هيئة الغذاء والدواء ٢٠٢٦"], ["https://pmc.ncbi.nlm.nih.gov/articles/PMC12641437/", "Basaqr وآخرون، Frontiers in Nutrition ٢٠٢٥"], ["https://pmc.ncbi.nlm.nih.gov/articles/PMC6074203/", "المؤشر الجلايسيمي للتمور — جامعة القصيم ٢٠١٦"], ["https://fdc.nal.usda.gov", "USDA FoodData Central, SR28 (ملكية عامة)"], ["https://link.springer.com/article/10.1007/BF01228083", "Buchanan & McKiddie، Diabetologia ١٩٦٧"], ["https://doi.org/10.2337/dc15-0429", "ترتيب الأكل — Shukla وآخرون ٢٠١٥"], ["https://doi.org/10.1007/s00125-016-4085-2", "المشي بعد الأكل — Reynolds وآخرون ٢٠١٦"], ["https://commons.wikimedia.org", "صور الأكل: ويكيميديا كومنز (CC BY / CC BY-SA / CC0)"]].map(([u, t]) => `<a class="lrow" href="${u}" target="_blank" rel="noopener"><span class="oi">${ic("book")}</span><span>${t}</span>${ic("next")}</a>`).join("")}
    </div><button class="btn block" data-close>تم</button>`);
}

/* ================= READINGS ================= */
function openReadingSheet(meal) {
  const KINDS = [["fasting", "صائم"], ["pre", "قبل الأكل"], ["random", "عشوائية"]];
  let kind = new Date().getHours() < 10 ? "fasting" : "random", followed = meal && meal.combo ? "yes" : null;
  const el = meal ? r0((Date.now() - meal.ts) / 60000) : 0, MINS = [30, 60, 90, 120, 180, 240];
  let mins = meal ? (el >= 15 && el <= 300 ? el : meal.measureAt) : 0;
  openSheet(`<h2 style="font-size:1.35rem">${meal ? "قراءتك بعد الأكل" : "سجّل قراءة"}</h2>
    ${meal ? `<div class="row" style="gap:12px">${thumbHTML(meal)}<span><b>${esc(mealName(meal))}</b><br><span class="small muted">أكلتها الساعة ${fmtTime(meal.ts)}</span></span></div>
      <span class="flabel">كم مر من أول لقمة؟</span><div class="chips wrap">${MINS.map(t => `<button class="chip" data-m="${t}" aria-pressed="${t === mins}">${minsTxt(t)}</button>`).join("")}</div>
      <div class="unitbox"><input id="rm" type="number" inputmode="numeric" min="10" max="300" value="${mins}" aria-label="الدقائق"><span>دقيقة</span></div>
      ${meal.combo ? `<span class="flabel">طبّقت خطة الوجبة؟</span><div class="chips">${[["yes", "نعم"], ["part", "بعضها"], ["no", "لا"]].map(([v, l]) => `<button class="chip" data-fo="${v}" aria-pressed="${followed === v}">${l}</button>`).join("")}</div>` : ""}`
      : `<div class="chips">${KINDS.map(([k, l]) => `<button class="chip" data-k="${k}" aria-pressed="${k === kind}">${l}</button>`).join("")}</div>`}
    <div class="field"><label for="rv">القراءة (ملجم/دسل)</label><input id="rv" class="input bignum" type="number" inputmode="numeric" min="20" max="600" placeholder="000"></div>
    <div id="rmsg"></div><button class="btn primary block" data-a="save">احفظ القراءة</button>`, (sh, close) => {
    $$("[data-m]", sh).forEach(b => b.onclick = () => { mins = +b.dataset.m; $("#rm", sh).value = mins; $$("[data-m]", sh).forEach(x => x.setAttribute("aria-pressed", x === b)); });
    const rm = $("#rm", sh); if (rm) rm.oninput = () => { const v = parseFloat(rm.value); if (isFinite(v)) { mins = r0(v); $$("[data-m]", sh).forEach(x => x.setAttribute("aria-pressed", +x.dataset.m === mins)); } };
    $$("[data-k]", sh).forEach(b => b.onclick = () => { kind = b.dataset.k; $$("[data-k]", sh).forEach(x => x.setAttribute("aria-pressed", x === b)); });
    $$("[data-fo]", sh).forEach(b => b.onclick = () => { followed = b.dataset.fo; $$("[data-fo]", sh).forEach(x => x.setAttribute("aria-pressed", x === b)); });
    $("[data-a=save]", sh).onclick = async () => { const v = parseFloat($("#rv", sh).value);
      if (!isFinite(v) || v < 20 || v > 600) { $("#rmsg", sh).innerHTML = `<div class="note bad">${ic("x")}<span>اكتب رقم بين ٢٠ و٦٠٠.</span></div>`; return; }
      if (meal && (!isFinite(mins) || mins < 10 || mins > 300)) { $("#rmsg", sh).innerHTML = `<div class="note bad">${ic("x")}<span>اكتب الدقائق بين ١٠ و٣٠٠.</span></div>`; return; }
      const r = await saveReading({v, kind: meal ? "post" : kind, meal, minutes: mins, followed});
      close(); route();
      if (v < 70) return alertSheet("bad", "قراءتك أقل من ٧٠", "هذا هبوط. خذ ١٥ جم سكر سريع (نص كوب عصير أو ٣ تمرات) وأعد القياس بعد ١٥ دقيقة. إذا تكرر كلّم طبيبك.");
      if (v >= 300) return alertSheet("bad", "قراءتك ٣٠٠ أو أكثر", "تواصل مع طبيبك، خصوصاً إذا معها عطش شديد أو تعب أو غثيان.");
      if (!meal) return toast("انحفظت القراءة");
      const d = r.v - r.expected;
      openSheet(`<h2 style="font-size:1.35rem;text-align:center">الفرق عن التوقع</h2>
        <div class="beforeafter"><div class="box" style="background:var(--soft)"><small>توقعنا بعد ${minsTxt(r.minutes)}</small><b class="num">${r.expected}</b></div><b class="muted">${ic("next")}</b><div class="box ${Math.abs(d) <= 20 ? "gs-A" : "gs-D"}"><small>قستَ</small><b class="num">${r.v}</b></div></div>
        <p style="text-align:center;font-size:1.1rem">الفرق <b class="num ${Math.abs(d) <= 20 ? "gt-A" : "gt-D"}">${sign(d)}</b></p>
        <p class="muted">${Math.abs(d) <= 20 ? "التوقع كان قريب من قراءتك. ممتاز." : d > 0 ? "سكرك ارتفع أكثر من المتوقع، فرفعنا حساسيتك شوي. التوقعات الجاية أدق." : "سكرك أقل من المتوقع، فنزّلنا حساسيتك شوي. التوقعات الجاية أدق."}</p>
        <button class="btn primary block" data-close>تمام</button>`); };
  });
}
async function saveReading({v, kind, meal, minutes, followed}) {
  const r = {id: uid("r"), ts: Date.now(), v, kind};
  if (meal) {
    const usePlan = followed === "yes" && meal.combo, P = usePlan ? meal.combo : followed === "part" && meal.combo ? {g0: meal.pred.g0, curve: meal.pred.curve.map((p, i) => [p[0], (p[1] + (meal.combo.curve[i] || p)[1]) / 2])} : meal.pred;
    const expected = r0(valAt(P.curve, minutes));
    Object.assign(r, {mealId: meal.id, minutes, followed: followed || null, expected});
    const md = curModel(), predRise = expected - P.g0, obsRise = v - P.g0;
    if (predRise > 8 && v >= 70 && minutes <= 200) { const ratio = clamp(obsRise / predRise, 0.4, 2.5), w = 1 / ((md.n || 0) + 4); md.s = Math.exp(Math.log(md.s) + w * Math.log(Math.max(0.05, ratio))); }
    const rs = [...mealReadings(meal), r], a = rs.find(x => Math.abs(x.minutes - 60) <= 10), b = rs.find(x => Math.abs(x.minutes - 120) <= 15);
    if (a && b && !meal.tpAdjusted) { if (b.v > a.v) md.tpG = Math.min(110, md.tpG + 6); else if (b.v < a.v - 30) md.tpG = Math.max(20, md.tpG - 4); meal.tpAdjusted = true; await putMeal(meal); }
    md.n = (md.n || 0) + 1; md.log = (md.log || []).slice(-60).concat([{ts: r.ts, minutes, v, expected}]);
    await saveKV("model", md);
  }
  S.readings.unshift(r); await putReading(r); return r;
}

/* ================= MEAL DETAIL ================= */
function openMealSheet(m) {
  if (!m) return;
  const rs = mealReadings(m), st = mealStatus(m), P = m.combo || m.pred;
  const series = [{pts: P.curve, color: m.combo ? "var(--brand2)" : "var(--gD)", band: 0.15, g0: P.g0, peak: [P.tp, P.peak]}];
  if (rs.length) series.push({pts: rs.map(r => [r.minutes, r.v]), color: "var(--saffron)", dots: true, line: false, labels: true, r: 7});
  openSheet(`${m.photo || m.photo_path ? thumbHTML(m, "ftile lg") : ""}
    <div class="row between" style="flex-wrap:nowrap"><div style="min-width:0"><h2 style="font-size:1.3rem">${esc(mealName(m))}</h2><span class="muted">${fmtDay(m.ts)} · ${fmtTime(m.ts)}${m.pre ? ` · سكرك قبل الأكل <b class="num">${m.pre}</b>` : ""}</span></div><span class="grade g-${m.grade}">${m.grade}</span></div>
    <div class="card"><h3>${m.combo ? "توقعنا مع خطتك" : "السكر المتوقع"}</h3><div class="chart">${curveSVG(series)}</div>
      <div class="legend"><span><i class="dot" style="background:${m.combo ? "var(--brand2)" : "var(--gD)"}"></i>المتوقع</span>${rs.length ? `<span><i class="dot" style="background:var(--saffron)"></i>قراءاتك</span>` : ""}</div>
      ${m.combo ? `<p class="small muted">بدون الخطة كان المتوقع <b class="num">${r0(m.pred.peak)}</b>.</p>` : ""}</div>
    ${rs.length ? `<div class="card"><h3>قراءاتك مقابل التوقع</h3><table class="tbl"><tr><th>بعد</th><th>قستَ</th><th>توقعنا</th><th>الفرق</th></tr>${rs.map(r => { const d = r.v - (r.expected ?? r.v); return `<tr><td>${minsTxt(r.minutes)}</td><td class="num"><b>${r.v}</b></td><td class="num">${r.expected ?? "—"}</td><td class="num ${Math.abs(d) <= 20 ? "gt-A" : "gt-D"}">${sign(d)}</td></tr>`; }).join("")}</table></div>` : ""}
    <div class="card"><h3>محتوى الوجبة</h3><div class="list">${m.items.map(it => `<div class="lrow">${ftile(FOODS[it.key] || {cat: "other"})}<span>${esc(it.name)}</span><span class="small muted num">${r0(it.grams)} جم</span></div>`).join("")}</div></div>
    ${m.advice && m.advice.length ? `<div class="note ok">${ic("leaf")}<span><b>خطتك كانت:</b><br>${m.advice.map(esc).join("<br>")}</span></div>` : ""}
    <button class="btn primary block" data-a="read">${ic("drop")} ${rs.length ? "أضف قراءة ثانية" : st.k === "wait" ? `أضف قراءة (الموعد بعد ${minsTxt(st.mins)})` : "أضف قراءة بعد الأكل"}</button>
    <button class="btn block" data-a="edit">${ic("gear")} عدّل الوجبة</button>
    <button class="btn ghost block" data-a="del" style="color:var(--gE)">${ic("trash")} احذف الوجبة</button>
    <div id="dc" hidden class="note bad"><span><b>تحذف الوجبة وقراءاتها؟</b><br><span class="row" style="margin-top:8px"><button class="btn sm primary" data-a="dy">احذف</button><button class="btn sm" data-a="dn">تراجع</button></span></span></div>`, (sh, close) => {
    $("[data-a=read]", sh).onclick = () => { close(); openReadingSheet(m); };
    $("[data-a=edit]", sh).onclick = () => { close(); editMeal(m); };
    $("[data-a=del]", sh).onclick = () => $("#dc", sh).hidden = false; $("[data-a=dn]", sh).onclick = () => $("#dc", sh).hidden = true;
    $("[data-a=dy]", sh).onclick = async () => { await Store.remove("meals", m.id); for (const r of rs) await Store.remove("readings", r.id); Cloud.safe(() => Cloud.deleteMeal(m));
      S.meals = S.meals.filter(x => x.id !== m.id); S.readings = S.readings.filter(r => r.mealId !== m.id); close(); toast("انحذفت الوجبة"); route(); };
  });
}
function editMeal(m) {
  S.scan = {stage: "items", photo: m.photo, photo_path: m.photo_path, b64: null, items: m.items.map(it => ({key: it.key, name: it.name, data: itemData(it), grams: it.grams})).filter(i => i.data),
    tray: false, share: 1, ctx: {order: "mixed", walk: "0", time: "noon", ...m.ctx, state: {...((m.ctx || {}).state || {})}}, pre: m.pre ?? null, q: "", cat: "all", aiNote: "", err: "", editId: m.id, on: new Set(m.tipsOn || []), view: "plan"};
  go("scan");
}

/* ================= ONBOARDING ================= */
const OB = {started: false, i: 0, d: {}, edit: false};
const OB_STEPS = ["who", "name", "basics", "body", "weight2", "dx", "dxinfo", "meds", "cond", "labs", "life", "device", "plan"];
function startOnboard(edit) { OB.started = true; OB.edit = edit; OB.d = edit && S.profile ? JSON.parse(JSON.stringify(S.profile)) : {meds: {}, cond: {}, sex: "m"}; OB.i = 0; }
function opt(key, val, icon, title, desc, multi) { const on = multi ? !!(OB.d[key] || {})[val] : OB.d[key] === val;
  return `<button class="opt" data-k="${key}" data-v="${val}" ${multi ? "data-multi" : ""} aria-pressed="${on}"><span class="oi">${ic(icon)}</span><span><b>${title}</b>${desc ? `<span>${desc}</span>` : ""}</span><span class="tick">${ic("check")}</span></button>`; }
function numField(k, label, unit, min, max, step = 1, hint = "") { return `<div class="field"><label for="ob-${k}">${label}</label><div class="unitbox"><input id="ob-${k}" data-num="${k}" type="number" inputmode="decimal" step="${step}" min="${min}" max="${max}" value="${OB.d[k] ?? ""}"><span>${unit}</span></div>${hint ? `<span class="xs muted">${hint}</span>` : ""}</div>`; }
function bmiBox(d) { const b = bmi(d); if (!b) return ""; const [t, c] = bmiCat(b), pos = clamp((b - 15) / (40 - 15) * 100, 0, 100);
  const lo = r0(18.5 * Math.pow(d.height / 100, 2)), hi = r0(24.9 * Math.pow(d.height / 100, 2));
  return `<div class="bmi"><div class="row between"><span>مؤشر كتلة الجسم</span><b class="num" style="font-size:1.5rem;color:${c}">${r1(b)}</b></div><div class="scale"><i style="left:${pos}%"></i></div><span class="small"><b style="color:${c}">${t}</b> · الوزن الصحي لطولك بين <b class="num">${lo}</b> و<b class="num">${hi}</b> كجم</span></div>`; }
const isDiab = () => ["pre", "t2", "t1"].includes(OB.d.status);
function trendHTML() { const a = OB.d.a1c, p = OB.d.a1cPrev;
  if (a && p) { const d = r1(a - p), k = d > 0.2 ? "up" : d < -0.2 ? "down" : "flat"; OB.d.a1cTrend = k;
    return `<div class="note ${k === "up" ? "bad" : k === "down" ? "ok" : "info"}">${ic(k)}<span>سكرك التراكمي <b>${k === "up" ? "طالع" : k === "down" ? "نازل" : "ثابت"}</b> (<span class="ltr">${d > 0 ? "+" : ""}${d}</span>%)</span></div>`; }
  OB.d.a1cTrend = null; return a ? `<span class="small">التصنيف: <b class="gt-${a1cCat(a)[1]}">${a1cCat(a)[0]}</b></span>` : ""; }
const OBV = {
  who: () => ({title: "مين بيستخدم التطبيق؟", sub: "نضبط الشاشات على المستخدم.", body: `<div class="stack">${opt("who", "self", "user", "أنا", "أتابع سكري بنفسي")}${opt("who", "care", "family", "أتابع أحد أهلي", "أبوي، أمي، أو أحد كبار السن")}</div>`, valid: () => !!OB.d.who, auto: 1}),
  name: () => ({title: OB.d.who === "care" ? "وش اسم اللي تتابعه؟" : "وش نناديك؟", body: `<div class="field"><label for="ob-name">الاسم</label><input id="ob-name" class="input" autocomplete="given-name" value="${esc(OB.d.name || "")}" placeholder="مثلاً: أبو محمد"></div>`, valid: () => (OB.d.name || "").trim().length > 1,
    bind: r => $("#ob-name", r).oninput = e => { OB.d.name = e.target.value; obValid(); }}),
  basics: () => ({title: "الجنس والعمر", body: `<div class="grid2">${[["m", "ذكر"], ["f", "أنثى"]].map(([v, l]) => `<button class="opt" style="grid-template-columns:1fr auto" data-k="sex" data-v="${v}" aria-pressed="${OB.d.sex === v}"><span><b>${l}</b></span><span class="tick">${ic("check")}</span></button>`).join("")}</div>${numField("age", "العمر", "سنة", 10, 110)}`, valid: () => OB.d.sex && OB.d.age >= 10 && OB.d.age <= 110}),
  body: () => ({title: "الطول والوزن", sub: "نحسب مؤشر كتلة الجسم مباشرة.", body: `${numField("height", "الطول", "سم", 100, 230)}${numField("weight", "الوزن الحالي", "كجم", 30, 300, 0.1)}<div id="bmi">${bmiBox(OB.d)}</div>`,
    valid: () => OB.d.height >= 100 && OB.d.height <= 230 && OB.d.weight >= 30 && OB.d.weight <= 300, onNum: r => { $("#bmi", r).innerHTML = bmiBox(OB.d); }}),
  weight2: () => ({title: "وزنك آخر ٦ شهور", sub: "اتجاه الوزن يأثر على مقاومة الإنسولين.", body: `<div class="stack">${opt("wtrend", "down", "down", "نازل", "")}${opt("wtrend", "flat", "flat", "ثابت تقريباً", "")}${opt("wtrend", "up", "up", "زايد", "")}</div>
    ${numField("waist", "محيط الخصر (اختياري)", "سم", 40, 200, 1, "يُقاس عند مستوى السرة. فوق " + (OB.d.sex === "f" ? "٨٨" : "١٠٢") + " سم يرفع خطر مقاومة الإنسولين.")}`, valid: () => !!OB.d.wtrend}),
  dx: () => ({title: "وش آخر تشخيص؟", sub: "حسب آخر تحليل أو زيارة للطبيب.", body: `<div class="stack">${opt("status", "none", "shield", "ما عندي تشخيص", "أبي الوقاية")}${opt("status", "pre", "drop", "ما قبل السكري", "تراكمي بين ٥٫٧ و٦٫٤")}${opt("status", "t2", "drop", "سكري النوع الثاني", "")}${opt("status", "t1", "drop", "سكري النوع الأول", "")}${opt("status", "gdm", "heart", "سكري الحمل / حامل", "")}</div>`, valid: () => !!OB.d.status, auto: 1}),
  dxinfo: () => isDiab() ? ({title: "من متى تشخيصك؟", body: `<div class="stack">${opt("dxYears", "<1", "clock", "أقل من سنة", "")}${opt("dxYears", "1-5", "clock", "من سنة إلى ٥ سنين", "")}${opt("dxYears", "5-10", "clock", "من ٥ إلى ١٠ سنين", "")}${opt("dxYears", "10+", "clock", "أكثر من ١٠ سنين", "")}</div>`, valid: () => !!OB.d.dxYears, auto: 1})
    : ({title: "تاريخ العائلة", sub: "السكري في الأب أو الأم أو الإخوان يرفع الخطر.", body: `<div class="stack">${opt("family", "yes", "family", "نعم، أحد أهلي عنده سكري", "")}${opt("family", "no", "x", "لا", "")}${opt("family", "dk", "search", "ما أدري", "")}</div>`, valid: () => !!OB.d.family, auto: 1}),
  meds: () => ({title: "أدوية السكر", sub: "اختر كل اللي تاخذه.", body: `<div class="stack">${opt("meds", "met", "pill", "ميتفورمين", "جلوكوفاج وغيره", 1)}${opt("meds", "glp", "pill", "GLP-1", "أوزمبك، مونجارو، ساكسندا", 1)}${opt("meds", "sglt", "pill", "SGLT2", "جارديانس، فورسيجا", 1)}${opt("meds", "acar", "pill", "أكاربوز", "جلوكوباي", 1)}${opt("meds", "su", "pill", "سلفونيل يوريا", "أماريل، دايمكرون", 1)}${opt("meds", "ins", "pill", "إنسولين", "أي نوع", 1)}</div>`, valid: () => true, cta: () => Object.values(OB.d.meds || {}).some(Boolean) ? "التالي" : "ما آخذ أدوية سكر"}),
  cond: () => ({title: "حالات تحتاج انتباه", sub: "لسلامتك.", body: `<div class="stack">${opt("cond", "preg", "heart", "حمل", "", 1)}${opt("cond", "ckd", "shield", "مرض كلى متقدم أو غسيل", "", 1)}${opt("cond", "hypo", "drop", "نوبات هبوط متكررة", "دوخة وتعرّق ورجفة", 1)}${opt("cond", "bp", "heart", "ضغط مرتفع", "", 1)}${opt("cond", "chol", "heart", "كوليسترول مرتفع", "", 1)}</div>`, valid: () => true, cta: () => Object.values(OB.d.cond || {}).some(Boolean) ? "التالي" : "ما عندي أي منها"}),
  labs: () => ({title: "آخر تحاليلك", sub: "كل ما كانت أدق، كان التوقع أدق من أول يوم.", body: `
    ${numField("a1c", "التراكمي الأخير (HbA1c)", "%", 3, 15, 0.1)}
    <div class="field"><span class="flabel">متى سويته؟</span><div class="chips wrap">${[["3", "آخر ٣ شهور"], ["6", "آخر ٦ شهور"], ["12", "آخر سنة"], ["13", "أقدم"]].map(([v, l]) => `<button class="chip" data-a1cw="${v}" aria-pressed="${OB.d.a1cWhen === v}">${l}</button>`).join("")}</div></div>
    ${numField("a1cPrev", "التراكمي اللي قبله (اختياري)", "%", 3, 15, 0.1, "نعرف منه هل سكرك طالع أو نازل")}<div id="trend">${trendHTML()}</div>
    ${numField("fbg", "السكر الصائم الأخير (اختياري)", "ملجم/دسل", 40, 400)}`, valid: () => true, cta: () => OB.d.a1c || OB.d.fbg ? "التالي" : "ما أعرفها، تخطَّ",
    bind: r => $$("[data-a1cw]", r).forEach(b => b.onclick = () => { OB.d.a1cWhen = b.dataset.a1cw; $$("[data-a1cw]", r).forEach(x => x.setAttribute("aria-pressed", x === b)); }),
    onNum: r => { $("#trend", r).innerHTML = trendHTML(); }}),
  life: () => ({title: "نشاطك اليومي", body: `<div class="stack">${opt("activity", "low", "sit", "قليل", "أغلب يومي جلوس")}${opt("activity", "mid", "walk", "متوسط", "مشي بعض الأيام")}${opt("activity", "high", "walk", "نشيط", "رياضة ٣ أيام أو أكثر بالأسبوع")}</div>
    ${isDiab() ? `<span class="flabel">أحد أهلك عنده سكري؟</span><div class="chips">${[["yes", "نعم"], ["no", "لا"], ["dk", "ما أدري"]].map(([v, l]) => `<button class="chip" data-fam="${v}" aria-pressed="${OB.d.family === v}">${l}</button>`).join("")}</div>` : ""}`, valid: () => !!OB.d.activity,
    bind: r => $$("[data-fam]", r).forEach(b => b.onclick = () => { OB.d.family = b.dataset.fam; $$("[data-fam]", r).forEach(x => x.setAttribute("aria-pressed", x === b)); })}),
  device: () => ({title: "وش تستخدم للقياس؟", sub: "التوقع يتحسن لما تقيس بعد الأكل.", body: `<div class="stack">${opt("device", "meter", "meter", "جهاز وخز", "أكيو تشيك، كونتور وغيرها")}${opt("device", "cgm", "sensor", "حساس مستمر", "فري ستايل ليبري أو غيره")}${opt("device", "none", "x", "ما عندي جهاز", "متوفر في الصيدليات بسعر بسيط")}</div>`, valid: () => !!OB.d.device, auto: 1}),
  plan: () => { const p = {...OB.d}, g = gateOf(p), [ok, calMsg] = calAllowed(p), b = bmi(p), risks = [];
    if (b >= 30) risks.push("السمنة"); else if (b >= 25) risks.push("زيادة الوزن"); if (p.waist && p.waist > (p.sex === "f" ? 88 : 102)) risks.push("محيط الخصر"); if (p.wtrend === "up") risks.push("الوزن زايد");
    if (p.a1cTrend === "up") risks.push("التراكمي طالع"); if (p.family === "yes") risks.push("تاريخ عائلي"); if (p.activity === "low") risks.push("قلة النشاط"); if (p.age >= 45) risks.push("العمر فوق ٤٥"); if ((p.cond || {}).bp) risks.push("ضغط");
    return {title: g.level === "stop" ? "وضع المعلومات" : "ملخص حالتك وخطتك", body: `
    <div class="card"><div class="kpis"><div class="kpi"><small>كتلة الجسم</small><b class="num" style="color:${b ? bmiCat(b)[1] : "inherit"}">${b ? r1(b) : "—"}</b></div><div class="kpi"><small>التراكمي</small><b class="num">${p.a1c ? p.a1c + "%" : "—"}</b></div><div class="kpi"><small>الاتجاه</small><b>${p.a1cTrend ? ic(p.a1cTrend) : "—"}</b></div></div>
      ${risks.length ? `<span class="small"><b>عوامل ترفع الخطر عندك:</b> ${risks.join("، ")}</span>` : `<span class="small">ما فيه عوامل خطر واضحة.</span>`}</div>
    ${g.msgs.length ? `<div class="note ${g.level === "stop" ? "bad" : ""}">${ic("shield")}<span>${g.msgs.map(esc).join("<br>")}</span></div>` : ""}
    ${g.level !== "stop" ? `<div class="stack">
      <div class="feat"><span class="oi">${ic("flask")}</span><span><b>١. اختبار المعايرة</b><br><span class="small muted">${ok ? "٥٠ جم جلوكوز صباحاً على الريق، وأربع قراءات خلال ساعتين." + (calMsg ? " " + calMsg : "") : esc(calMsg)}</span></span></div>
      <div class="feat"><span class="oi">${ic("camera")}</span><span><b>٢. سجّل ٧ وجبات</b><br><span class="small muted">وقِس بعدها بالوقت اللي نحدده لك</span></span></div>
      <div class="feat"><span class="oi">${ic("chart")}</span><span><b>٣. شوف رؤاك</b><br><span class="small muted">الأكلات اللي ترفع سكرك أنت</span></span></div></div>` : ""}
    <p class="xs muted">أداة مساعدة لنمط الحياة، وليست تشخيصاً ولا بديلاً عن الطبيب.</p>`, valid: () => true, cta: OB.edit ? "احفظ" : "ابدأ"}; }
};
function obValid() { const s = OBV[OB_STEPS[OB.i]](), b = $("#ob-next"); if (b) { b.disabled = !s.valid(); if (typeof s.cta === "function") b.textContent = s.cta(); } }
function renderOnboard() {
  const key = OB_STEPS[OB.i], s = OBV[key](), cta = typeof s.cta === "function" ? s.cta() : (s.cta || "التالي");
  $("#flow").innerHTML = `<div class="flowwrap">
    <div class="flowhead"><button class="iconbtn" id="ob-back" aria-label="رجوع">${ic(OB.i ? "back" : "x")}</button><div class="progress"><i style="width:${(OB.i + 1) / OB_STEPS.length * 100}%"></i></div><span class="steps-txt">${OB.i + 1} من ${OB_STEPS.length}</span></div>
    <div class="flowbody"><h2>${s.title}</h2>${s.sub ? `<p class="sub">${s.sub}</p>` : ""}${s.body}</div>
    <div class="flowfoot"><button class="btn primary block" id="ob-next">${cta}</button></div></div>`;
  const root = $("#flow");
  $$(".opt[data-k]", root).forEach(b => b.onclick = () => { const k = b.dataset.k, v = b.dataset.v;
    if (b.hasAttribute("data-multi")) { OB.d[k] = OB.d[k] || {}; OB.d[k][v] = !OB.d[k][v]; b.setAttribute("aria-pressed", OB.d[k][v]); }
    else { OB.d[k] = v; $$(`.opt[data-k="${k}"]`, root).forEach(x => x.setAttribute("aria-pressed", x === b)); if (s.auto) setTimeout(() => { if (OB_STEPS[OB.i] === key && OBV[key]().valid()) obNext(); }, 250); }
    obValid(); });
  $$("[data-num]", root).forEach(inp => inp.oninput = () => { const v = parseFloat(inp.value); OB.d[inp.dataset.num] = isFinite(v) ? v : null; s.onNum && s.onNum(root); obValid(); });
  s.bind && s.bind(root);
  $("#ob-back").onclick = () => { if (OB.i) { OB.i--; renderOnboard(); } else { OB.started = false; go(S.profile ? "me" : "start"); } };
  $("#ob-next").onclick = obNext; obValid();
}
async function obNext() {
  const s = OBV[OB_STEPS[OB.i]](); if (!s.valid()) return;
  if (OB.i < OB_STEPS.length - 1) { OB.i++; renderOnboard(); $("#flow").scrollTop = 0; return; }
  const p = {...OB.d, name: (OB.d.name || "").trim(), updated: Date.now()}, old = S.profile;
  if (old && old.weight !== p.weight) p.weightLog = [...(old.weightLog || []), {ts: Date.now(), w: p.weight}].slice(-50); else if (!old) p.weightLog = [{ts: Date.now(), w: p.weight}];
  await saveKV("profile", p);
  if (!S.model || !S.model.calibrated) await saveKV("model", priorModel(p));
  OB.started = false; toast(OB.edit ? "انحفظت بياناتك" : "أهلاً " + firstName(p.name)); go("today");
}

/* ================= MEAL FLOW =================
   photo → items & portions → sugar now → how you'll eat + today → result & plan → save */
const SC_STAGES = ["photo", "items", "sugar", "context", "result"], SC_TITLES = ["الصورة", "الأكل", "سكرك الحين", "طريقتك", "التوقع"];
function newScan() { S.scan = {stage: "photo", photo: null, b64: null, items: [], tray: false, share: 1, ctx: {order: "mixed", walk: "0", time: autoTime(), state: {}}, pre: null, q: "", cat: "all", aiNote: "", err: "", on: null, view: "plan"}; }
function foodItem(F, grams, extra = {}) { return {key: F.id, name: F.ar, data: F, grams, ...extra}; }
const eff = sc => sc.items.map(it => ({g: it.grams * (sc.tray ? sc.share : 1), data: it.data, it}));
function aiReady() { const s = S.settings; return (s.provider === "gemini" && !!s.key) || (s.provider === "worker" && !!s.endpoint); }
function renderScan() {
  if (!S.scan) newScan();
  const sc = S.scan, gate = gateOf(S.profile || {}), idx = SC_STAGES.indexOf(sc.stage === "analyzing" ? "photo" : sc.stage);
  const head = `<div class="flowhead"><button class="iconbtn" id="sc-back" aria-label="${idx === 0 ? "إغلاق" : "رجوع"}">${ic(idx === 0 ? "x" : "back")}</button><div class="progress"><i style="width:${(idx + 1) / SC_STAGES.length * 100}%"></i></div><span class="steps-txt">${SC_TITLES[idx]}</span></div>`;
  let body = "", foot = "";
  if (sc.stage === "photo" || sc.stage === "analyzing") {
    const busy = sc.stage === "analyzing";
    body = `<h2>${busy ? "نحلل صحنك…" : "صوّر صحنك"}</h2><p class="sub">${busy ? "نتعرّف على الأكل ونقدّر الكميات." : "من فوق، والصحن كامل داخل الصورة."}</p>
      <div class="camzone">${sc.photo ? `<img src="${sc.photo}" alt="صورة الوجبة">${busy ? `<div class="scanline"></div>` : `<div class="shade"><button class="btn sm" id="sc-retake">${ic("camera")} صورة ثانية</button></div>`}` :
        `<button class="btn primary" id="sc-cam" style="min-height:64px">${ic("camera")} التقط صورة</button><button class="btn ghost sm" id="sc-gal">${ic("image")} اختر من الصور</button>`}</div>
      <input type="file" id="sc-f1" accept="image/*" capture="environment" hidden><input type="file" id="sc-f2" accept="image/*" hidden>
      ${sc.err ? `<div class="note bad">${ic("x")}<span>${esc(sc.err)}</span></div>` : ""}
      ${!aiReady() && !busy && sc.photo ? `<div class="note info">${ic("spark")}<span>الصورة بتنحفظ مع الوجبة. الخطوة الجاية تختار الأكل اللي فيها.</span></div>` : ""}`;
    foot = busy ? `<button class="btn block" id="sc-skip">أوقف وأختار بنفسي</button>` : `${sc.photo ? `<button class="btn primary block" id="sc-go">${aiReady() ? ic("spark") + " حلّل الصورة" : "التالي"}</button>` : ""}<button class="btn ghost block" id="sc-nophoto">بدون صورة</button>`;
  } else if (sc.stage === "items") {
    body = `<h2>وش في صحنك؟</h2><p class="sub">اختر الأكل، وحدد كم أكلت منه.</p>
      ${sc.aiNote ? `<div class="note ok">${ic("spark")}<span>${esc(sc.aiNote)}</span></div>` : ""}
      <div class="stack">${sc.items.map((it, i) => itemCard(it, i)).join("")}</div>
      ${sc.items.length ? `<button class="check" id="sc-tray" aria-pressed="${sc.tray}"><span class="box">${ic("check")}</span><span><b>الأكل في صينية مشتركة</b><br><span class="small muted">نحسب نصيبك أنت</span></span></button>
      ${sc.tray ? `<div class="chips wrap">${[[0.25, "ربع الصينية"], [0.33, "ثلث"], [0.5, "نص"], [1, "كلها لي"]].map(([v, l]) => `<button class="chip" data-share="${v}" aria-pressed="${sc.share === v}">${l}</button>`).join("")}</div>` : ""}` : ""}
      <h3 style="margin-top:6px">${sc.items.length ? "أضف صنف ثاني" : "ابحث عن الأكل"}</h3>
      <label class="searchbox">${ic("search")}<input id="sc-q" type="search" placeholder="رز، مطبق، تمر…" value="${esc(sc.q)}" aria-label="ابحث عن صنف"></label>
      <div class="chips">${CATS.map(([k, l]) => `<button class="chip" data-cat="${k}" aria-pressed="${sc.cat === k}">${l}</button>`).join("")}</div>
      <div class="results" id="sc-res"></div>`;
    foot = `<button class="btn primary block" id="sc-next" ${sc.items.some(i => i.grams > 0) ? "" : "disabled"}>التالي${sc.items.length ? ` (${sc.items.length} ${sc.items.length > 2 ? "أصناف" : "صنف"})` : ""}</button>`;
  } else if (sc.stage === "sugar") {
    body = `<h2>كم سكرك الحين؟</h2><p class="sub">قِس قبل ما تبدأ تاكل. هذا يخلي التوقع أدق بكثير.</p>
      <div class="field"><label for="sc-pre">القراءة (ملجم/دسل)</label><input id="sc-pre" class="input bignum" type="number" inputmode="numeric" min="30" max="500" placeholder="000" value="${sc.pre ?? ""}"></div>
      <div id="pre-msg"></div>
      <p class="small muted">${S.profile && S.profile.device === "none" ? "ما عندك جهاز؟ نستخدم سكرك الصائم المعتاد." : `إذا ما قست، نستخدم سكرك المعتاد (${r0(curModel().g0)}).`}</p>`;
    foot = `<button class="btn primary block" id="sc-next">التالي</button><button class="btn ghost block" id="sc-nopre">ما قست الحين</button>`;
  } else if (sc.stage === "context") {
    const c = sc.ctx, b = (k, v, icon, l) => `<button data-c="${k}" data-v="${v}" aria-pressed="${c[k] === v}">${ic(icon)}${l}</button>`;
    body = `<h2>كيف بتاكل؟</h2><p class="sub">نفس الوجبة يتغير أثرها حسب طريقتك ويومك.</p>
      <h3>وش بتبدأ فيه؟</h3><div class="ctxopt">${b("order", "carb", "bowl", "الرز أو الخبز أول")}${b("order", "mixed", "swap", "كله مع بعض")}${b("order", "veg", "leaf", "السلطة واللحم أول")}</div>
      <h3>بعد الأكل؟</h3><div class="ctxopt">${b("walk", "0", "sit", "بجلس")}${b("walk", "10", "walk", "بمشي ١٠ د")}${b("walk", "20", "walk", "بمشي ٢٠ د")}</div>
      <h3>وقت الوجبة</h3><div class="chips wrap">${[["morning", "فطور"], ["noon", "غداء"], ["evening", "عشاء"], ["iftar", "إفطار صائم"]].map(([v, l]) => `<button class="chip" data-t="${v}" aria-pressed="${c.time === v}">${l}</button>`).join("")}</div>
      <h3>حالتك اليوم</h3><div class="stack">${[["water", "شربت ماء كافي اليوم", "٦ أكواب أو أكثر"], ["prev", "أكلت شي قبل أقل من ٣ ساعات", "وجبة أو حلا أو عصير"], ["sleep", "نومي أمس ناقص", "أقل من ٦ ساعات"], ["stress", "مريض أو متوتر اليوم", "الزكام والتوتر يرفعون السكر"], ["ex", "تمرنت اليوم", "مشي ٣٠ دقيقة أو أكثر"]].map(([k, t, d]) => `<button class="check" data-s="${k}" aria-pressed="${!!c.state[k]}"><span class="box">${ic("check")}</span><span><b>${t}</b><br><span class="small muted">${d}</span></span></button>`).join("")}</div>`;
    foot = `<button class="btn primary block" id="sc-next">${ic("spark")} شوف التوقع</button>`;
  } else if (sc.stage === "result") {
    const R = scanResult(); sc.R = R;
    if (R.stop) { body = `<h2>التوقعات متوقفة</h2><div class="note bad">${ic("shield")}<span>${esc(gate.msgs[0])}</span></div><div class="kpis"><div class="kpi"><small>نشويات</small><b class="num">${r0(R.T.c)} جم</b></div><div class="kpi"><small>سعرات</small><b class="num">${r0(R.T.kcal)}</b></div><div class="kpi"><small>بروتين</small><b class="num">${r0(R.T.p)} جم</b></div></div>`; foot = `<button class="btn block" id="sc-done">إغلاق</button>`; }
    else if (R.hypo) { body = `<h2>عالج الهبوط أولاً</h2><div class="note bad">${ic("drop")}<span>قراءتك أقل من ٧٠. خذ ١٥ جم سكر سريع وأعد القياس بعد ١٥ دقيقة.</span></div>`; foot = `<button class="btn block" id="sc-backpre">رجوع</button>`; }
    else {
      const p = R.pred, w = R.withPlan, show = sc.view === "plan" && w ? w : p;
      body = `<div class="verdict gs-${p.grade}"><span class="grade lg g-${p.grade}">${p.grade}</span><div><span class="small muted">تقييم الوجبة كما هي</span><h2>${GRADE_TXT[p.grade]}</h2><span>السكر المتوقع يوصل <b class="num">${r0(p.peak)}</b> بعد ${minsTxt(r0(p.tp))}</span></div></div>
        ${!curModel().calibrated ? `<div class="note">${ic("flask")}<span>التوقع الآن تقدير أولي. بعد اختبار المعايرة يصير على مقاس جسمك.</span></div>` : ""}
        ${R.tips.length ? `<div class="card"><h3>خطة الوجبة: سوِّ هذي الخطوات</h3><p class="small muted">علّم على اللي بتطبقه، ونحسب لك أثره.</p>
          ${["before", "during", "after"].map(when => { const ts = R.tips.filter(t => t.when === when); return ts.length ? `<div class="when">${ic(when === "before" ? "clock" : when === "during" ? "bowl" : "walk")} ${{before: "قبل الأكل", during: "أثناء الأكل", after: "بعد الأكل"}[when]}</div>${ts.map(t => `<button class="tip" data-tip="${t.id}" aria-pressed="${sc.on.has(t.id)}"><span class="n">${sc.on.has(t.id) ? ic("check") : t.n}</span><span><b>${esc(t.label)}</b><br><span class="small muted">${esc(t.detail)}</span></span>${t.gain >= 1 ? `<span class="gain"><span class="ltr">−${r0(t.gain)}</span></span>` : "<span></span>"}</button>`).join("")}` : ""; }).join("")}
          <div class="beforeafter" style="margin-top:6px"><div class="box gs-${p.grade}"><small>بدون الخطة</small><b class="num">${r0(p.peak)}</b><small>${p.grade}</small></div><b>${ic("next")}</b><div class="box gs-${(w || p).grade}"><small>مع اللي اخترته</small><b class="num">${r0((w || p).peak)}</b><small>${(w || p).grade}</small></div></div></div>` : `<div class="note ok">${ic("check")}<span>وجبتك ممتازة كما هي. كُلها بنفس الطريقة.</span></div>`}
        <div class="card"><div class="row between"><h3>منحنى السكر المتوقع</h3>${w ? `<div class="chips" role="group" aria-label="أي منحنى">${[["plan", "مع خطتك"], ["raw", "بدون"]].map(([v, l]) => `<button class="chip" data-view="${v}" aria-pressed="${sc.view === v}" style="min-height:38px;padding:0 12px">${l}</button>`).join("")}</div>` : ""}</div>
          <div class="chart">${curveSVG([{pts: show.curve, color: show === p ? "var(--gD)" : "var(--brand2)", band: show.cv, g0: show.g0, peak: [show.tp, show.peak]}])}</div>
          <p class="small muted">الخط = سكرك المتوقع من وقت الأكل إلى ٤ ساعات. الرقم فوق = أعلى نقطة. المنطقة الصفراء فوق ١٤٠ والحمراء فوق ١٨٠.</p>
          <div class="kpis"><div class="kpi"><small>نشويات</small><b class="num">${r0(p.T.c)} جم</b></div><div class="kpi"><small>بعد ساعتين</small><b class="num">${r0(valAt(show.curve, 120))}</b></div><div class="kpi"><small>سعرات</small><b class="num">${r0(p.T.kcal)}</b></div></div></div>
        ${R.careful ? `<div class="note">${ic("shield")}<span>ما نقترح تقليل النشويات مع أدويتك بدون الطبيب.${sc.ctx.walk !== "0" ? " وخلّ معك تمر أو عصير صغير إذا مشيت." : ""}</span></div>` : ""}`;
      foot = `<button class="btn primary block" id="sc-save">${ic("check")} ${sc.editId ? "احفظ التعديلات" : "احفظ الوجبة"}</button>`;
    }
  }
  $("#flow").innerHTML = `<div class="flowwrap">${head}<div class="flowbody">${body}</div><div class="flowfoot">${foot}</div></div>`;
  bindScan();
}
function itemCard(it, i) {
  const F = it.data, u = F.unit, g = it.grams, frac = g / u[1], gl = Math.max(0, F.c - F.f) * g * (S.scan.tray ? S.scan.share : 1) / 100 * F.gi / 100, lv = gl < 8 ? "A" : gl < 20 ? "C" : "E";
  return `<div class="item"><div class="head">${ftile(F)}<span style="min-width:0"><b>${esc(it.name)}</b><br><span class="small"><i class="dot g-${lv}"></i> ${lv === "A" ? "خفيف" : lv === "C" ? "متوسط" : "ثقيل"} على السكر${it.conf != null ? ` · <span class="${it.conf >= 0.7 ? "gt-A" : "gt-D"}">ثقة ${r0(it.conf * 100)}٪</span>` : ""}</span></span>
    <button class="iconbtn" style="width:44px;height:44px" data-rm="${i}" aria-label="احذف ${esc(it.name)}">${ic("trash")}</button></div>
    <span class="small muted">كم ${esc(u[0])}؟ (الواحد ${r0(u[1])} جم)</span>
    <div class="portion" role="group">${[[0.5, "نص"], [1, "١"], [1.5, "١ ونص"], [2, "٢"], [3, "٣"]].map(([f, l]) => `<button data-po="${i}" data-f="${f}" aria-pressed="${Math.abs(frac - f) < 0.01}">${l}</button>`).join("")}</div>
    <div class="row between"><span class="small muted">أو بالجرام</span><div class="stepper"><button data-st="${i}" data-d="-1" aria-label="أنقص">${ic("minus")}</button><output class="num">${r0(g)} جم</output><button data-st="${i}" data-d="1" aria-label="زِد">${ic("plus")}</button></div></div></div>`;
}
function buildTips(items, ctx, careful) {
  const T = [], st = ctx.state || {};
  if (!st.water) T.push({id: "water", when: "before", label: "اشرب كوب ماء قبل الأكل بربع ساعة", detail: "يساعدك تشبع أسرع وتاكل أقل من الرز والخبز."});
  for (const x of items) { const sw = SWAPS[x.it.key]; if (!sw || x.g <= 0) continue; const [to, k, label] = sw;
    T.push({id: "swap-" + x.it.key, when: "before", label: "بدّل: " + label, detail: `${FOODS[to].ar} بدل ${x.it.name}.`, map: y => y.it === x.it ? {g: y.g * k, data: FOODS[to], it: foodItem(FOODS[to], y.it.grams * k)} : y, swapFor: x.it, to, k}); }
  if (!careful && items.some(x => x.data.c - x.data.f > 10 && !x.data.liquid && x.data.gi > 0)) T.push({id: "less", when: "before", label: "خذ ثلاثة أرباع كمية الرز أو الخبز", detail: "وزوّد السلطة أو اللحم بدالها.", map: y => (y.data.c - y.data.f > 10 && !y.data.liquid && y.data.gi > 0) ? {...y, g: y.g * 0.75} : y});
  if (ctx.order !== "veg") T.push({id: "order", when: "during", label: "ابدأ بالسلطة واللحم، والرز آخر شي", detail: "كُل الخضار والبروتين أول ١٠ دقائق.", ctx: {order: "veg"}});
  if (ctx.walk === "0") T.push({id: "walk", when: "after", label: "امشِ ١٠ دقائق بعد الأكل", detail: "خلال ربع ساعة من آخر لقمة. داخل البيت أو للمسجد يكفي.", ctx: {walk: "10"}});
  return T;
}
function applyTips(items, ctx, tips) { let c = {...ctx}, its = items; for (const t of tips) { if (t.ctx) c = {...c, ...t.ctx}; if (t.map) its = its.map(t.map); } return [its, c]; }
function scanResult() {
  const sc = S.scan, prof = S.profile || EXAMPLE, model = curModel(), items = eff(sc);
  if (gateOf(prof).level === "stop") return {stop: true, T: totals(items)};
  if (sc.pre != null && sc.pre < 70) return {hypo: true};
  const careful = !!(prof.meds && (prof.meds.ins || prof.meds.su)), pred = predict(items, sc.ctx, model, prof, sc.pre);
  let tips = buildTips(items, sc.ctx, careful).map(t => { if (!t.ctx && !t.map) return {...t, gain: 0}; const [its, c] = applyTips(items, sc.ctx, [t]); return {...t, gain: pred.peak - predict(its, c, model, prof, sc.pre).peak}; })
    .filter(t => t.id === "water" || t.gain >= 2);
  const ord = {before: 0, during: 1, after: 2}; tips.sort((a, b) => ord[a.when] - ord[b.when] || b.gain - a.gain); tips.forEach((t, i) => t.n = i + 1);
  if (!sc.on) sc.on = new Set(tips.filter(t => t.id !== "less" && !t.id.startsWith("swap-")).map(t => t.id));
  const chosen = tips.filter(t => sc.on.has(t.id) && (t.ctx || t.map)), [wI, wC] = applyTips(items, sc.ctx, chosen);
  const withPlan = chosen.length ? predict(wI, wC, model, prof, sc.pre) : null;
  const final = withPlan || pred, measureAt = final.tp <= 60 ? 60 : final.tp <= 95 ? 90 : 120;
  return {pred, withPlan, tips, chosen, measureAt, careful, model};
}
function bindScan() {
  const sc = S.scan, R = $("#flow");
  $("#sc-back", R).onclick = () => { const i = SC_STAGES.indexOf(sc.stage === "analyzing" ? "photo" : sc.stage);
    if (i <= 0 || (sc.editId && sc.stage === "items")) { abortAI(); const ed = sc.editId; S.scan = null; go(ed ? "log" : "today"); } else { sc.stage = SC_STAGES[i - 1]; renderScan(); } };
  const f1 = $("#sc-f1", R), f2 = $("#sc-f2", R);
  if (f1) { const onFile = async e => { const f = e.target.files[0]; if (!f) return; try { const {thumb, b64} = await processImage(f); sc.photo = thumb; sc.b64 = b64; sc.photo_path = null; sc.err = ""; } catch (er) { sc.err = "ما قدرنا نقرأ الصورة. جرّب صورة ثانية."; } renderScan(); };
    f1.onchange = onFile; f2.onchange = onFile; $("#sc-cam", R) && ($("#sc-cam", R).onclick = () => f1.click()); $("#sc-gal", R) && ($("#sc-gal", R).onclick = () => f2.click()); $("#sc-retake", R) && ($("#sc-retake", R).onclick = () => f1.click()); }
  $("#sc-nophoto", R) && ($("#sc-nophoto", R).onclick = () => { sc.stage = "items"; renderScan(); });
  $("#sc-go", R) && ($("#sc-go", R).onclick = () => { if (aiReady()) runAI(); else { sc.stage = "items"; renderScan(); } });
  $("#sc-skip", R) && ($("#sc-skip", R).onclick = () => { abortAI(); sc.stage = "items"; renderScan(); });
  if (sc.stage === "items") {
    const drawRes = async () => { const q = sc.q.trim(); let list = searchFoods(q, sc.cat, 30), extra = [];
      if (q.length > 1 && list.length < 5 && /[a-z]/i.test(q)) { await loadUSDA(); extra = searchUSDA(q, 15); }
      if (!$("#sc-res", R)) return;
      $("#sc-res", R).innerHTML = [...list, ...extra].map(f => `<button class="res" data-add="${esc(f.id)}">${ftile(f)}<span style="min-width:0"><b>${esc(f.ar)}</b><br><span class="xs muted">${esc(f.unit[0])} · ${r0(f.unit[1])} جم</span></span><span class="add">${ic("plus")}</span></button>`).join("") || `<p class="muted" style="padding:8px">ما لقينا "${esc(q)}". جرّب كلمة ثانية، أو اكتب بالإنجليزي للبحث الموسّع.</p>`;
      const pool = [...list, ...extra];
      $$("[data-add]", R).forEach(b => b.onclick = () => { const F = pool.find(x => x.id === b.dataset.add); sc.items.push(foodItem(F, F.unit[1])); sc.q = ""; renderScan(); toast("انضاف " + F.ar);
        setTimeout(() => { const el = $$(".item", $("#flow")).pop(); el && el.scrollIntoView({block: "center", behavior: "smooth"}); }, 40); }); };
    drawRes();
    $("#sc-q", R).oninput = e => { sc.q = e.target.value; drawRes(); };
    $$("[data-cat]", R).forEach(b => b.onclick = () => { sc.cat = b.dataset.cat; $$("[data-cat]", R).forEach(x => x.setAttribute("aria-pressed", x === b)); drawRes(); });
    $$("[data-rm]", R).forEach(b => b.onclick = () => { sc.items.splice(+b.dataset.rm, 1); renderScan(); });
    $$("[data-st]", R).forEach(b => b.onclick = () => { const it = sc.items[+b.dataset.st], step = Math.max(10, r0(it.data.unit[1] / 4)); it.grams = Math.max(0, it.grams + step * +b.dataset.d); renderScan(); });
    $$("[data-po]", R).forEach(b => b.onclick = () => { const it = sc.items[+b.dataset.po]; it.grams = it.data.unit[1] * +b.dataset.f; renderScan(); });
    $("#sc-tray", R) && ($("#sc-tray", R).onclick = () => { sc.tray = !sc.tray; if (sc.tray && sc.share === 1) sc.share = 0.33; renderScan(); });
    $$("[data-share]", R).forEach(b => b.onclick = () => { sc.share = +b.dataset.share; renderScan(); });
  }
  if (sc.stage === "sugar") {
    const inp = $("#sc-pre", R); setTimeout(() => inp.focus(), 60);
    const check = () => { const v = parseFloat(inp.value); sc.pre = isFinite(v) && v >= 30 && v <= 500 ? v : null; $("#pre-msg", R).innerHTML = sc.pre && sc.pre < 70 ? `<div class="note bad">${ic("drop")}<span>أقل من ٧٠: هبوط. عالجه قبل الأكل بـ١٥ جم سكر سريع.</span></div>` : sc.pre >= 250 ? `<div class="note bad">${ic("shield")}<span>قراءة عالية. إذا تكررت راجع طبيبك.</span></div>` : ""; };
    inp.oninput = check; check();
    $("#sc-nopre", R).onclick = () => { sc.pre = null; sc.on = null; sc.stage = "context"; renderScan(); };
  }
  if (sc.stage === "context") {
    $$("[data-c]", R).forEach(b => b.onclick = () => { sc.ctx[b.dataset.c] = b.dataset.v; $$(`[data-c="${b.dataset.c}"]`, R).forEach(x => x.setAttribute("aria-pressed", x === b)); });
    $$("[data-t]", R).forEach(b => b.onclick = () => { sc.ctx.time = b.dataset.t; $$("[data-t]", R).forEach(x => x.setAttribute("aria-pressed", x === b)); });
    $$("[data-s]", R).forEach(b => b.onclick = () => { const k = b.dataset.s; sc.ctx.state[k] = !sc.ctx.state[k]; b.setAttribute("aria-pressed", sc.ctx.state[k]); });
  }
  $("#sc-next", R) && ($("#sc-next", R).onclick = () => { const i = SC_STAGES.indexOf(sc.stage); if (sc.stage === "context" || sc.stage === "sugar") sc.on = null; sc.stage = SC_STAGES[i + 1]; renderScan(); });
  $("#sc-backpre", R) && ($("#sc-backpre", R).onclick = () => { sc.stage = "sugar"; renderScan(); });
  $("#sc-done", R) && ($("#sc-done", R).onclick = () => { S.scan = null; go("today"); });
  $$("[data-tip]", R).forEach(b => b.onclick = () => { const id = b.dataset.tip; sc.on.has(id) ? sc.on.delete(id) : sc.on.add(id); sc.view = "plan"; const y = $("#flow").scrollTop; renderScan(); $("#flow").scrollTop = y; });
  $$("[data-view]", R).forEach(b => b.onclick = () => { sc.view = b.dataset.view; const y = $("#flow").scrollTop; renderScan(); $("#flow").scrollTop = y; });
  $("#sc-save", R) && ($("#sc-save", R).onclick = saveMeal);
}
async function saveMeal() {
  const sc = S.scan, Rz = sc.R, editing = sc.editId ? S.meals.find(x => x.id === sc.editId) : null;
  const pack = p => p && {peak: r0(p.peak), tp: r0(p.tp), g0: r0(p.g0), rise: r1(p.rise), grade: p.grade, curve: p.curve.filter(x => x[0] % 10 === 0).map(x => [x[0], r0(x[1])])};
  const items = eff(sc).map(x => ({key: x.it.key, name: x.it.name, grams: r0(x.g), ...(FOODS[x.it.key] ? {} : {data: x.it.data})}));
  const m = {id: editing ? editing.id : uid("m"), ts: editing ? editing.ts : Date.now(), photo: sc.photo, photo_path: sc.photo_path || null, items, ctx: JSON.parse(JSON.stringify(sc.ctx)), pre: sc.pre,
    pred: pack(Rz.pred), combo: pack(Rz.withPlan), grade: Rz.pred.grade, advice: Rz.tips.filter(t => sc.on.has(t.id)).map(t => t.label), tipsOn: [...sc.on], measureAt: Rz.measureAt, sAtPredict: Rz.model.s, title: ""};
  if (editing) { S.meals[S.meals.indexOf(editing)] = m; await putMeal(m);
    for (const r of S.readings.filter(r => r.mealId === m.id)) { const P = r.followed === "yes" && m.combo ? m.combo : m.pred; r.expected = r0(valAt(P.curve, r.minutes)); await putReading(r); }
    S.scan = null; go("log"); setTimeout(() => openMealSheet(m), 80); toast("انحفظت التعديلات"); return; }
  S.meals.unshift(m); await putMeal(m);
  if (sc.pre != null) { const r = {id: uid("r"), ts: m.ts, v: sc.pre, kind: "pre"}; S.readings.unshift(r); await putReading(r); }
  S.scan = null; scheduleNotif(m); go("today");
  openSheet(`<div class="empty"><div class="art" style="background:var(--gA-s);color:var(--gA)">${ic("check")}</div><h2 style="font-size:1.4rem">انحفظت الوجبة</h2>
    <p style="font-size:1.08rem">قِس سكرك بعد <b>${minsTxt(m.measureAt)}</b> من أول لقمة<br>الساعة <b class="num">${fmtTime(m.ts + m.measureAt * 60000)}</b></p><p class="muted">بعدها نوريك الفرق بين قراءتك والتوقع.</p></div>
    ${"Notification" in window && Notification.permission !== "granted" ? `<button class="btn saffron block" data-a="n">${ic("bell")} ذكّرني بالموعد</button>` : ""}
    <button class="btn primary block" data-close>تمام</button>`, (sh, close) => { const n = $("[data-a=n]", sh); if (n) n.onclick = async () => { const r = await Notification.requestPermission(); if (r === "granted") { scheduleNotif(m); toast("بنذكّرك (والتطبيق مفتوح)"); } close(); }; });
}
const notifTimers = {};
function scheduleNotif(m) { if (!("Notification" in window) || Notification.permission !== "granted") return; const ms = m.ts + m.measureAt * 60000 - Date.now(); if (ms <= 0 || ms > 4 * 3600e3) return;
  clearTimeout(notifTimers[m.id]); notifTimers[m.id] = setTimeout(async () => { const body = `حان وقت قياس سكرك بعد ${mealName(m)}`;
    try { const reg = await navigator.serviceWorker?.getRegistration(); reg ? reg.showNotification("Preventive Glucose AI", {body, icon: "icon.svg", tag: m.id}) : new Notification("Preventive Glucose AI", {body}); } catch (e) {} if (!location.hash || location.hash === "#today") route(); }, ms); }

/* ================= image + AI ================= */
function loadImg(file) { return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = URL.createObjectURL(file); }); }
function draw(img, max, q) { const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas"); c.width = r0(img.naturalWidth * k); c.height = r0(img.naturalHeight * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", q); }
async function processImage(file) { const img = await loadImg(file); return {thumb: draw(img, 720, 0.75), b64: draw(img, 1024, 0.82).split(",")[1]}; }
const AI_PROMPT = () => `You are a clinical dietitian specialised in Saudi and Gulf cuisine. Identify the foods in this meal photo and estimate the amounts.
Known foods (use these exact keys when an item matches):
${Object.values(FOODS).map(f => `${f.id} = ${f.ar}`).join("\n")}
Rules:
- Estimate grams realistically: dinner plate ~26 cm, Saudi tray (صينية) ~60 cm, tea glass 100 ml, cup 240 ml, one date ~10 g, khubz ~90 g.
- If food is on one large shared tray for several people, set "shared": true and give grams for the WHOLE tray.
- Rice cooked with meat/chicken and spices maps to the kabsa/mandi/bukhari keys, not plain rice.
- No matching key: key "other", give name_ar, name_en and per-100g values (carb_per100, fiber_per100, protein_per100, fat_per100, kcal_per100) and glycemic index gi.
- confidence 0-1 covers identity and amount. Not food: empty items.
Reply with ONLY JSON:
{"summary_ar":"وصف قصير بالعربي","shared":false,"items":[{"key":"kabsa_chicken","name_ar":"كبسة دجاج","grams":350,"confidence":0.8}],"notes_ar":""}`;
let aiCtl = null;
function abortAI() { if (aiCtl) { aiCtl.abort(); aiCtl = null; } }
function parseJSON(t) { try { return JSON.parse(t); } catch (e) { const m = String(t).match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); throw new Error("json"); } }
async function aiCall(st, parts, signal) {
  if (st.provider === "gemini") { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(st.model || "gemini-3.8-flash")}:generateContent`, {method: "POST", signal, headers: {"content-type": "application/json", "x-goog-api-key": st.key}, body: JSON.stringify({contents: [{parts}], generationConfig: {responseMimeType: "application/json", temperature: 0.2}})});
    if (!r.ok) throw new Error("http" + r.status); const d = await r.json(); return (d.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join(""); }
  if (st.provider === "worker") { const img = parts.find(p => p.inline_data); const r = await fetch(st.endpoint, {method: "POST", signal, headers: {"content-type": "application/json"}, body: JSON.stringify({image: img ? img.inline_data.data : "", mediaType: "image/jpeg", foods: Object.fromEntries(Object.values(FOODS).map(f => [f.id, f.ar])), ping: !img})});
    if (!r.ok) throw new Error("http" + r.status); return await r.text(); }
  throw new Error("noai");
}
async function aiPing(st) { if (st.provider === "none") throw new Error("noai"); if (st.provider === "gemini" && !st.key) throw new Error("nokey"); const t = await aiCall(st, [{text: 'Reply with only this JSON: {"ok":true}'}]); if (st.provider === "gemini") parseJSON(t); }
function aiErrText(e) { const m = String(e && e.message || e); return m === "nokey" ? "أدخل المفتاح" : m === "noai" ? "اختر طريقة تحليل" : m === "http400" ? "المفتاح أو الموديل غير صحيح" : m === "http403" ? "المفتاح مرفوض" : m === "http404" ? "اسم الموديل غير موجود" : m === "http429" ? "وصلت الحد المجاني، جرّب بعد شوي" : m.startsWith("http") ? "خطأ " + m.slice(4) : "تأكد من الاتصال"; }
async function runAI() {
  const sc = S.scan; sc.stage = "analyzing"; sc.err = ""; renderScan(); aiCtl = new AbortController();
  try { const out = parseJSON(await aiCall(S.settings, [{inline_data: {mime_type: "image/jpeg", data: sc.b64}}, {text: AI_PROMPT()}], aiCtl.signal));
    const items = (Array.isArray(out.items) ? out.items : []).map(x => { const g = Math.max(0, Number(x.grams) || 0), conf = clamp(Number(x.confidence) || 0.5, 0, 1);
      if (FOODS[x.key]) return foodItem(FOODS[x.key], g, {conf});
      const name = String(x.name_ar || x.name_en || "صنف").slice(0, 60), c = +x.carb_per100 || 0, f = +x.fiber_per100 || 0, p = +x.protein_per100 || 0, fat = +x.fat_per100 || 0;
      const d = {id: "ai", ar: name, en: String(x.name_en || ""), cat: "other", kcal: +x.kcal_per100 || (c * 4 + p * 4 + fat * 9), c, f, p, fat, gi: clamp(+x.gi || 60, 0, 100), src: "AI", unit: ["حصة", Math.max(20, r0(g / 2) || 50)], liquid: !!x.liquid};
      return {key: "ai", name, data: d, grams: g, conf}; }).filter(i => i.grams > 0);
    if (S.scan !== sc) return;
    sc.stage = "items";
    if (!items.length) { sc.aiNote = ""; toast("ما تعرّفنا على أكل واضح. اختر الأصناف بنفسك."); renderScan(); return; }
    sc.items = items; sc.tray = !!out.shared; sc.share = out.shared ? 0.33 : 1;
    sc.aiNote = [out.summary_ar, out.notes_ar].filter(Boolean).map(String).join(". ") + " راجع الكميات وعدّلها."; renderScan();
  } catch (e) { if (S.scan !== sc || e.name === "AbortError") return; sc.stage = "photo"; sc.err = "تعذّر التحليل: " + aiErrText(e) + ". تقدر تختار الأكل بنفسك."; renderScan(); }
  finally { aiCtl = null; }
}

/* ================= CALIBRATION ================= */
const TPS = [30, 60, 90, 120];
function nextDue(run) { if (!run || !run.start) return null; for (const t of TPS) if (run.R[t] == null) return {t, left: run.start + t * 60000 - Date.now()}; return null; }
const fmtLeft = ms => { const s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, "0")}`; };
async function saveRun() { S.calibRun && await Store.set("calibRun", S.calibRun); }
function renderCalib() {
  const p = S.profile, [ok, msg] = calAllowed(p);
  if (!S.calibRun || (S.calibRun.stage === "done" && S.calibRun.closed)) S.calibRun = {stage: "prep", checks: [], dose: 50, start: null, R: {}};
  const run = S.calibRun; if (p && p.status === "t2") run.dose = 50;
  let body = "", foot = "", step = {prep: 1, fasting: 2, run: 3, done: 4}[run.stage];
  if (!ok) { body = `<h2>اختبار المعايرة</h2><div class="note bad">${ic("shield")}<span><b>الاختبار غير مناسب لك</b><br>${esc(msg)}</span></div><p class="muted">التطبيق يشتغل بالتقدير الأولي، ويتعلم من قراءاتك بعد كل وجبة.</p>`; foot = `<button class="btn primary block" id="cb-close">رجوع</button>`; }
  else if (run.stage === "prep") {
    const CH = [["fast", "صائم من ٨ إلى ١٢ ساعة", "ماء فقط"], ["glu", `عندي ${run.dose} جم جلوكوز (دكستروز)`, "من الصيدلية. سكر الطاولة ما يصلح"], ["meter", "جهاز القياس جاهز", "شرائط وإبر لخمس قراءات"], ["well", "مو مريض وما تمرنت اليوم", "وبجلس ساعتين بدون مجهود"]];
    body = `<h2>اختبار المعايرة</h2><p class="sub">ساعتين صباحاً تكشف كيف يتعامل جسمك مع السكر.</p>${msg ? `<div class="note">${ic("shield")}<span>${esc(msg)}</span></div>` : ""}
      <span class="flabel">الجرعة</span><div class="chips">${[50, 75].map(d => `<button class="chip" data-dose="${d}" aria-pressed="${run.dose === d}" ${p.status === "t2" && d === 75 ? "disabled" : ""}>${d} جم${d === 50 ? " (المعتمد)" : ""}</button>`).join("")}</div>
      <span class="flabel">علّم على كل شي جاهز</span><div class="stack">${CH.map(([k, t, d]) => `<button class="check" data-ch="${k}" aria-pressed="${run.checks.includes(k)}"><span class="box">${ic("check")}</span><span><b>${t}</b><br><span class="small muted">${d}</span></span></button>`).join("")}</div>
      <div class="note bad">${ic("shield")}<span>أوقف الاختبار إذا حسيت بدوخة شديدة أو تعرّق أو رجفة، أو وصلت قراءة ٢٥٠.</span></div>`;
    foot = `<button class="btn primary block" id="cb-next" ${run.checks.length === CH.length ? "" : "disabled"}>جاهز، قِس الصيام</button>`;
  } else if (run.stage === "fasting") {
    body = `<h2>قراءة الصيام</h2><p class="sub">قِس الحين قبل ما تشرب أي شي.</p><div class="field"><label for="cb-f">القراءة (ملجم/دسل)</label><input id="cb-f" class="input bignum" type="number" inputmode="numeric" min="30" max="600" placeholder="000" value="${run.R[0] ?? ""}"></div><div id="cb-msg"></div>`;
    foot = `<button class="btn primary block" id="cb-start">${ic("clock")} شربت الجلوكوز، ابدأ المؤقت</button><p class="small muted" style="text-align:center">ذوّبه في ٢٥٠ مل ماء واشربه خلال ٥ دقائق</p>`;
  } else if (run.stage === "run") {
    const nx = nextDue(run), C = 2 * Math.PI * 92;
    body = `<h2>الاختبار شغّال</h2><p class="sub">اجلس وارتح. ننبهك وقت كل قراءة.</p>
      <div class="timer"><svg width="220" height="220" viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="92" stroke="var(--soft2)" stroke-width="13" fill="none"/><circle id="cb-arc" cx="110" cy="110" r="92" stroke="var(--brand2)" stroke-width="13" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 110 110)"/></svg>
        <div class="center"><span class="small muted" id="cb-lbl">${nx ? `قراءة ${nx.t} دقيقة بعد` : "خلصت القراءات"}</span><b id="cb-left">${nx ? fmtLeft(nx.left) : "✓"}</b><span class="xs muted">بدأ ${fmtTime(run.start)}</span></div></div>
      <div class="stack">${TPS.map(t => { const v = run.R[t], dueAt = run.start + t * 60000, open = Date.now() >= dueAt - 5 * 60000;
        return `<div class="tp ${v != null ? "done" : open ? "due" : ""}"><span class="st num">${t}</span><span><b>بعد ${t} دقيقة</b><br><span class="small muted">الساعة ${fmtTime(dueAt)}${t === 90 ? " · اختيارية" : ""}</span></span><input data-tp="${t}" type="number" inputmode="numeric" min="30" max="600" value="${v ?? ""}" ${open || v != null ? "" : "disabled"} aria-label="قراءة ${t} دقيقة" placeholder="—"></div>`; }).join("")}</div><div id="cb-msg"></div>`;
    foot = `<button class="btn primary block" id="cb-calc" ${run.R[30] != null && run.R[60] != null && run.R[120] != null ? "" : "disabled"}>احسب النتيجة</button><button class="btn ghost block" id="cb-cancel">ألغِ الاختبار</button>
      <div id="cb-cc" hidden class="note bad"><span><b>تلغي الاختبار؟</b><br><span class="row" style="margin-top:8px"><button class="btn sm primary" id="cb-cy">ألغِ</button><button class="btn sm" id="cb-cn">كمّل</button></span></span></div>`;
  } else if (run.stage === "done") {
    const C = S.calib;
    body = `<div class="empty" style="padding-top:0"><div class="art" style="background:var(--gA-s);color:var(--gA)">${ic("check")}</div><h2>عرفنا جسمك</h2></div>${run.warn || ""}
      <div class="card"><div class="chart">${calibChart(C)}</div><div class="kpis"><div class="kpi"><small>أعلى ارتفاع</small><b class="num">+${r0(C.rise)}</b></div><div class="kpi"><small>القمة بعد</small><b class="num">${C.peakT} د</b></div><div class="kpi"><small>حساسيتك</small><b class="num">${r1(C.s)}</b></div></div>
        <p>${esc(C.shape)}.${C.peakT >= 60 ? " قمتك متأخرة، وهذا يتوافق مع ضعف المرحلة الأولى لإفراز الإنسولين، وهنا بالضبط يفيد ترتيب الأكل." : ""}</p></div>
      <div class="note info">${ic("flask")}<span>${curModel().calCount > 1 ? "دمجنا النتيجة مع اختبارك السابق." : "الأفضل تعيد الاختبار مرة ثانية خلال أسبوعين، لأن الاستجابة تتغير من يوم ليوم."}</span></div>`;
    foot = `<button class="btn primary block" id="cb-fin">${ic("camera")} سجّل أول وجبة</button><button class="btn ghost block" id="cb-home">للرئيسية</button>`;
  }
  $("#flow").innerHTML = `<div class="flowwrap"><div class="flowhead"><button class="iconbtn" id="cb-x" aria-label="إغلاق">${ic("x")}</button>${ok ? `<div class="progress"><i style="width:${step / 4 * 100}%"></i></div><span class="steps-txt">${step} من ٤</span>` : ""}</div><div class="flowbody">${body}</div><div class="flowfoot">${foot}</div></div>`;
  const R = $("#flow");
  $("#cb-x", R).onclick = () => go("today"); $("#cb-close", R) && ($("#cb-close", R).onclick = () => go("today"));
  $$("[data-dose]", R).forEach(b => b.onclick = async () => { run.dose = +b.dataset.dose; await saveRun(); renderCalib(); });
  $$("[data-ch]", R).forEach(b => b.onclick = async () => { const k = b.dataset.ch; run.checks = run.checks.includes(k) ? run.checks.filter(x => x !== k) : [...run.checks, k]; await saveRun(); renderCalib(); });
  $("#cb-next", R) && ($("#cb-next", R).onclick = async () => { run.stage = "fasting"; await saveRun(); renderCalib(); });
  $("#cb-start", R) && ($("#cb-start", R).onclick = async () => { const v = parseFloat($("#cb-f", R).value), lim = p.status === "t2" ? 160 : 126, m = $("#cb-msg", R);
    if (!isFinite(v) || v < 30 || v > 600) { m.innerHTML = `<div class="note bad">${ic("x")}<span>اكتب قراءة الصيام أولاً.</span></div>`; return; }
    if (v < 70) { m.innerHTML = `<div class="note bad">${ic("shield")}<span><b>أقل من ٧٠: لا تبدأ.</b> إذا عندك أعراض خذ ١٥ جم سكر سريع وكلّم طبيبك.</span></div>`; return; }
    if (v >= lim) { m.innerHTML = `<div class="note bad">${ic("shield")}<span><b>${lim} أو أكثر: لا تشرب الجلوكوز.</b> ${p.status === "t2" ? "سكرك مرتفع من البداية." : "قد يعني سكري، راجع الطبيب."}</span></div>`; return; }
    run.R[0] = v; run.start = Date.now(); run.stage = "run"; await saveRun();
    if ("Notification" in window && Notification.permission === "default") { try { await Notification.requestPermission(); } catch (e) {} } scheduleCalibNotifs(); renderCalib(); });
  if (run.stage === "run") {
    $$("[data-tp]", R).forEach(inp => inp.onchange = async () => { const t = +inp.dataset.tp, v = parseFloat(inp.value); if (!isFinite(v)) delete run.R[t]; else run.R[t] = v; await saveRun(); renderCalib();
      if (v >= 250) $("#cb-msg").innerHTML = `<div class="note bad">${ic("shield")}<span><b>٢٥٠ أو أكثر: أوقف الاختبار</b> وتواصل مع طبيبك.</span></div>`; else if (v < 70) $("#cb-msg").innerHTML = `<div class="note bad">${ic("shield")}<span><b>هبوط تحت ٧٠:</b> كُل شي خفيف وبلّغ طبيبك.</span></div>`; });
    const arc = $("#cb-arc", R), C = 2 * Math.PI * 92;
    const tick = () => { const nx = nextDue(run); if (!$("#cb-left")) return; if (!nx) { $("#cb-left").textContent = "✓"; $("#cb-lbl").textContent = "خلصت القراءات"; arc.setAttribute("stroke-dashoffset", 0); return; }
      $("#cb-left").textContent = nx.left > 0 ? fmtLeft(nx.left) : "الحين"; $("#cb-lbl").textContent = nx.left > 0 ? `قراءة ${nx.t} دقيقة بعد` : `وقت قراءة ${nx.t} دقيقة`;
      const prev = TPS[TPS.indexOf(nx.t) - 1] || 0; arc.setAttribute("stroke-dashoffset", C * (1 - clamp(1 - nx.left / ((nx.t - prev) * 60000), 0, 1)));
      if ($$("[data-tp]", R).some(inp => inp.disabled && Date.now() >= run.start + +inp.dataset.tp * 60000 - 5 * 60000)) renderCalib(); };
    tick(); clearInterval(tickTimer); tickTimer = setInterval(tick, 1000);
    $("#cb-calc", R).onclick = finishCalib; $("#cb-cancel", R).onclick = () => $("#cb-cc", R).hidden = false; $("#cb-cn", R).onclick = () => $("#cb-cc", R).hidden = true;
    $("#cb-cy", R).onclick = async () => { S.calibRun = null; await Store.del("calibRun"); toast("انلغى الاختبار"); go("today"); };
  }
  $("#cb-fin", R) && ($("#cb-fin", R).onclick = async () => { run.closed = true; await saveRun(); newScan(); go("scan"); });
  $("#cb-home", R) && ($("#cb-home", R).onclick = async () => { run.closed = true; await saveRun(); go("today"); });
}
function scheduleCalibNotifs() { if (!("Notification" in window) || Notification.permission !== "granted") return; const run = S.calibRun;
  for (const t of TPS) { const ms = run.start + t * 60000 - Date.now(); if (ms > 0) setTimeout(async () => { try { const reg = await navigator.serviceWorker?.getRegistration(), b = `حان وقت قراءة ${t} دقيقة في اختبار المعايرة`; reg ? reg.showNotification("Preventive Glucose AI", {body: b, icon: "icon.svg", tag: "cal" + t}) : new Notification("Preventive Glucose AI", {body: b}); } catch (e) {} }, ms); } }
function classifyShape(R) { const pts = [0, ...TPS].filter(t => R[t] != null); let peaks = 0;
  for (let i = 1; i < pts.length - 1; i++) if (R[pts[i]] > R[pts[i - 1]] && R[pts[i]] > R[pts[i + 1]]) peaks++;
  const last = pts[pts.length - 1]; if (R[last] >= Math.max(...pts.map(t => R[t])) - 2) return "منحنى متصاعد حتى النهاية: القمة متأخرة جداً";
  return peaks >= 2 ? "منحنى ثنائي القمة: نمط مرتبط بحساسية أفضل للإنسولين" : "منحنى أحادي القمة: نمط أكثر شيوعاً مع ضعف حساسية الإنسولين"; }
async function finishCalib() {
  const run = S.calibRun, R = run.R, vals = Object.values(R);
  let peakT = 0, peakV = R[0]; for (const t of TPS) if (R[t] != null && R[t] > peakV) { peakV = R[t]; peakT = t; }
  const rise = Math.max(5, peakV - R[0]), s = rise / run.dose, base = curModel(), prev = base.calibrated ? base.s : null; let warn = "";
  if (Math.max(...vals) >= 250) warn += `<div class="note bad">${ic("shield")}<span><b>وصلت قراءة ٢٥٠ أو أكثر.</b> اعرض النتيجة على طبيبك.</span></div>`;
  if (Math.min(...vals.slice(1)) < 70) warn += `<div class="note bad">${ic("shield")}<span><b>نزلت قراءة تحت ٧٠</b> (هبوط تفاعلي). بلّغ طبيبك.</span></div>`;
  if (run.dose === 75 && R[120] != null) { if (R[120] >= 200) warn += `<div class="note bad">${ic("shield")}<span><b>قراءة الساعتين ٢٠٠ أو أكثر بعد ٧٥ جم</b> في نطاق السكري حسب اختبار التحمل. الاختبار المنزلي ما يكفي للتشخيص، راجع طبيبك.</span></div>`;
    else if (R[120] >= 140) warn += `<div class="note">${ic("shield")}<span><b>قراءة الساعتين بين ١٤٠ و١٩٩</b> تتوافق مع ضعف تحمل الجلوكوز. اعرضها على طبيبك.</span></div>`; }
  else if (Math.max(...vals) >= 200) warn += `<div class="note">${ic("shield")}<span><b>قراءة ٢٠٠ أو أكثر بعد ٥٠ جم:</b> استجابة عالية. اعرضها على طبيبك.</span></div>`;
  await saveKV("model", {...base, s: prev ? (prev + s) / 2 : s, tpG: peakT || 30, g0: R[0], calibrated: true, calCount: (base.calCount || 0) + 1});
  await saveKV("calib", {R: {...R}, ts: Date.now(), dose: run.dose, rise, peakT, s, shape: classifyShape(R)});
  run.stage = "done"; run.warn = warn; await saveRun();
  for (const t of [0, ...TPS]) if (R[t] != null) { const r = {id: uid("r"), ts: run.start + t * 60000, v: R[t], kind: t === 0 ? "fasting" : "random", calib: true}; S.readings.unshift(r); await putReading(r); }
  S.readings.sort((a, b) => b.ts - a.ts); renderCalib();
}
function calibChart(C) { const pts = Object.keys(C.R).map(Number).sort((a, b) => a - b).map(t => [t, C.R[t]]); return curveSVG([{pts, color: "var(--saffron)", dots: true, labels: true}], {xmax: 120, ticks: [0, 30, 60, 90, 120], tickFmt: t => t ? t + "د" : "الشرب", label: "منحنى اختبار الجلوكوز"}); }

/* ================= boot ================= */
(async function boot() {
  await Store.open(); Cloud.init(); await loadAll();
  if (Cloud.on) { await Cloud.session(); if (Cloud.user) await Cloud.sync();
    Cloud.sb.auth.onAuthStateChange(async (ev, session) => { if (ev === "SIGNED_IN" && session && !Cloud.user) { Cloud.user = session.user; await afterLogin(); } }); }
  route();
  for (const m of S.meals) scheduleNotif(m);
  if (S.calibRun && S.calibRun.stage === "run") scheduleCalibNotifs();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  if (!Store.db) toast("المتصفح يمنع الحفظ الدائم في هذا الوضع");
  setInterval(() => { if ((!location.hash || location.hash === "#today") && !$(".sheet-bg") && S.profile) viewToday(); }, 60000);
})();
