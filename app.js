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
const fmtDay = ts => { const d = new Date(ts), t = new Date(); const k = x => x.toDateString();
  if (k(d) === k(t)) return "اليوم"; const y = new Date(t); y.setDate(t.getDate() - 1); if (k(d) === k(y)) return "أمس";
  return d.toLocaleDateString(LOC, {weekday: "long", day: "numeric", month: "long"}); };
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const uid = p => p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function toast(t) { const e = $("#toast"); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => e.hidden = true, 3200); }

/* ================= storage (IndexedDB, memory fallback) ================= */
const Store = {
  db: null, mem: {kv: {}, meals: {}, readings: {}},
  async open() {
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open("pga", 1);
        r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("kv"); d.createObjectStore("meals", {keyPath: "id"}); d.createObjectStore("readings", {keyPath: "id"}); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    } catch (e) { this.db = null; }
  },
  _p(store, mode, fn) {
    return new Promise((res, rej) => { const t = this.db.transaction(store, mode), q = fn(t.objectStore(store)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  },
  async get(k) { if (!this.db) return this.mem.kv[k] ?? null; return (await this._p("kv", "readonly", s => s.get(k))) ?? null; },
  async set(k, v) { if (!this.db) { this.mem.kv[k] = v; return; } return this._p("kv", "readwrite", s => s.put(v, k)); },
  async del(k) { if (!this.db) { delete this.mem.kv[k]; return; } return this._p("kv", "readwrite", s => s.delete(k)); },
  async all(store) { if (!this.db) return Object.values(this.mem[store]); return (await this._p(store, "readonly", s => s.getAll())) || []; },
  async put(store, v) { if (!this.db) { this.mem[store][v.id] = v; return; } return this._p(store, "readwrite", s => s.put(v)); },
  async remove(store, id) { if (!this.db) { delete this.mem[store][id]; return; } return this._p(store, "readwrite", s => s.delete(id)); },
  async clearAll() { if (!this.db) { this.mem = {kv: {}, meals: {}, readings: {}}; return; } for (const s of ["kv", "meals", "readings"]) await this._p(s, "readwrite", x => x.clear()); }
};

/* ================= state ================= */
const S = {profile: null, model: null, calib: null, calibRun: null, settings: {provider: "none", model: "gemini-3.8-flash"}, meals: [], readings: [], scan: null, foodQ: "", foodCat: "all", logFilter: "all"};
async function loadAll() {
  [S.profile, S.model, S.calib, S.calibRun] = await Promise.all(["profile", "model", "calib", "calibRun"].map(k => Store.get(k)));
  S.settings = {...S.settings, ...(await Store.get("settings") || {})};
  S.meals = (await Store.all("meals")).sort((a, b) => b.ts - a.ts);
  S.readings = (await Store.all("readings")).sort((a, b) => b.ts - a.ts);
  if (S.profile && !S.model) S.model = priorModel(S.profile);
}
const saveKV = (k, v) => { S[k] = v; return Store.set(k, v); };

/* ================= physiology model =================
   s   = mg/dL peak rise per 1 unit of glycemic load (1 g glucose = 1 unit). Prior anchored on
         Buchanan & McKiddie 1967 (healthy adults ≈ +38 mg/dL after 50 g glucose ⇒ s≈0.8), raised by HbA1c / status.
   tpG = minutes to peak after a glucose drink; solid meals peak later. */
const GLUCOSE_DELAY = 15;
function bmi(p) { return p && p.height && p.weight ? p.weight / Math.pow(p.height / 100, 2) : null; }
function priorModel(p) {
  let s = {none: 0.85, pre: 1.35, t2: 2.1, t1: 2.5, gdm: 1.6}[p.status] || 1.0;
  if (p.a1c) s = clamp(0.8 + (p.a1c - 5.2) * 0.95, 0.7, 3.2);
  const b = bmi(p); if (b >= 30) s *= 1.1; if (p.age >= 60) s *= 1.08;
  if (p.meds && p.meds.met && !p.a1c) s *= 0.92;
  let tpG = {none: 30, pre: 45, t2: 60, t1: 60, gdm: 45}[p.status] || 45; if (p.age >= 60) tpG += 5;
  const g0 = p.fbg || {none: 92, pre: 108, t2: 135, t1: 140, gdm: 95}[p.status] || 100;
  return {s, tpG, g0, n: 0, calibrated: false, log: []};
}
function totals(items) {
  let c = 0, f = 0, p = 0, fat = 0, gl = 0, liqGL = 0, kcal = 0;
  for (const it of items) { const g = it.g, F = it.data, avail = Math.max(0, F.c - F.f) * g / 100;
    c += F.c * g / 100; f += F.f * g / 100; p += F.p * g / 100; fat += F.fat * g / 100;
    const l = avail * F.gi / 100; gl += l; if (F.liquid) liqGL += l; kcal += (F.kcal || (F.c * 4 + F.p * 4 + F.fat * 9)) * g / 100; }
  return {c, f, p, fat, gl, liqGL, kcal};
}
const FACT = {order: {carb: 1, mixed: 0.82, veg: 0.6}, walk: {"0": 1, "10": 0.88, "20": 0.82}, time: {morning: 1, noon: 1, evening: 1.08, iftar: 1.1}};
function predict(items, ctx, model, prof, g0over) {
  const T = totals(items), meds = (prof && prof.meds) || {}, solidGL = T.gl - T.liqGL;
  const mix = 1 / (1 + 0.004 * T.fat + 0.003 * T.p + 0.02 * T.f);
  const st = ctx.state || {};
  let m = (FACT.walk[ctx.walk] ?? 1) * mix * (FACT.time[ctx.time] ?? 1), delay = 0;
  if (st.sleep) m *= 1.08; if (st.stress) m *= 1.1; if (st.ex) m *= 0.9;
  if (meds.glp) { m *= 0.6; delay += 30; } if (meds.acar) { m *= 0.78; delay += 15; }
  const effGL = solidGL * (FACT.order[ctx.order] ?? 0.82) + T.liqGL;
  const rise = Math.max(0, model.s * effGL * m), g0 = g0over || (model.g0 + (st.prev ? 12 : 0));
  let tp = model.tpG + GLUCOSE_DELAY + delay; if (T.fat > 25) tp += 15; if (ctx.order === "veg") tp += 10; if (T.f > 8) tp += 10;
  if (solidGL < 1 && T.liqGL > 0) tp = Math.max(25, model.tpG);
  tp = Math.min(tp, 140);
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
  if (p.status === "none" && p.a1c >= 5.7 && p.a1c < 6.5) out.msgs.push("تراكمي بين ٥٫٧ و٦٫٤ يعني نطاق ما قبل السكري. هنا بالضبط تفرق عادات الوجبة.");
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
  if (p.status === "t2" && (!p.a1c || p.a1c >= 7.5)) return [false, "لمرضى النوع الثاني: مسموح فقط إذا التراكمي أقل من ٧٫٥ وبموافقة الطبيب. أضف التراكمي في ملفك."];
  return [true, p.status === "t2" ? "مسموح بجرعة ٥٠ جم فقط وبموافقة طبيبك." : ""];
}

/* ================= charts ================= */
function curveSVG(series, opts = {}) {
  const W = 360, H = 220, L = 34, R = 8, T = 18, B = 26;
  const vals = series.flatMap(s => s.pts.map(p => s.band ? s.g0 + (p[1] - s.g0) * (1 + s.band) : p[1]));
  const ymin = Math.min(70, Math.floor(Math.min(...vals) / 10) * 10 - 10), ymax = Math.max(200, Math.ceil(Math.max(...vals) / 20) * 20 + 10);
  const xmax = opts.xmax || 240;
  const X = t => L + (W - L - R) * t / xmax, Y = v => T + (H - T - B) * (1 - (v - ymin) / (ymax - ymin));
  let g = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || "منحنى السكر")}" direction="ltr" style="direction:ltr">`;
  g += `<rect x="${L}" y="${Y(ymax)}" width="${W - L - R}" height="${Y(180) - Y(ymax)}" fill="var(--gE-s)"/><rect x="${L}" y="${Y(180)}" width="${W - L - R}" height="${Y(140) - Y(180)}" fill="var(--gC-s)"/>`;
  for (let v = Math.ceil(ymin / 40) * 40; v <= ymax; v += 40) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${Y(v) + 4}" font-size="10.5" text-anchor="end" fill="var(--muted)" font-family="Readex Pro">${v}</text>`;
  const ticks = opts.ticks || [0, 60, 120, 180, 240];
  for (const t of ticks) g += `<text x="${X(t)}" y="${H - B + 17}" font-size="10.5" text-anchor="middle" fill="var(--muted)" font-family="Readex Pro">${opts.tickFmt ? opts.tickFmt(t) : t}</text>`;
  for (const s of series) {
    if (s.band) { const up = s.pts.map(p => [X(p[0]), Y(s.g0 + (p[1] - s.g0) * (1 + s.band))]), dn = s.pts.map(p => [X(p[0]), Y(s.g0 + (p[1] - s.g0) * (1 - s.band))]).reverse();
      g += `<path d="M${up.map(p => p.map(n => n.toFixed(1)).join(",")).join("L")}L${dn.map(p => p.map(n => n.toFixed(1)).join(",")).join("L")}Z" fill="${s.color}" opacity=".13"/>`; }
    if (s.line !== false && s.pts.length > 1) g += `<path d="M${s.pts.map(p => X(p[0]).toFixed(1) + "," + Y(p[1]).toFixed(1)).join("L")}" fill="none" stroke="${s.color}" stroke-width="${s.w || 2.6}" stroke-dasharray="${s.dash || ""}" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (s.dots) for (const p of s.pts) g += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="${s.r || 4.5}" fill="${p[2] || s.color}" stroke="var(--surface)" stroke-width="2"/>${s.labels ? `<text x="${X(p[0])}" y="${Y(p[1]) - 10}" font-size="11" text-anchor="middle" fill="var(--ink)" font-family="Readex Pro">${r0(p[1])}</text>` : ""}`;
    if (s.peak) g += `<circle cx="${X(s.peak[0])}" cy="${Y(s.peak[1])}" r="5" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/><text x="${X(s.peak[0])}" y="${Y(s.peak[1]) - 10}" font-size="13" font-weight="600" text-anchor="middle" fill="var(--ink)" font-family="Readex Pro">${r0(s.peak[1])}</text>`;
  }
  return g + "</svg>";
}
function ringSVG(val, size = 112, label = "") {
  const r = size / 2 - 9, C = 2 * Math.PI * r, f = val == null ? 0 : clamp(val, 0, 100) / 100;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-label="${esc(label)}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="currentColor" stroke-opacity=".22" stroke-width="10" fill="none"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="currentColor" stroke-width="10" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - f)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="Readex Pro" font-weight="700" font-size="${size * 0.28}">${val == null ? "—" : r0(val)}</text></svg>`;
}

/* ================= router ================= */
const MAIN = ["today", "log", "insights", "foods", "me"], FLOWS = ["onboard", "scan", "calib"];
let tickTimer = null;
function go(h) { if (location.hash === "#" + h) route(); else location.hash = h; }
function route() {
  let h = location.hash.slice(1) || "today";
  if (!S.profile && h !== "onboard") { if (!OB.started) startOnboard(false); h = "onboard"; if (location.hash !== "#onboard") { history.replaceState(null, "", "#onboard"); } }
  const flow = $("#flow");
  clearInterval(tickTimer); tickTimer = null;
  if (FLOWS.includes(h)) { flow.hidden = false; document.body.style.overflow = "hidden"; $("#tabbar").hidden = true; renderFlow(h); return; }
  flow.hidden = true; flow.innerHTML = ""; document.body.style.overflow = ""; $("#tabbar").hidden = false;
  if (!MAIN.includes(h)) h = "today";
  $$(".tab").forEach(a => a.setAttribute("aria-current", a.dataset.tab === h ? "page" : "false"));
  ({today: viewToday, log: viewLog, insights: viewInsights, foods: viewFoods, me: viewMe})[h]();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
function renderFlow(h) { if (h === "onboard") renderOnboard(); else if (h === "scan") renderScan(); else renderCalib(); $("#flow").scrollTop = 0; }

/* ================= sheets ================= */
function openSheet(html, bind) {
  const root = $("#sheet-root"); const bg = document.createElement("div"); bg.className = "sheet-bg";
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  root.appendChild(bg); const sheet = $(".sheet", bg);
  const close = () => { bg.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = e => { if (e.key === "Escape") close(); };
  bg.addEventListener("click", e => { if (e.target === bg) close(); });
  document.addEventListener("keydown", onKey);
  $$("[data-close]", sheet).forEach(b => b.onclick = close);
  bind && bind(sheet, close);
  const f = $("input,button", sheet); f && f.focus({preventScroll: true});
  return close;
}

/* ================= data helpers ================= */
const mealReadings = m => S.readings.filter(r => r.mealId === m.id).sort((a, b) => a.minutes - b.minutes);
function mealStatus(m) {
  const now = Date.now(), due = m.ts + m.measureAt * 60000, rs = mealReadings(m);
  if (rs.length) return {k: "done"};
  if (now < due - 10 * 60000) return {k: "wait", mins: r0((due - now) / 60000)};
  if (now <= due + 90 * 60000) return {k: "due"};
  return {k: "missed"};
}
function mealName(m) { return m.title || m.items.map(i => i.name).slice(0, 3).join("، ") || "وجبة"; }
function thumbHTML(m, cls = "thumb") { return m.photo ? `<img class="${cls}" src="${m.photo}" alt="">` : `<div class="${cls}">${ic("bowl")}</div>`; }
function itemData(it) { return it.data || FOODS[it.key]; }

/* ================= TODAY ================= */
function viewToday() {
  clearInterval(tickTimer); tickTimer = null;
  const p = S.profile || {}, md = curModel(), now = Date.now();
  const today = S.meals.filter(m => sameDay(m.ts, now));
  const score = avg(today.map(m => GRADE_SCORE[m.grade]));
  const due = S.meals.filter(m => mealStatus(m).k === "due");
  const waiting = S.meals.filter(m => mealStatus(m).k === "wait");
  const [calOk] = calAllowed(p);
  const hour = new Date().getHours(), hello = hour < 12 ? "صباح الخير" : "مساء الخير";
  const inRange = today.filter(m => m.pred.peak < 140).length;
  const run = S.calibRun && S.calibRun.stage !== "done" ? S.calibRun : null;
  let tasks = "";
  for (const m of due) tasks += `<button class="card task alert" data-read="${m.id}">${`<span class="ic">${ic("drop")}</span>`}<span><b>حان وقت القياس</b><br><span class="small muted">${esc(mealName(m))} · بعد ${m.measureAt} دقيقة من الأكل</span></span>${ic("next")}</button>`;
  for (const m of waiting) tasks += `<div class="card task brand"><span class="ic">${ic("clock")}</span><span><b>قِس بعد <span class="num">${mealStatus(m).mins}</span> دقيقة</b><br><span class="small muted">${esc(mealName(m))}</span></span><span></span></div>`;
  if (run) tasks += `<a class="card task" href="#calib"><span class="ic">${ic("flask")}</span><span><b>اختبار المعايرة شغّال</b><br><span class="small muted" id="today-calib">كمّل القراءات</span></span>${ic("next")}</a>`;
  else if (!md.calibrated && calOk) tasks += `<a class="card task" href="#calib"><span class="ic">${ic("flask")}</span><span><b>الخطوة الأهم: اختبار المعايرة</b><br><span class="small muted">ساعتين الصبح على الريق. يرفع دقة التوقع بشكل كبير.</span></span>${ic("next")}</a>`;
  $("#view").innerHTML = `<section class="screen">
    <div class="topbar"><div><div class="eyebrow">${new Date().toLocaleDateString(LOC, {weekday: "long", day: "numeric", month: "long"})}</div><h1>${hello}${p.name ? "، " + esc(p.name.split(" ")[0]) : ""}</h1></div>
      <a class="avatar" href="#me" aria-label="حسابي">${esc((p.name || "؟").trim().charAt(0) || "؟")}</a></div>
    <div class="hero">
      <div>${ringSVG(score, 116, "مؤشر اليوم")}</div>
      <div class="stats"><small>مؤشر وجبات اليوم</small>
        <div class="stat"><b class="num">${today.length}</b> <small>وجبات مسجلة</small></div>
        <div class="stat"><b class="num">${inRange}</b> <small>تحت ١٤٠ متوقع</small></div>
        <small>${score == null ? "صوّر أول وجبة اليوم عشان يبدأ المؤشر" : score >= 80 ? "يومك ممتاز، استمر" : score >= 60 ? "يوم مقبول، فيه مجال للتحسين" : "وجبات اليوم ثقيلة، جرّب البدائل"}</small></div>
    </div>
    ${tasks}
    <div class="card">
      <div class="row between"><h3>وجبات اليوم</h3><a class="link" href="#log">السجل كامل</a></div>
      ${today.length ? `<div class="list">${today.map(m => mealRow(m)).join("")}</div>` :
      `<div class="empty"><div class="art">${ic("camera")}</div><b>ما سجلت أكل اليوم</b><p class="small muted">قبل ما تاكل، صوّر صحنك وشوف وش بيسوي في سكرك.</p><a class="btn primary" href="#scan">${ic("camera")} صوّر وجبتك</a></div>`}
    </div>
    <div class="grid2">
      <button class="card task brand" data-act="quickread" style="grid-template-columns:auto 1fr"><span class="ic">${ic("drop")}</span><span><b>سجّل قراءة</b><br><span class="xs muted">صيام أو عشوائية</span></span></button>
      <button class="card task brand" data-act="compare" style="grid-template-columns:auto 1fr"><span class="ic">${ic("compare")}</span><span><b>قارن خيارين</b><br><span class="xs muted">قبل ما تطلب</span></span></button>
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
  const sub = rs.length ? `قراءتك <b class="num">${rs[rs.length - 1].v}</b> · المتوقع ${r0(m.pred.peak)}` : st.k === "due" ? `<span class="gt-D">قِس الآن</span> · قمة متوقعة ${r0(m.pred.peak)}` : `قمة متوقعة <b class="num">${r0(m.pred.peak)}</b> عند ${r0(m.pred.tp)} د`;
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
    <div class="chips" role="group" aria-label="تصفية">${[["all", "الكل"], ["meals", "الوجبات"], ["readings", "القراءات"]].map(([k, l]) => `<button class="chip" data-f="${k}" aria-pressed="${f === k}">${l}</button>`).join("")}</div>
    ${groups.length ? groups.map(g => `<div class="daylabel">${fmtDay(g.ts)}</div><div class="card"><div class="list">${g.xs.map(x => x.t === "m" ? mealRow(x.m) :
      `<div class="lrow"><span class="oi">${ic("drop")}</span><span><b class="num">${x.r.v}</b> <span class="small muted">ملجم/دسل · ${KIND[x.r.kind] || ""}</span><br><span class="xs muted">${fmtTime(x.r.ts)}</span></span><span class="pill ${x.r.v < 70 ? "gs-E gt-E" : x.r.v < 140 ? "gs-A gt-A" : x.r.v < 180 ? "gs-C gt-C" : "gs-E gt-E"}">${x.r.v < 70 ? "منخفض" : x.r.v < 140 ? "طبيعي" : x.r.v < 180 ? "مرتفع" : "عالي"}</span></div>`).join("")}</div></div>`).join("") :
    `<div class="card"><div class="empty"><div class="art">${ic("list")}</div><b>السجل فاضي</b><p class="small muted">كل وجبة تصورها وكل قراءة تدخلها تظهر هنا.</p><a class="btn primary" href="#scan">${ic("camera")} صوّر أول وجبة</a></div></div>`}
  </section>`;
  $$("[data-f]").forEach(b => b.onclick = () => { S.logFilter = b.dataset.f; viewLog(); });
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
    const its = m.items.map(it => ({...it, data: itemData(it)})).filter(it => it.data); const T = totals(its.map(i => ({g: i.grams, data: i.data})));
    for (const it of its) { const gl = Math.max(0, it.data.c - it.data.f) * it.grams / 100 * it.data.gi / 100; if (T.gl && gl / T.gl >= 0.25) (byFood[it.name] = byFood[it.name] || []).push(rise); } }
  const ranked = Object.entries(byFood).map(([n, a]) => ({n, v: avg(a), c: a.length})).sort((a, b) => b.v - a.v);
  const week = S.meals.filter(m => Date.now() - m.ts < 7 * 864e5), gc = {A: 0, B: 0, C: 0, D: 0, E: 0}; week.forEach(m => gc[m.grade]++);
  const since = Date.now() - 14 * 864e5, rpts = S.readings.filter(r => r.ts >= since);
  const t0 = new Date(); t0.setHours(0, 0, 0, 0); const start = t0.getTime() - 13 * 864e5;
  const pts = rpts.map(r => [(r.ts - start) / 864e5 * 10, r.v, r.v < 70 || r.v >= 180 ? "var(--gE)" : r.v >= 140 ? "var(--gC)" : "var(--gA)"]);
  $("#view").innerHTML = `<section class="screen">
    <div class="topbar"><h1>رؤاك</h1></div>
    <div class="card">
      <div class="row between"><h3>نموذجك الشخصي</h3><span class="pill ${md.calibrated ? "gs-A gt-A" : "gs-C gt-C"}">${md.calibrated ? "معاير" : "تقدير أولي"}</span></div>
      <div class="kpis">
        <div class="kpi"><small>الحساسية لكل جرام</small><b class="num">${r1(md.s)}</b></div>
        <div class="kpi"><small>قمتك مع الجلوكوز</small><b class="num">${r0(md.tpG)} د</b></div>
        <div class="kpi"><small>دقة التوقع</small><b class="num">${mae != null ? "±" + r0(mae) : "—"}</b></div>
      </div>
      <p class="small muted">${md.calibrated ? `تعلّم النموذج من ${md.n || 0} قراءة بعد الأكل.` : "النموذج مبني على بياناتك فقط. اختبار المعايرة وقراءات بعد الأكل تخليه يعرف جسمك."}</p>
      ${!md.calibrated && calAllowed(S.profile)[0] ? `<a class="btn primary block" href="#calib">${ic("flask")} ابدأ اختبار المعايرة</a>` : ""}
    </div>
    <div class="card">
      <h3>تقييم وجباتك هالأسبوع</h3>
      ${week.length ? `<div class="bar">${"ABCDE".split("").map(k => gc[k] ? `<i class="g-${k}" style="width:${gc[k] / week.length * 100}%"></i>` : "").join("")}</div>
      <div class="legend">${"ABCDE".split("").filter(k => gc[k]).map(k => `<span><i class="dot g-${k}"></i>${k}: ${gc[k]}</span>`).join("")}</div>` : `<p class="small muted">ما فيه وجبات هالأسبوع.</p>`}
    </div>
    <div class="card">
      <h3>أكلات ترفع سكرك أنت</h3>
      ${ranked.length ? `<div class="list">${ranked.slice(0, 6).map(x => `<div class="lrow"><span class="oi">${ic("bowl")}</span><span><b>${esc(x.n)}</b><br><span class="xs muted">${x.c} قراءة</span></span><span class="pill ${x.v >= 60 ? "gs-E gt-E" : x.v >= 35 ? "gs-C gt-C" : "gs-A gt-A"}">+${r0(x.v)}</span></div>`).join("")}</div>` :
      `<p class="small muted">تظهر هنا بعد ما تدخل قراءات بعد الوجبات. كل شخص يستجيب بشكل مختلف لنفس الأكل، وهنا تشوف استجابتك أنت.</p>`}
    </div>
    <div class="card">
      <h3>قراءاتك آخر ١٤ يوم</h3>
      ${pts.length ? `<div class="chart">${curveSVG([{pts, color: "var(--brand2)", dots: true, line: false, r: 6}], {xmax: 140, ticks: [0, 30, 60, 90, 120], tickFmt: t => new Date(start + t / 10 * 864e5).toLocaleDateString(LOC, {day: "numeric", month: "numeric"}), label: "القراءات"})}</div>` : `<p class="small muted">ما فيه قراءات بعد.</p>`}
    </div>
    ${S.calib ? `<div class="card"><h3>نتيجة اختبار المعايرة</h3><div class="chart">${calibChart(S.calib)}</div><p class="small muted">${esc(S.calib.shape || "")}</p></div>` : ""}
  </section>`;
}

/* ================= FOODS ================= */
function foodGrade(F) { const p = predict([{g: F.unit[1], data: F}], {order: "mixed", walk: "0", time: "noon"}, curModel(), S.profile); return p; }
function viewFoods() {
  const q = S.foodQ.trim(), cat = S.foodCat;
  $("#view").innerHTML = `<section class="screen">
    <div class="topbar"><h1>مكتبة الأكل</h1><span class="pill num">${Object.keys(FOODS).length} صنف</span></div>
    <label class="searchbox">${ic("search")}<input id="fq" type="search" placeholder="ابحث: كبسة، جريش، تمر سكري…" value="${esc(q)}" aria-label="ابحث عن أكل"></label>
    <div class="chips">${CATS.map(([k, l]) => `<button class="chip" data-cat="${k}" aria-pressed="${cat === k}">${l}</button>`).join("")}</div>
    <div class="card"><div class="list" id="flist"></div></div>
    <p class="xs muted">التقييم محسوب على حصة واحدة لجسمك أنت. أغلب الأطباق السعودية من جداول هيئة الغذاء والدواء المخبرية.</p>
  </section>`;
  const draw = () => { const qq = S.foodQ.trim();
    const list = Object.values(FOODS).filter(f => (S.foodCat === "all" || f.cat === S.foodCat) && (!qq || f.ar.includes(qq)));
    $("#flist").innerHTML = list.length ? list.map(f => { const p = foodGrade(f), avail = Math.max(0, f.c - f.f) * f.unit[1] / 100;
      return `<button class="lrow" data-food="${f.id}"><span class="grade g-${p.grade}" style="width:40px;height:40px;font-size:1.05rem">${p.grade}</span><span style="min-width:0"><b>${esc(f.ar)}</b><br><span class="xs muted">${esc(f.unit[0])} ${f.unit[1]} جم · نشويات ${r0(avail)} جم${f.gi ? " · مؤشر " + f.gi : ""}</span></span>${ic("next")}</button>`; }).join("")
      : `<div class="empty"><b>ما لقينا "${esc(qq)}"</b><p class="small muted">جرّب اسم ثاني أو صوّر الوجبة.</p></div>`;
    $$("[data-food]").forEach(b => b.onclick = () => openFoodSheet(FOODS[b.dataset.food])); };
  draw();
  $("#fq").oninput = e => { S.foodQ = e.target.value; draw(); };
  $$("[data-cat]").forEach(b => b.onclick = () => { S.foodCat = b.dataset.cat; $$("[data-cat]").forEach(x => x.setAttribute("aria-pressed", x === b)); draw(); });
}
function openFoodSheet(F) {
  const p = foodGrade(F), sw = SWAPS[F.id], avail = Math.max(0, F.c - F.f) * F.unit[1] / 100;
  openSheet(`<div class="row" style="gap:14px"><span class="grade lg g-${p.grade}" style="width:64px;height:64px;font-size:1.8rem;border-radius:20px">${p.grade}</span><div><h2 style="font-size:1.35rem">${esc(F.ar)}</h2><span class="small muted">${esc(SRC_NAME[F.src])}</span></div></div>
    <div class="kpis"><div class="kpi"><small>حصة (${esc(F.unit[0])})</small><b class="num">${F.unit[1]} جم</b></div><div class="kpi"><small>نشويات بالحصة</small><b class="num">${r0(avail)} جم</b></div><div class="kpi"><small>قمة متوقعة لك</small><b class="num">${r0(p.peak)}</b></div></div>
    <div class="card flat"><table class="tbl"><tr><th>لكل ١٠٠ جم</th><th>القيمة</th></tr>
      <tr><td>سعرات</td><td class="num">${F.kcal}</td></tr><tr><td>كربوهيدرات</td><td class="num">${F.c} جم</td></tr><tr><td>ألياف</td><td class="num">${F.f} جم</td></tr>
      <tr><td>بروتين</td><td class="num">${F.p} جم</td></tr><tr><td>دهون</td><td class="num">${F.fat} جم</td></tr><tr><td>المؤشر الجلايسيمي</td><td class="num">${F.gi || "—"}${F.src === "QD" ? "" : F.gi ? " (تقدير)" : ""}</td></tr></table></div>
    ${sw ? `<div class="swap">${ic("swap")}<span><b>بديل أخف</b><br><span class="small muted">${esc(sw[2])}</span></span><span></span></div>` : ""}
    <div class="grid2"><button class="btn primary" data-a="meal">${ic("plus")} ابدأ وجبة</button><button class="btn" data-a="cmp">${ic("compare")} قارن</button></div>`,
  (sh, close) => { $("[data-a=meal]", sh).onclick = () => { close(); newScan(); S.scan.items.push(scanItem(F.id, F.unit[1])); S.scan.stage = "items"; go("scan"); };
    $("[data-a=cmp]", sh).onclick = () => { close(); openCompare(F.id); }; });
}

/* ================= COMPARE ================= */
function openCompare(a = "kabsa_chicken", b = "jareesh") {
  const opts = sel => CATS.slice(1).map(([k, l]) => `<optgroup label="${l}">${Object.values(FOODS).filter(f => f.cat === k && f.c > 2).map(f => `<option value="${f.id}" ${f.id === sel ? "selected" : ""}>${esc(f.ar)}</option>`).join("")}</optgroup>`).join("");
  openSheet(`<h2 style="font-size:1.3rem">قارن قبل ما تختار</h2><p class="small muted">حصة واحدة من كل خيار، على جسمك أنت.</p>
    <div class="field"><label for="ca">الخيار الأول</label><select id="ca" class="input">${opts(a)}</select></div>
    <div class="field"><label for="cb">الخيار الثاني</label><select id="cb" class="input">${opts(b)}</select></div>
    <div id="cout"></div><button class="btn block" data-close>تم</button>`, sh => {
    const draw = () => { const A = FOODS[$("#ca", sh).value], B = FOODS[$("#cb", sh).value], ctx = {order: "mixed", walk: "0", time: autoTime()};
      const pa = predict([{g: A.unit[1], data: A}], ctx, curModel(), S.profile), pb = predict([{g: B.unit[1], data: B}], ctx, curModel(), S.profile);
      const best = pa.peak <= pb.peak ? A : B, diff = Math.abs(pa.peak - pb.peak);
      $("#cout", sh).innerHTML = `<div class="card flat"><div class="chart">${curveSVG([{pts: pa.curve, color: "var(--brand2)", peak: [pa.tp, pa.peak]}, {pts: pb.curve, color: "var(--saffron)", dash: "7 6", peak: [pb.tp, pb.peak]}])}</div>
        <div class="legend"><span><i class="dot" style="background:var(--brand2)"></i>${esc(A.ar)} (${esc(A.unit[0])}): <b class="num">${r0(pa.peak)}</b> <span class="pill gs-${pa.grade} gt-${pa.grade}">${pa.grade}</span></span><span><i class="dot" style="background:var(--saffron)"></i>${esc(B.ar)} (${esc(B.unit[0])}): <b class="num">${r0(pb.peak)}</b> <span class="pill gs-${pb.grade} gt-${pb.grade}">${pb.grade}</span></span></div>
        <p>${diff < 5 ? "الخياران متقاربان على سكرك." : `<b>${esc(best.ar)}</b> أخف على سكرك بفرق تقريباً <b class="num">${r0(diff)}</b> ملجم/دسل في القمة.`}</p></div>`; };
    $("#ca", sh).onchange = draw; $("#cb", sh).onchange = draw; draw(); });
}

/* ================= ME ================= */
function viewMe() {
  const p = S.profile || {}, st = S.settings, b = bmi(p);
  const DX = {none: "بدون تشخيص", pre: "ما قبل السكري", t2: "سكري النوع الثاني", t1: "سكري النوع الأول", gdm: "سكري الحمل"};
  $("#view").innerHTML = `<section class="screen">
    <div class="topbar"><h1>حسابي</h1></div>
    <div class="card"><div class="row" style="gap:14px"><span class="avatar" style="width:56px;height:56px;font-size:1.4rem">${esc((p.name || "؟").charAt(0))}</span><div><h3>${esc(p.name || "")}</h3><span class="small muted">${p.age || "—"} سنة · ${DX[p.status] || ""}${b ? " · مؤشر كتلة " + r1(b) : ""}</span></div></div>
      <button class="btn ghost block" data-a="edit">عدّل بياناتي</button></div>
    <div class="card"><div class="list">
      <a class="lrow" href="#calib"><span class="oi">${ic("flask")}</span><span><b>اختبار المعايرة</b><br><span class="xs muted">${S.calib ? "آخر اختبار " + fmtDay(S.calib.ts) : "ما سويته بعد"}</span></span>${ic("next")}</a>
      <button class="lrow" data-a="ai"><span class="oi">${ic("spark")}</span><span><b>تحليل الصور بالذكاء الاصطناعي</b><br><span class="xs muted">${st.provider === "gemini" && st.key ? "مفعّل (Gemini)" : st.provider === "worker" && st.endpoint ? "مفعّل (خادم خاص)" : "غير مفعّل: تشتغل بالبحث"}</span></span>${ic("next")}</button>
      <button class="lrow" data-a="notif"><span class="oi">${ic("bell")}</span><span><b>تنبيهات القياس</b><br><span class="xs muted">${"Notification" in window ? (Notification.permission === "granted" ? "مفعّلة" : "غير مفعّلة") : "غير مدعومة في هذا المتصفح"}</span></span>${ic("next")}</button>
      <button class="lrow" data-a="backup"><span class="oi">${ic("download")}</span><span><b>نسخة احتياطية</b><br><span class="xs muted">بياناتك محفوظة في جهازك فقط</span></span>${ic("next")}</button>
      <button class="lrow" data-a="method"><span class="oi">${ic("book")}</span><span><b>كيف يحسب التطبيق والمصادر</b><br><span class="xs muted">المعادلات والدراسات</span></span>${ic("next")}</button>
    </div></div>
    <div class="note">${ic("shield")}<span>أداة مساعدة لنمط الحياة والتوجيه الغذائي، وليست تشخيصاً ولا بديلاً عن الطبيب. لا تغيّر جرعة أي دواء بناءً عليها.</span></div>
    <p class="xs muted" style="text-align:center">Preventive Glucose AI · نسخة تجريبية ٣</p>
  </section>`;
  $("[data-a=edit]").onclick = () => { startOnboard(true); go("onboard"); };
  $("[data-a=ai]").onclick = openAISettings;
  $("[data-a=notif]").onclick = async () => { if (!("Notification" in window)) return toast("المتصفح ما يدعم التنبيهات"); const r = await Notification.requestPermission(); toast(r === "granted" ? "تفعّلت التنبيهات" : "ما تفعّلت التنبيهات"); viewMe(); };
  $("[data-a=backup]").onclick = openBackup;
  $("[data-a=method]").onclick = openMethod;
}
function openAISettings() {
  const st = S.settings;
  openSheet(`<h2 style="font-size:1.3rem">تحليل الصور</h2>
    <p class="small muted">بدون تحليل، تختار الأكل بالبحث. مع التحليل، يتعرّف على صحنك ويقدّر الكميات تلقائياً.</p>
    <div class="stack" role="radiogroup" aria-label="طريقة التحليل">
      ${[["none", "بدون تحليل", "تختار الأكل يدوياً"], ["gemini", "Google Gemini (مجاني)", "مفتاح مجاني من Google AI Studio"], ["worker", "خادم خاص", "Cloudflare Worker مع Claude"]].map(([k, t, d]) => `<button class="opt" data-p="${k}" aria-pressed="${st.provider === k}" role="radio" aria-checked="${st.provider === k}"><span class="oi">${ic(k === "none" ? "search" : "spark")}</span><span><b>${t}</b><span>${d}</span></span><span class="tick">${ic("check")}</span></button>`).join("")}
    </div>
    <div id="pg" class="stack"></div>
    <div class="grid2"><button class="btn" data-a="test">جرّب الاتصال</button><button class="btn primary" data-a="save">احفظ</button></div>
    <p class="xs muted">المفتاح ينحفظ في جهازك فقط، والصور تنرسل مباشرة لمزوّد التحليل اللي تختاره.</p>`, (sh, close) => {
    let prov = st.provider;
    const fields = () => { $("#pg", sh).innerHTML = prov === "gemini" ? `
      <div class="note info">${ic("spark")}<span>طريقة المفتاح المجاني: افتح <b class="ltr">aistudio.google.com/apikey</b>، سجّل بحساب قوقل، اضغط Create API key، وانسخه هنا.</span></div>
      <div class="field"><label for="ak">مفتاح Gemini</label><input id="ak" class="input" type="password" autocomplete="off" value="${esc(st.key || "")}" style="direction:ltr"></div>
      <div class="field"><label for="am">الموديل</label><input id="am" class="input" value="${esc(st.model || "gemini-3.8-flash")}" style="direction:ltr"></div>` : prov === "worker" ? `
      <div class="field"><label for="ae">رابط الخادم</label><input id="ae" class="input" type="url" placeholder="https://glucose-ai.xxx.workers.dev" value="${esc(st.endpoint || "")}" style="direction:ltr"></div>` : ""; };
    fields();
    $$("[data-p]", sh).forEach(b => b.onclick = () => { prov = b.dataset.p; $$("[data-p]", sh).forEach(x => { x.setAttribute("aria-pressed", x === b); x.setAttribute("aria-checked", x === b); }); fields(); });
    const read = () => ({...S.settings, provider: prov, key: $("#ak", sh)?.value.trim() ?? S.settings.key, model: $("#am", sh)?.value.trim() || S.settings.model, endpoint: $("#ae", sh)?.value.trim() ?? S.settings.endpoint});
    $("[data-a=save]", sh).onclick = async () => { await saveKV("settings", read()); toast("انحفظت الإعدادات"); close(); if (location.hash === "#me") viewMe(); };
    $("[data-a=test]", sh).onclick = async () => { const b = $("[data-a=test]", sh); b.disabled = true; b.textContent = "يجرّب…";
      try { await aiPing(read()); toast("الاتصال شغّال ✓"); } catch (e) { toast("ما اشتغل: " + aiErrText(e)); } b.disabled = false; b.textContent = "جرّب الاتصال"; };
  });
}
function openBackup() {
  openSheet(`<h2 style="font-size:1.3rem">نسخة احتياطية</h2><p class="small muted">بياناتك وصورك محفوظة في هذا المتصفح فقط. لو مسحت بيانات المتصفح أو غيّرت الجوال تضيع، فخذ نسخة كل فترة.</p>
    <button class="btn primary block" data-a="exp">${ic("download")} نزّل نسخة من بياناتي</button>
    <button class="btn block" data-a="imp">${ic("upload")} استرجع من نسخة</button><input type="file" id="impf" accept="application/json,.json" hidden>
    <div class="divider"></div>
    <button class="btn ghost block" data-a="wipe" style="color:var(--gE)">${ic("trash")} امسح كل بياناتي</button>
    <div id="wc" hidden class="note bad"><span><b>متأكد؟ المسح نهائي ولا يمكن التراجع عنه.</b><br><span class="row" style="margin-top:8px"><button class="btn sm primary" data-a="wy">نعم امسح</button><button class="btn sm" data-a="wn">تراجع</button></span></span></div>`, (sh, close) => {
    $("[data-a=exp]", sh).onclick = async () => { const data = {app: "preventive-glucose-ai", v: 3, exported: new Date().toISOString(), profile: S.profile, model: S.model, calib: S.calib, settings: {...S.settings, key: undefined}, meals: S.meals, readings: S.readings};
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], {type: "application/json"})); a.download = "glucose-backup-" + new Date().toISOString().slice(0, 10) + ".json"; document.body.appendChild(a); a.click(); a.remove(); toast("نزلت النسخة"); };
    $("[data-a=imp]", sh).onclick = () => $("#impf", sh).click();
    $("#impf", sh).onchange = async e => { try { const d = JSON.parse(await e.target.files[0].text()); if (!d || d.app !== "preventive-glucose-ai") throw 0;
      for (const k of ["profile", "model", "calib"]) if (d[k]) await saveKV(k, d[k]);
      for (const m of d.meals || []) await Store.put("meals", m); for (const r of d.readings || []) await Store.put("readings", r);
      await loadAll(); toast("رجعت بياناتك"); close(); go("today"); } catch (err) { toast("الملف غير صالح"); } };
    $("[data-a=wipe]", sh).onclick = () => $("#wc", sh).hidden = false;
    $("[data-a=wn]", sh).onclick = () => $("#wc", sh).hidden = true;
    $("[data-a=wy]", sh).onclick = async () => { await Store.clearAll(); Object.assign(S, {profile: null, model: null, calib: null, calibRun: null, meals: [], readings: [], settings: {provider: "none", model: "gemini-3.8-flash"}}); OB.started = false; close(); toast("انمسحت بياناتك"); go("onboard"); };
  });
}
function openMethod() {
  openSheet(`<h2 style="font-size:1.3rem">كيف يحسب التطبيق</h2>
    <ol class="small stack" style="padding-inline-start:20px;margin:0">
      <li><b>حساسيتك</b> = ارتفاع السكر في اختبار الجلوكوز ÷ جرامات الجلوكوز. قبل الاختبار تُقدّر من التراكمي وحالتك.</li>
      <li><b>الحمل الجلايسيمي للوجبة</b> = مجموع (النشويات المتاحة × المؤشر الجلايسيمي ÷ ١٠٠) لكل صنف. المؤشر محسوب أصلاً بالنسبة للجلوكوز، لذلك المعايرة بالجلوكوز تنطبق مباشرة.</li>
      <li><b>الارتفاع المتوقع</b> = حساسيتك × الحمل × معاملات: ترتيب الأكل (Shukla 2015)، المشي بعد الأكل (Reynolds 2016)، البروتين والدهون والألياف، أدويتك، ووقت الوجبة.</li>
      <li><b>التقييم</b>: A قمة تحت ١٤٠ وارتفاع بسيط، B تحت ١٤٥، C تحت ١٦٥، D تحت ١٨٥، E فوقها.</li>
      <li><b>التعلّم</b>: كل قراءة بعد الأكل تعدّل حساسيتك بوزن يقل كل ما زادت قراءاتك، ونطاق الخطأ يضيق.</li>
    </ol>
    <h3>المصادر</h3>
    <div class="list small">
      <a class="lrow" href="https://www.sfda.gov.sa/en/news/5521984" target="_blank" rel="noopener"><span class="oi">${ic("book")}</span><span>جداول تركيب الأغذية السعودية — هيئة الغذاء والدواء ٢٠٢٦</span>${ic("next")}</a>
      <a class="lrow" href="https://pmc.ncbi.nlm.nih.gov/articles/PMC12641437/" target="_blank" rel="noopener"><span class="oi">${ic("book")}</span><span>Basaqr وآخرون، Frontiers in Nutrition ٢٠٢٥</span>${ic("next")}</a>
      <a class="lrow" href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6074203/" target="_blank" rel="noopener"><span class="oi">${ic("book")}</span><span>المؤشر الجلايسيمي لـ١٧ صنف تمر — جامعة القصيم ٢٠١٦</span>${ic("next")}</a>
      <a class="lrow" href="https://link.springer.com/article/10.1007/BF01228083" target="_blank" rel="noopener"><span class="oi">${ic("book")}</span><span>Buchanan & McKiddie، Diabetologia ١٩٦٧</span>${ic("next")}</a>
      <a class="lrow" href="https://doi.org/10.2337/dc15-0429" target="_blank" rel="noopener"><span class="oi">${ic("book")}</span><span>ترتيب الأكل — Shukla وآخرون، Diabetes Care ٢٠١٥</span>${ic("next")}</a>
      <a class="lrow" href="https://doi.org/10.1007/s00125-016-4085-2" target="_blank" rel="noopener"><span class="oi">${ic("book")}</span><span>المشي بعد الأكل — Reynolds وآخرون، Diabetologia ٢٠١٦</span>${ic("next")}</a>
    </div><button class="btn block" data-close>تم</button>`);
}

/* ================= READINGS ================= */
function openReadingSheet(meal) {
  const KINDS = [["fasting", "صائم"], ["pre", "قبل الأكل"], ["post", "بعد الأكل"], ["random", "عشوائية"]];
  let kind = new Date().getHours() < 10 ? "fasting" : "random", followed = false;
  const el = meal ? r0((Date.now() - meal.ts) / 60000) : 0, MINS = [30, 60, 90, 120, 150, 180, 240];
  let mins = meal ? (el >= 20 && el <= 260 ? MINS.reduce((a, b) => Math.abs(b - el) < Math.abs(a - el) ? b : a) : meal.measureAt) : 120;
  openSheet(`<h2 style="font-size:1.3rem">${meal ? "قراءة بعد " + esc(mealName(meal)) : "سجّل قراءة"}</h2>
    ${meal ? `<p class="small muted">كم مر من أول لقمة لين قست؟</p><div class="chips" aria-label="بعد كم دقيقة">${MINS.map(t => `<button class="chip" data-m="${t}" aria-pressed="${t === mins}">${t < 60 ? t + " د" : t % 60 ? Math.floor(t / 60) + " س و" + (t % 60) + " د" : t / 60 + " س"}</button>`).join("")}</div>
      <div class="field"><label for="rm">أو اكتب الدقائق بالضبط</label><input id="rm" class="input" type="number" inputmode="numeric" min="10" max="300" value="${mins}" style="direction:ltr;text-align:right"></div>
      ${meal.combo ? `<button class="check" data-fol aria-pressed="false"><span class="box">${ic("check")}</span><span><b>طبّقت النصايح</b><br><span class="xs muted">${esc((meal.advice || []).slice(0, 2).join("، "))}</span></span></button>` : ""}`
      : `<div class="chips">${KINDS.map(([k, l]) => `<button class="chip" data-k="${k}" aria-pressed="${k === kind}">${l}</button>`).join("")}</div>`}
    <div class="field"><label for="rv">القراءة (ملجم/دسل)</label><input id="rv" class="input bignum" type="number" inputmode="numeric" min="20" max="600" placeholder="000"></div>
    <div id="rmsg"></div>
    <button class="btn primary block" data-a="save">احفظ القراءة</button>`, (sh, close) => {
    $$("[data-m]", sh).forEach(b => b.onclick = () => { mins = +b.dataset.m; $("#rm", sh).value = mins; $$("[data-m]", sh).forEach(x => x.setAttribute("aria-pressed", x === b)); });
    const rm = $("#rm", sh); if (rm) rm.oninput = () => { const v = parseFloat(rm.value); if (isFinite(v) && v >= 10 && v <= 300) { mins = r0(v); $$("[data-m]", sh).forEach(x => x.setAttribute("aria-pressed", +x.dataset.m === mins)); } };
    $$("[data-k]", sh).forEach(b => b.onclick = () => { kind = b.dataset.k; $$("[data-k]", sh).forEach(x => x.setAttribute("aria-pressed", x === b)); });
    const fb = $("[data-fol]", sh); if (fb) fb.onclick = () => { followed = !followed; fb.setAttribute("aria-pressed", followed); };
    $("[data-a=save]", sh).onclick = async () => { const v = parseFloat($("#rv", sh).value);
      if (!isFinite(v) || v < 20 || v > 600) { $("#rmsg", sh).innerHTML = `<div class="note bad">${ic("x")}<span>أدخل رقم بين ٢٠ و٦٠٠.</span></div>`; return; }
      await saveReading({v, kind: meal ? "post" : kind, meal, minutes: mins, followed});
      close();
      if (v < 70) alertSheet("bad", "قراءتك أقل من ٧٠", "هذا هبوط. خذ ١٥ جم سكر سريع (نص كوب عصير أو ٣ تمرات) وأعد القياس بعد ١٥ دقيقة. إذا تكرر كلّم طبيبك.");
      else if (v >= 300) alertSheet("bad", "قراءتك ٣٠٠ أو أكثر", "تواصل مع طبيبك، خصوصاً إذا معها عطش شديد أو تعب أو غثيان.");
      else if (!meal) toast("انحفظت القراءة");
      route(); if (meal) { const r = S.readings[0]; openSheet(`<div class="empty" style="padding-bottom:0"><h2 style="font-size:1.3rem">الفرق عن التوقع</h2></div>
        <div class="kpis"><div class="kpi"><small>توقعنا</small><b class="num">${r.expected}</b></div><div class="kpi"><small>قستَ</small><b class="num">${r.v}</b></div><div class="kpi"><small>الفرق</small><b class="num ${Math.abs(r.v - r.expected) <= 20 ? "gt-A" : "gt-D"}"><span class="ltr">${r.v - r.expected > 0 ? "+" : ""}${r.v - r.expected}</span></b></div></div>
        <p class="muted">${Math.abs(r.v - r.expected) <= 20 ? "التوقع كان قريب. ممتاز." : r.v > r.expected ? "سكرك ارتفع أكثر من المتوقع، فعدّلنا حساسيتك للأعلى. التوقعات الجاية بتكون أدق." : "سكرك أقل من المتوقع، فعدّلنا حساسيتك للأسفل. التوقعات الجاية بتكون أدق."}</p>
        <button class="btn primary block" data-close>تمام</button>`); } };
  });
}
function alertSheet(kind, title, body) { openSheet(`<div class="note ${kind}" style="font-size:1rem">${ic("shield")}<span><b>${esc(title)}</b><br>${esc(body)}</span></div><button class="btn primary block" data-close>فهمت</button>`); }
async function saveReading({v, kind, meal, minutes, followed}) {
  const r = {id: uid("r"), ts: Date.now(), v, kind};
  if (meal) {
    const P = followed && meal.combo ? meal.combo : meal.pred, expected = r0(valAt(P.curve, minutes));
    Object.assign(r, {mealId: meal.id, minutes, followed, expected});
    const md = curModel(), predRise = expected - P.g0, obsRise = v - P.g0;
    if (predRise > 8 && v >= 70) { const ratio = clamp(obsRise / predRise, 0.4, 2.5), w = 1 / ((md.n || 0) + 4); md.s = Math.exp(Math.log(md.s) + w * Math.log(Math.max(0.05, ratio))); }
    const rs = [...mealReadings(meal), r], a = rs.find(x => x.minutes === 60), b = rs.find(x => x.minutes === 120);
    if (a && b && !meal.tpAdjusted) { if (b.v > a.v) md.tpG = Math.min(110, md.tpG + 6); else if (b.v < a.v - 30) md.tpG = Math.max(20, md.tpG - 4); meal.tpAdjusted = true; await Store.put("meals", meal); }
    md.n = (md.n || 0) + 1; md.log = (md.log || []).slice(-60).concat([{ts: r.ts, minutes, v, expected}]);
    await saveKV("model", md);
  }
  await Store.put("readings", r); S.readings.unshift(r);
}

/* ================= MEAL DETAIL ================= */
function openMealSheet(m) {
  if (!m) return;
  const rs = mealReadings(m), st = mealStatus(m);
  const series = [{pts: m.pred.curve, color: "var(--brand2)", band: 0.18, g0: m.pred.g0, peak: [m.pred.tp, m.pred.peak]}];
  if (m.combo) series.push({pts: m.combo.curve, color: "var(--gA)", dash: "7 6"});
  if (rs.length) series.push({pts: rs.map(r => [r.minutes, r.v]), color: "var(--saffron)", dots: true, line: false, labels: true, r: 7});
  openSheet(`${m.photo ? `<img src="${m.photo}" alt="" style="border-radius:22px;width:100%;aspect-ratio:4/3;object-fit:cover">` : ""}
    <div class="row between"><div><h2 style="font-size:1.25rem">${esc(mealName(m))}</h2><span class="small muted">${fmtDay(m.ts)} · ${fmtTime(m.ts)}</span></div><span class="grade g-${m.grade}">${m.grade}</span></div>
    <div class="card flat"><div class="chart">${curveSVG(series)}</div>
      <div class="legend"><span><i class="dot" style="background:var(--brand2)"></i>المتوقع</span>${m.combo ? `<span><i class="dot" style="background:var(--gA)"></i>مع النصايح</span>` : ""}${rs.length ? `<span><i class="dot" style="background:var(--saffron)"></i>قراءاتك</span>` : ""}</div></div>
    <div class="kpis"><div class="kpi"><small>قمة متوقعة</small><b class="num">${r0(m.pred.peak)}</b></div><div class="kpi"><small>عند</small><b class="num">${r0(m.pred.tp)} د</b></div><div class="kpi"><small>قراءات</small><b class="num">${rs.length}</b></div></div>
    ${rs.length ? `<div class="card flat"><h3>قراءاتك مقابل التوقع</h3><div class="scroll-x"><table class="tbl"><tr><th>بعد</th><th>قستَ</th><th>توقعنا</th><th>الفرق</th></tr>${rs.map(r => { const d = r.v - (r.expected ?? r.v); return `<tr><td class="num">${r.minutes} د</td><td class="num"><b>${r.v}</b></td><td class="num">${r.expected ?? "—"}</td><td class="num ${Math.abs(d) <= 20 ? "gt-A" : "gt-D"}"><span class="ltr">${d > 0 ? "+" : ""}${d}</span></td></tr>`; }).join("")}</table></div>${rs.some(r => r.followed) ? `<p class="xs muted">القراءات اللي طبّقت فيها النصايح مقارنة بالمنحنى الأخضر.</p>` : ""}</div>` : ""}
    <div class="card flat"><div class="list">${m.items.map(it => `<div class="lrow"><span class="oi">${ic("bowl")}</span><span>${esc(it.name)}</span><span class="small muted num">${r0(it.grams)} جم</span></div>`).join("")}</div></div>
    ${m.advice && m.advice.length ? `<div class="note ok">${ic("leaf")}<span>${m.advice.map(esc).join("<br>")}</span></div>` : ""}
    <button class="btn primary block" data-a="read">${ic("drop")} ${rs.length ? "أضف قراءة ثانية" : st.k === "wait" ? `أضف قراءة (الموعد بعد ${st.mins} د)` : "أضف قراءة بعد الأكل"}</button>
    <button class="btn block" data-a="edit">${ic("gear")} عدّل الوجبة (الأصناف أو الكميات)</button>
    <button class="btn ghost block" data-a="del" style="color:var(--gE)">${ic("trash")} احذف الوجبة</button>
    <div id="dc" hidden class="note bad"><span><b>تحذف الوجبة وقراءاتها؟</b><br><span class="row" style="margin-top:8px"><button class="btn sm primary" data-a="dy">احذف</button><button class="btn sm" data-a="dn">تراجع</button></span></span></div>`, (sh, close) => {
    $("[data-a=read]", sh).onclick = () => { close(); openReadingSheet(m); };
    $("[data-a=edit]", sh).onclick = () => { close(); editMeal(m); };
    $("[data-a=del]", sh).onclick = () => $("#dc", sh).hidden = false;
    $("[data-a=dn]", sh).onclick = () => $("#dc", sh).hidden = true;
    $("[data-a=dy]", sh).onclick = async () => { await Store.remove("meals", m.id); for (const r of rs) await Store.remove("readings", r.id);
      S.meals = S.meals.filter(x => x.id !== m.id); S.readings = S.readings.filter(r => r.mealId !== m.id); close(); toast("انحذفت الوجبة"); route(); };
  });
}

function editMeal(m) {
  S.scan = {stage: "items", photo: m.photo, b64: null, items: m.items.map(it => FOODS[it.key] ? scanItem(it.key, it.grams) : {key: "other", name: it.name, data: it.data, grams: it.grams}),
    tray: false, share: 1, ctx: {order: "mixed", walk: "0", time: "noon", ...m.ctx, state: {...((m.ctx || {}).state || {})}}, pre: m.pre ?? null, q: "", cat: "all", aiNote: "", err: "", editId: m.id};
  go("scan");
}
/* ================= ONBOARDING ================= */
const OB = {started: false, i: 0, d: {}, edit: false};
const OB_STEPS = ["welcome", "who", "name", "body", "dx", "meds", "cond", "labs", "device", "plan"];
function startOnboard(edit) { OB.started = true; OB.edit = edit; OB.d = edit && S.profile ? JSON.parse(JSON.stringify(S.profile)) : {meds: {}, cond: {}, sex: "m"}; OB.i = edit ? 1 : 0; }
function opt(key, val, icon, title, desc, multi) {
  const on = multi ? !!(OB.d[key] || {})[val] : OB.d[key] === val;
  return `<button class="opt" data-k="${key}" data-v="${val}" ${multi ? "data-multi" : ""} aria-pressed="${on}"><span class="oi">${ic(icon)}</span><span><b>${title}</b>${desc ? `<span>${desc}</span>` : ""}</span><span class="tick">${ic("check")}</span></button>`;
}
const OBV = {
  welcome: () => ({title: "", body: `
    <div class="row" style="gap:10px"><img src="icon.svg" width="44" height="44" alt="" style="border-radius:14px"><b style="font-family:var(--f-d);font-size:1.1rem">Preventive Glucose AI</b></div>
    <div class="welcome-art">
      <svg viewBox="0 0 320 150" aria-hidden="true"><path d="M10 120 C70 120 90 30 150 30 C210 30 220 100 310 95" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="10" stroke-linecap="round"/><path d="M10 120 C80 120 100 70 150 70 C200 70 230 105 310 103" fill="none" stroke="#F4C46A" stroke-width="10" stroke-linecap="round"/><circle cx="150" cy="30" r="9" fill="rgba(255,255,255,.6)"/><circle cx="150" cy="70" r="9" fill="#fff"/></svg>
      <h2 style="font-size:1.7rem">اعرف وش يسوي الأكل في سكرك، قبل ما تاكل</h2>
      <p style="opacity:.9">صوّر صحنك، ونعطيك منحنى سكرك المتوقع وأقوى خطوة تنزّل القمة.</p>
    </div>
    <div class="stack">
      <div class="feat"><span class="oi">${ic("camera")}</span><span><b>صوّر وجبتك</b><br><span class="small muted">كبسة، جريش، مطبق… أكثر من ١٥٠ صنف سعودي</span></span></div>
      <div class="feat"><span class="oi">${ic("flask")}</span><span><b>نتعرّف على جسمك</b><br><span class="small muted">اختبار جلوكوز واحد، وقراءات بعد الأكل</span></span></div>
      <div class="feat"><span class="oi">${ic("leaf")}</span><span><b>خطوة واحدة تفرق</b><br><span class="small muted">ترتيب الأكل، بديل أخف، أو مشي ١٠ دقائق</span></span></div>
    </div>`, cta: "ابدأ", valid: () => true}),
  who: () => ({title: "مين بيستخدم التطبيق؟", sub: "نضبط الشاشات حسب المستخدم.", body: `<div class="stack">${opt("who", "self", "user", "أنا", "أتابع سكري بنفسي")}${opt("who", "care", "family", "أتابع أحد أهلي", "أبوي، أمي، أو أحد كبار السن")}</div>`, valid: () => !!OB.d.who}),
  name: () => ({title: OB.d.who === "care" ? "وش اسم اللي تتابعه؟" : "وش نناديك؟", sub: "يظهر في الشاشة الرئيسية فقط.", body: `<div class="field"><label for="ob-name">الاسم</label><input id="ob-name" class="input" autocomplete="given-name" value="${esc(OB.d.name || "")}" placeholder="مثلاً: أبو محمد"></div>`, valid: () => (OB.d.name || "").trim().length > 1,
    bind: r => $("#ob-name", r).oninput = e => { OB.d.name = e.target.value; obValid(); }}),
  body: () => ({title: "معلومات الجسم", sub: "تحدد نقطة البداية لتوقعاتك.", body: `
    <div class="chips">${[["m", "ذكر"], ["f", "أنثى"]].map(([v, l]) => `<button class="chip" data-sex="${v}" aria-pressed="${OB.d.sex === v}">${l}</button>`).join("")}</div>
    ${[["age", "العمر", "سنة", 10, 110], ["height", "الطول", "سم", 100, 230], ["weight", "الوزن", "كجم", 30, 300]].map(([k, l, u, a, b]) => `<div class="field"><label for="ob-${k}">${l}</label><div class="unitbox"><input id="ob-${k}" type="number" inputmode="decimal" min="${a}" max="${b}" value="${OB.d[k] ?? ""}"><span>${u}</span></div></div>`).join("")}
    <div id="ob-bmi" class="small muted"></div>`,
    valid: () => OB.d.age >= 10 && OB.d.age <= 110 && OB.d.height >= 100 && OB.d.height <= 230 && OB.d.weight >= 30 && OB.d.weight <= 300,
    bind: r => { const showB = () => { const b = bmi(OB.d); $("#ob-bmi", r).innerHTML = b ? `مؤشر كتلة الجسم <b class="num">${r1(b)}</b> — ${b < 25 ? "طبيعي" : b < 30 ? "زيادة وزن" : "سمنة"}` : ""; };
      ["age", "height", "weight"].forEach(k => $("#ob-" + k, r).oninput = e => { const v = parseFloat(e.target.value); OB.d[k] = isFinite(v) ? v : null; showB(); obValid(); });
      $$("[data-sex]", r).forEach(b => b.onclick = () => { OB.d.sex = b.dataset.sex; $$("[data-sex]", r).forEach(x => x.setAttribute("aria-pressed", x === b)); }); showB(); }}),
  dx: () => ({title: "وش آخر تشخيص؟", sub: "حسب آخر زيارة للطبيب أو تحليل.", body: `<div class="stack">
    ${opt("status", "none", "shield", "ما عندي تشخيص", "أبي الوقاية")}${opt("status", "pre", "drop", "ما قبل السكري", "تراكمي بين ٥٫٧ و٦٫٤")}${opt("status", "t2", "drop", "سكري النوع الثاني", "")}${opt("status", "t1", "drop", "سكري النوع الأول", "")}${opt("status", "gdm", "heart", "سكري الحمل / حامل", "")}</div>`, valid: () => !!OB.d.status}),
  meds: () => ({title: "أدوية السكر", sub: "اختر كل اللي تاخذه، أو تخطَّ إذا ما فيه.", body: `<div class="stack">
    ${opt("meds", "met", "pill", "ميتفورمين", "جلوكوفاج وغيره", 1)}${opt("meds", "glp", "pill", "GLP-1", "أوزمبك، مونجارو، ساكسندا", 1)}${opt("meds", "sglt", "pill", "SGLT2", "جارديانس، فورسيجا", 1)}${opt("meds", "acar", "pill", "أكاربوز", "جلوكوباي", 1)}${opt("meds", "su", "pill", "سلفونيل يوريا", "أماريل، دايمكرون", 1)}${opt("meds", "ins", "pill", "إنسولين", "أي نوع", 1)}</div>`, valid: () => true, cta: () => Object.values(OB.d.meds || {}).some(Boolean) ? "التالي" : "ما آخذ أدوية سكر"}),
  cond: () => ({title: "حالات تحتاج انتباه", sub: "لسلامتك نحتاج نعرفها.", body: `<div class="stack">
    ${opt("cond", "preg", "heart", "حمل", "", 1)}${opt("cond", "ckd", "shield", "مرض كلى متقدم أو غسيل", "", 1)}${opt("cond", "hypo", "drop", "نوبات هبوط متكررة", "دوخة وتعرّق ورجفة", 1)}</div>`, valid: () => true, cta: () => Object.values(OB.d.cond || {}).some(Boolean) ? "التالي" : "ما عندي أي منها"}),
  labs: () => ({title: "آخر تحاليلك", sub: "اختياري، لكنها تحسّن التوقع من البداية.", body: `
    <div class="field"><label for="ob-a1c">التراكمي HbA1c</label><div class="unitbox"><input id="ob-a1c" type="number" step="0.1" inputmode="decimal" min="3" max="15" value="${OB.d.a1c ?? ""}"><span>%</span></div></div>
    <div class="field"><label for="ob-fbg">السكر الصائم</label><div class="unitbox"><input id="ob-fbg" type="number" inputmode="numeric" min="40" max="400" value="${OB.d.fbg ?? ""}"><span>ملجم/دسل</span></div></div>`, valid: () => true,
    cta: () => OB.d.a1c || OB.d.fbg ? "التالي" : "ما أعرفها، تخطَّ",
    bind: r => ["a1c", "fbg"].forEach(k => $("#ob-" + k, r).oninput = e => { const v = parseFloat(e.target.value); OB.d[k] = isFinite(v) ? v : null; obValid(); })}),
  device: () => ({title: "وش تستخدم للقياس؟", sub: "التوقع يتحسن لما تقيس بعد الأكل.", body: `<div class="stack">
    ${opt("device", "meter", "meter", "جهاز وخز", "أكيو تشيك، كونتور وغيرها")}${opt("device", "cgm", "sensor", "حساس مستمر", "فري ستايل ليبري أو غيره")}${opt("device", "none", "x", "ما عندي جهاز", "متوفر في الصيدليات بسعر بسيط")}</div>`, valid: () => !!OB.d.device}),
  plan: () => { const p = {...OB.d, name: (OB.d.name || "").trim()}, g = gateOf(p), [ok, calMsg] = calAllowed(p), cls = {ok: "ok", caution: "", stop: "bad"}[g.level];
    return {title: g.level === "stop" ? "وضع المعلومات" : "خطتك جاهزة", sub: g.level === "stop" ? "لسلامتك، التوقعات متوقفة لحالتك." : "ثلاث خطوات وتصير التوقعات على مقاسك.", body: `
    ${g.msgs.length ? `<div class="note ${cls}">${ic("shield")}<span>${g.msgs.map(esc).join("<br>")}</span></div>` : `<div class="note ok">${ic("shield")}<span>ما فيه موانع ظاهرة. التطبيق مناسب لك.</span></div>`}
    ${g.level !== "stop" ? `<div class="stack">
      <div class="feat"><span class="oi">${ic("flask")}</span><span><b>١. اختبار المعايرة</b><br><span class="small muted">${ok ? "٥٠ جم جلوكوز صباحاً على الريق، وأربع قراءات خلال ساعتين." + (calMsg ? " " + calMsg : "") : esc(calMsg) + " نكمل بالتقدير الأولي ويتعلم من قراءاتك."}</span></span></div>
      <div class="feat"><span class="oi">${ic("camera")}</span><span><b>٢. صوّر ٧ وجبات</b><br><span class="small muted">وقِس بعدها بالوقت اللي نحدده لك</span></span></div>
      <div class="feat"><span class="oi">${ic("chart")}</span><span><b>٣. شوف رؤاك</b><br><span class="small muted">الأكلات اللي ترفع سكرك أنت تحديداً</span></span></div></div>` : ""}
    <p class="xs muted">أداة مساعدة لنمط الحياة، وليست تشخيصاً ولا بديلاً عن الطبيب. لا تغيّر جرعة أي دواء بناءً عليها.</p>`, valid: () => true, cta: OB.edit ? "احفظ التعديلات" : "ابدأ"}; }
};
function obValid() { const s = OBV[OB_STEPS[OB.i]](), b = $("#ob-next"); if (b) { b.disabled = !s.valid(); if (typeof s.cta === "function") b.textContent = s.cta(); } }
function renderOnboard() {
  const key = OB_STEPS[OB.i], s = OBV[key](), pct = OB.i / (OB_STEPS.length - 1) * 100;
  const cta = typeof s.cta === "function" ? s.cta() : (s.cta || "التالي");
  $("#flow").innerHTML = `<div class="wrap">
    <div class="flowhead">${OB.i > (OB.edit ? 1 : 0) ? `<button class="iconbtn" id="ob-back" aria-label="رجوع">${ic("back")}</button>` : OB.edit ? `<button class="iconbtn" id="ob-close" aria-label="إغلاق">${ic("x")}</button>` : ""}${key !== "welcome" ? `<div class="progress"><i style="width:${pct}%"></i></div>` : ""}</div>
    <div class="flowbody">${s.title ? `<h2>${s.title}</h2>` : ""}${s.sub ? `<p class="sub">${s.sub}</p>` : ""}${s.body}</div>
    <div class="flowfoot"><button class="btn primary block" id="ob-next">${cta}</button></div></div>`;
  const root = $("#flow");
  $$(".opt[data-k]", root).forEach(b => b.onclick = () => { const k = b.dataset.k, v = b.dataset.v;
    if (b.hasAttribute("data-multi")) { OB.d[k] = OB.d[k] || {}; OB.d[k][v] = !OB.d[k][v]; b.setAttribute("aria-pressed", OB.d[k][v]); }
    else { OB.d[k] = v; $$(`.opt[data-k="${k}"]`, root).forEach(x => x.setAttribute("aria-pressed", x === b)); if (["who", "dx", "device"].includes(key)) setTimeout(() => { if (OBV[key]().valid()) obNext(); }, 220); }
    obValid(); });
  s.bind && s.bind(root);
  $("#ob-back") && ($("#ob-back").onclick = () => { OB.i--; renderOnboard(); });
  $("#ob-close") && ($("#ob-close").onclick = () => { OB.started = false; go("me"); });
  $("#ob-next").onclick = obNext; obValid();
  const inp = $("input", root); if (inp && key !== "welcome") setTimeout(() => inp.focus({preventScroll: true}), 50);
}
async function obNext() {
  const s = OBV[OB_STEPS[OB.i]](); if (!s.valid()) return;
  if (OB.i < OB_STEPS.length - 1) { OB.i++; renderOnboard(); $("#flow").scrollTop = 0; return; }
  const p = {...OB.d, name: (OB.d.name || "").trim(), updated: Date.now()};
  const old = S.profile; await saveKV("profile", p);
  if (!S.model || !S.model.calibrated) await saveKV("model", priorModel(p));
  else if (old && p.fbg && p.fbg !== old.fbg && !S.calib) { S.model.g0 = p.fbg; await saveKV("model", S.model); }
  OB.started = false; toast(OB.edit ? "انحفظت بياناتك" : "أهلاً " + p.name.split(" ")[0]); go("today");
}

/* ================= SCAN FLOW ================= */
function newScan() { S.scan = {stage: "photo", photo: null, b64: null, items: [], tray: false, share: 1, ctx: {order: "mixed", walk: "0", time: autoTime(), state: {}}, pre: null, q: "", cat: "all", aiNote: "", err: ""}; }
function scanItem(key, grams, extra = {}) { const F = FOODS[key]; return {key, name: F.ar, data: F, grams, ...extra}; }
const eff = sc => sc.items.map(it => ({g: it.grams * (sc.tray ? sc.share : 1), data: it.data, it}));
function aiReady() { const s = S.settings; return (s.provider === "gemini" && !!s.key) || (s.provider === "worker" && !!s.endpoint); }
function renderScan() {
  if (!S.scan) newScan();
  const sc = S.scan, gate = gateOf(S.profile || {});
  const stages = ["photo", "items", "context", "result"], idx = Math.max(0, stages.indexOf(sc.stage === "analyzing" ? "photo" : sc.stage));
  const head = `<div class="flowhead"><button class="iconbtn" id="sc-back" aria-label="${idx === 0 ? "إغلاق" : "رجوع"}">${ic(idx === 0 ? "x" : "back")}</button><div class="progress"><i style="width:${(idx + 1) / 4 * 100}%"></i></div></div>`;
  let body = "", foot = "";
  if (sc.stage === "photo" || sc.stage === "analyzing") {
    const busy = sc.stage === "analyzing";
    body = `<h2>${busy ? "نحلل صحنك…" : "صوّر صحنك"}</h2><p class="sub">${busy ? "نتعرّف على الأصناف ونقدّر الكميات." : "صورة من فوق، والصحن كامل داخل الإطار."}</p>
      <div class="camzone">${sc.photo ? `<img src="${sc.photo}" alt="صورة الوجبة">${busy ? `<div class="scanline"></div>` : `<div class="shade"><button class="btn sm" id="sc-retake">${ic("camera")} صورة ثانية</button></div>`}` :
        `<span class="empty" style="padding:0"><span class="art">${ic("camera")}</span></span>
         <button class="btn primary" id="sc-cam">${ic("camera")} التقط صورة</button>
         <button class="btn ghost sm" id="sc-gal">${ic("image")} من الصور</button>`}</div>
      <input type="file" id="sc-f1" accept="image/*" capture="environment" hidden><input type="file" id="sc-f2" accept="image/*" hidden>
      ${sc.err ? `<div class="note bad">${ic("x")}<span>${esc(sc.err)}</span></div>` : ""}
      ${!aiReady() && !busy ? `<div class="note info">${ic("spark")}<span>التحليل التلقائي غير مفعّل، فبتختار الأصناف بنفسك بعد الصورة. تقدر تفعّله مجاناً من حسابي ← تحليل الصور.</span></div>` : ""}`;
    foot = busy ? `<button class="btn block" id="sc-skip">أوقف وأختار بنفسي</button>` :
      `${sc.photo ? `<button class="btn primary block" id="sc-go">${aiReady() ? ic("spark") + " حلّل الصورة" : "التالي: حدد الأكل"}</button>` : ""}<button class="btn ghost block" id="sc-nophoto">بدون صورة، أختار الأكل</button>`;
  } else if (sc.stage === "items") {
    body = `<h2>وش في صحنك؟</h2><p class="sub">عدّل الحصص، وأضف أي صنف ناقص.</p>
      ${sc.aiNote ? `<div class="note ok">${ic("spark")}<span>${esc(sc.aiNote)}</span></div>` : ""}
      <div class="stack" id="sc-items">${sc.items.map((it, i) => itemCard(it, i)).join("") || `<div class="card flat"><p class="small muted">ما فيه أصناف بعد. ابحث تحت وأضف.</p></div>`}</div>
      ${sc.items.length ? `<button class="check" id="sc-tray" aria-pressed="${sc.tray}"><span class="box">${ic("check")}</span><span><b>الأكل في صينية مشتركة</b><br><span class="xs muted">نحسب نصيبك أنت فقط</span></span></button>
      ${sc.tray ? `<div class="chips" aria-label="نصيبك">${[[0.25, "ربع الصينية"], [0.33, "ثلث"], [0.5, "نص"], [1, "كلها لي"]].map(([v, l]) => `<button class="chip" data-share="${v}" aria-pressed="${sc.share === v}">${l}</button>`).join("")}</div>` : ""}` : ""}
      <div class="divider"></div><h3>أضف صنف</h3>
      <label class="searchbox">${ic("search")}<input id="sc-q" type="search" placeholder="ابحث: رز، مطبق، تمر…" value="${esc(sc.q)}" aria-label="ابحث عن صنف"></label>
      <div class="chips">${CATS.map(([k, l]) => `<button class="chip" data-cat="${k}" aria-pressed="${sc.cat === k}">${l}</button>`).join("")}</div>
      <div class="results" id="sc-res"></div>`;
    foot = `<button class="btn primary block" id="sc-next" ${sc.items.some(i => i.grams > 0) ? "" : "disabled"}>التالي</button>`;
  } else if (sc.stage === "context") {
    const c = sc.ctx, b = (k, v, icon, l) => `<button data-c="${k}" data-v="${v}" aria-pressed="${c[k] === v}">${ic(icon)}${l}</button>`;
    body = `<h2>كيف بتاكل؟</h2><p class="sub">نفس الوجبة يتغير أثرها حسب طريقتك.</p>
      <h3>وش بتبدأ فيه؟</h3><div class="ctxopt">${b("order", "carb", "bowl", "النشويات أول")}${b("order", "mixed", "swap", "كله مع بعض")}${b("order", "veg", "leaf", "السلطة واللحم أول")}</div>
      <h3>بعد الأكل؟</h3><div class="ctxopt">${b("walk", "0", "sit", "جلوس")}${b("walk", "10", "walk", "مشي ١٠ د")}${b("walk", "20", "walk", "مشي ٢٠ د")}</div>
      <h3>وقت الوجبة</h3><div class="chips">${[["morning", "فطور"], ["noon", "غداء"], ["evening", "عشاء"], ["iftar", "إفطار صائم"]].map(([v, l]) => `<button class="chip" data-t="${v}" aria-pressed="${c.time === v}">${l}</button>`).join("")}</div>
      <h3>حالتك اليوم</h3><div class="stack">${[["water", "drop", "شربت ماء كافي اليوم", "أقل من ٦ أكواب؟ اتركها فاضية"], ["prev", "clock", "أكلت شي قبل أقل من ٣ ساعات", "وجبة أو حلا أو عصير"], ["sleep", "moon", "نومي أمس ناقص", "أقل من ٦ ساعات"], ["stress", "heart", "مريض أو متوتر اليوم", "الزكام والتوتر يرفعون السكر"], ["ex", "walk", "تمرنت اليوم", "مشي ٣٠ دقيقة أو أكثر"]].map(([k, i, t, d]) => `<button class="check" data-s="${k}" aria-pressed="${!!c.state[k]}"><span class="box">${ic("check")}</span><span><b>${t}</b><br><span class="xs muted">${d}</span></span></button>`).join("")}</div>
      <div class="field"><label for="sc-pre">قراءتك قبل الأكل (اختياري، تحسّن الدقة)</label><input id="sc-pre" class="input" type="number" inputmode="numeric" min="40" max="400" placeholder="ملجم/دسل" value="${sc.pre ?? ""}" style="direction:ltr;text-align:right"></div>`;
    foot = `<button class="btn primary block" id="sc-next">${ic("spark")} شوف التوقع</button>`;
  } else if (sc.stage === "result") {
    const R = scanResult(); sc.R = R;
    if (R.stop) { body = `<h2>التوقعات متوقفة</h2><div class="note bad">${ic("shield")}<span>${esc(gate.msgs[0])}</span></div><div class="card flat"><div class="kpis"><div class="kpi"><small>نشويات</small><b class="num">${r0(R.T.c)} جم</b></div><div class="kpi"><small>سعرات</small><b class="num">${r0(R.T.kcal)}</b></div><div class="kpi"><small>بروتين</small><b class="num">${r0(R.T.p)} جم</b></div></div></div>`; foot = `<button class="btn block" id="sc-done">إغلاق</button>`; }
    else if (R.hypo) { body = `<h2>عالج الهبوط أولاً</h2><div class="note bad">${ic("drop")}<span>قراءتك قبل الأكل أقل من ٧٠. خذ ١٥ جم سكر سريع وأعد القياس بعد ١٥ دقيقة، بعدها كمّل.</span></div>`; foot = `<button class="btn block" id="sc-backctx">رجوع</button>`; }
    else {
      const p = R.pred, g = p.grade;
      body = `<div class="verdict gs-${g}"><span class="grade lg g-${g}">${g}</span><div><span class="small" style="color:var(--ink2)">تقييم الوجبة</span><h2>${GRADE_TXT[g]}</h2><span class="small">قمة متوقعة <b class="num">${r0(p.peak)}</b> بعد <b class="num">${r0(p.tp)}</b> دقيقة</span></div></div>
        ${!curModel().calibrated ? `<div class="note">${ic("flask")}<span>التوقع الآن تقدير أولي. بعد اختبار المعايرة يصير على مقاس جسمك.</span></div>` : ""}
        <div class="doit"><span class="xs" style="opacity:.75">افعل هذا الآن</span><p>${esc(R.doTxt)}</p><button class="btn sm saffron" id="sc-say" style="align-self:flex-start">${ic("bell")} اسمعها بصوت</button></div>
        <div class="card"><div class="chart">${curveSVG(R.series)}</div>
          <div class="legend"><span><i class="dot" style="background:var(--brand2)"></i>كما هي</span>${R.combo ? `<span><i class="dot" style="background:var(--gA)"></i>مع النصايح: <b class="num">${r0(R.combo.peak)}</b> (${R.combo.grade})</span>` : ""}</div>
          <div class="kpis"><div class="kpi"><small>نشويات</small><b class="num">${r0(p.T.c)} جم</b></div><div class="kpi"><small>بعد ساعتين</small><b class="num">${r0(valAt(p.curve, 120))}</b></div><div class="kpi"><small>سعرات</small><b class="num">${r0(p.T.kcal)}</b></div></div>
          <p class="xs muted">النطاق المظلل هامش الخطأ الحالي (±${r0(p.cv * 100)}٪ من الارتفاع).</p></div>
        ${planHTML(R, sc)}
        ${R.careful && sc.ctx.walk !== "0" ? `<div class="note">${ic("walk")}<span>المشي بعد الأكل مع أدويتك ممكن ينزّل السكر زيادة. خلّ معك تمر أو عصير صغير.</span></div>` : ""}`;
      foot = `<button class="btn primary block" id="sc-save">${ic("check")} ${sc.editId ? "احفظ التعديلات" : "احفظ الوجبة · قِس بعد " + R.measureAt + " د"}</button>`;
    }
  }
  $("#flow").innerHTML = `<div class="wrap">${head}<div class="flowbody">${body}</div><div class="flowfoot">${foot}</div></div>`;
  bindScan();
}
function itemCard(it, i) {
  const F = it.data, u = F.unit, g = it.grams, frac = g / u[1];
  const gl = Math.max(0, F.c - F.f) * g * (S.scan.tray ? S.scan.share : 1) / 100 * F.gi / 100, lv = gl < 8 ? "A" : gl < 20 ? "C" : "E";
  return `<div class="item"><div class="head"><i class="dot g-${lv}" aria-hidden="true"></i><span style="min-width:0"><b>${esc(it.name)}</b>${it.conf != null ? ` <span class="pill ${it.conf >= 0.7 ? "gs-A gt-A" : it.conf >= 0.4 ? "gs-C gt-C" : "gs-E gt-E"}">ثقة ${r0(it.conf * 100)}٪</span>` : ""}<br><span class="xs muted">${esc(SRC_NAME[F.src] || "")} · ${lv === "A" ? "خفيف" : lv === "C" ? "متوسط" : "ثقيل"} على السكر</span></span>
    <button class="iconbtn" style="width:36px;height:36px;box-shadow:none;background:var(--surface2)" data-rm="${i}" aria-label="احذف ${esc(it.name)}">${ic("x")}</button></div>
    <div class="row between"><span class="small muted">الحصة: ${esc(u[0])} (${u[1]} جم)</span><div class="stepper"><button data-st="${i}" data-d="-1" aria-label="أنقص">${ic("minus")}</button><output class="num">${r0(g)} جم</output><button data-st="${i}" data-d="1" aria-label="زِد">${ic("plus")}</button></div></div>
    <div class="portion" role="group" aria-label="عدد الحصص">${[[0.25, "¼"], [0.5, "½"], [1, "1"], [1.5, "1½"], [2, "2"], [3, "3"]].map(([f, l]) => `<button data-po="${i}" data-f="${f}" aria-pressed="${Math.abs(frac - f) < 0.01}">${l} ${esc(u[0])}</button>`).join("")}</div></div>`;
}
function planHTML(R, sc) {
  const st = sc.ctx.state || {}, G = {before: [], during: [], after: []};
  if (!st.water) G.before.push({label: "اشرب كوب ماء قبل الأكل بربع ساعة", detail: "يساعدك تشبع أسرع وتاكل أقل من النشويات."});
  if (st.prev) G.before.push({label: "أكلت قبل شوي: خفف النشويات هالمرة", detail: "سكرك ممكن يكون ما رجع لمستواه."});
  R.vs.forEach((v, i) => G[v.when || "before"].push({...v, i}));
  G.after.push({label: `قِس سكرك بعد ${R.measureAt} دقيقة من أول لقمة`, detail: "قراءتك تعلّم النموذج جسمك وتعرف الفرق عن التوقع."});
  const sec = (k, t, icon) => G[k].length ? `<div class="stack"><div class="row" style="gap:8px"><span class="pill" style="background:var(--brand-soft);color:var(--brand)">${ic(icon)} ${t}</span></div>${G[k].map(v => `<div class="swap">${v.gain ? `<span class="pill gs-A gt-A"><span class="ltr">−${r0(v.gain)}</span></span>` : `<span class="pill">${ic("check")}</span>`}<span><b>${esc(v.label)}</b><br><span class="xs muted">${esc(v.detail)}</span></span>${v.applicable ? `<button class="btn sm" data-apply="${v.i}">طبّق</button>` : "<span></span>"}</div>`).join("")}</div>` : "";
  return `<div class="card"><h3>خطة الوجبة</h3><p class="xs muted">الرقم الأخضر = كم تنزّل القمة المتوقعة (ملجم/دسل). «طبّق» يحدّث التوقع فوق.</p>
    ${sec("before", "قبل الأكل", "clock")}${sec("during", "أثناء الأكل", "bowl")}${sec("after", "بعد الأكل", "walk")}
    ${R.careful ? `<p class="xs muted">ما اقترحنا تقليل النشويات لأن أدويتك ممكن تسبب هبوط إذا قلّت الكمية بدون تعديل من الطبيب.</p>` : ""}</div>`;
}
function variants(items, ctx, careful) {
  const out = [];
  if (ctx.order !== "veg") out.push({id: "order", label: "ابدأ بالسلطة واللحم، وخلّ الرز والخبز آخر شي", detail: "كل الخضار والبروتين أول ١٠ دقائق، بعدها النشويات.", ctx: {order: "veg"}, applicable: true, when: "during"});
  if (ctx.walk === "0") out.push({id: "walk", label: "امشِ ١٠ دقائق بعد الأكل", detail: "خلال ربع ساعة من آخر لقمة. داخل البيت أو للمسجد يكفي.", ctx: {walk: "10"}, applicable: true, when: "after"});
  for (const x of items) { const sw = SWAPS[x.it.key]; if (!sw || x.g <= 0) continue; const [to, k, label] = sw;
    out.push({id: "swap-" + x.it.key, label: "بدّل: " + label, detail: `${FOODS[to].ar} تقريباً ${r0(x.g * k)} جم بدل ${x.it.name}.`, map: y => y.it === x.it ? {g: y.g * k, data: FOODS[to], it: {...scanItem(to, y.it.grams * k)}} : y, swapFor: x.it, to, k, applicable: true, when: "before"}); }
  if (!careful && items.some(x => x.data.c - x.data.f > 10 && !x.data.liquid && x.data.gi > 0))
    out.push({id: "less", label: "قلّل النشويات ربعاً", detail: "من صحن كامل لثلاثة أرباع، وزوّد السلطة أو البروتين بدالها.", map: y => (y.data.c - y.data.f > 10 && !y.data.liquid && y.data.gi > 0) ? {...y, g: y.g * 0.75} : y, applicable: true, when: "before"});
  return out;
}
function applyVs(items, ctx, vs) { let c = {...ctx}, its = items; for (const v of vs) { if (v.ctx) c = {...c, ...v.ctx}; if (v.map) its = its.map(v.map); } return [its, c]; }
function scanResult() {
  const sc = S.scan, prof = S.profile || EXAMPLE, model = curModel(), gate = gateOf(prof), items = eff(sc);
  if (gate.level === "stop") return {stop: true, T: totals(items)};
  if (sc.pre != null && sc.pre < 70) return {hypo: true};
  const careful = !!(prof.meds && (prof.meds.ins || prof.meds.su));
  const pred = predict(items, sc.ctx, model, prof, sc.pre);
  const vs = variants(items, sc.ctx, careful).map(v => { const [its, c] = applyVs(items, sc.ctx, [v]); const p = predict(its, c, model, prof, sc.pre); return {...v, gain: pred.peak - p.peak, peak: p.peak}; }).filter(v => v.gain >= 3).sort((a, b) => b.gain - a.gain);
  const pick = []; for (const v of vs) { const isSwap = v.id.startsWith("swap-"); if (isSwap && pick.some(x => x.id === "less" || (x.swapFor && x.swapFor === v.swapFor))) continue; if (v.id === "less" && pick.some(x => x.id.startsWith("swap-"))) continue; pick.push(v); }
  const [cI, cC] = applyVs(items, sc.ctx, pick), combo = pick.length ? predict(cI, cC, model, prof, sc.pre) : null;
  const doTxt = pred.grade === "A" ? "وجبتك ممتازة على سكرك. كُلها بنفس الطريقة." : vs[0] ? vs[0].label + "." : "الوجبة ثقيلة على السكر. خفف الكمية في المرة الجاية.";
  const series = [{pts: pred.curve, color: "var(--brand2)", band: pred.cv, g0: pred.g0, peak: [pred.tp, pred.peak]}];
  if (combo) series.push({pts: combo.curve, color: "var(--gA)", dash: "7 6", peak: [combo.tp, combo.peak]});
  const measureAt = pred.tp <= 60 ? 60 : pred.tp <= 95 ? 90 : 120;
  return {pred, combo, vs, pick, doTxt, series, measureAt, careful, model};
}
function bindScan() {
  const sc = S.scan, R = $("#flow");
  const back = $("#sc-back", R); back.onclick = () => { const order = ["photo", "items", "context", "result"], i = order.indexOf(sc.stage === "analyzing" ? "photo" : sc.stage);
    if (i <= 0) { abortAI(); S.scan = null; history.length > 1 ? history.back() : go("today"); } else { sc.stage = order[i - 1]; renderScan(); } };
  const f1 = $("#sc-f1", R), f2 = $("#sc-f2", R);
  if (f1) { $("#sc-cam", R) && ($("#sc-cam", R).onclick = () => f1.click()); $("#sc-gal", R) && ($("#sc-gal", R).onclick = () => f2.click()); $("#sc-retake", R) && ($("#sc-retake", R).onclick = () => f1.click());
    const onFile = async e => { const f = e.target.files[0]; if (!f) return; try { const {thumb, b64} = await processImage(f); sc.photo = thumb; sc.b64 = b64; sc.err = ""; } catch (er) { sc.err = "ما قدرنا نقرأ الصورة. جرّب صورة ثانية."; } renderScan(); };
    f1.onchange = onFile; f2.onchange = onFile; }
  $("#sc-nophoto", R) && ($("#sc-nophoto", R).onclick = () => { sc.stage = "items"; renderScan(); });
  $("#sc-go", R) && ($("#sc-go", R).onclick = () => { if (aiReady()) runAI(); else { sc.stage = "items"; renderScan(); } });
  $("#sc-skip", R) && ($("#sc-skip", R).onclick = () => { abortAI(); sc.stage = "items"; renderScan(); });
  if (sc.stage === "items") {
    const drawRes = () => { const q = sc.q.trim(), list = Object.values(FOODS).filter(f => (sc.cat === "all" || f.cat === sc.cat) && (!q || f.ar.includes(q))).slice(0, 40);
      $("#sc-res", R).innerHTML = list.map(f => `<button class="res" data-add="${f.id}"><span class="oi" style="width:36px;height:36px;border-radius:12px;background:var(--brand-soft);display:grid;place-items:center;color:var(--brand)">${ic("plus")}</span><span><b>${esc(f.ar)}</b><br><span class="xs muted">${esc(f.unit[0])} ${f.unit[1]} جم</span></span><span class="xs muted">${f.gi ? "مؤشر " + f.gi : ""}</span></button>`).join("") || `<p class="small muted" style="padding:8px">ما لقينا "${esc(q)}".</p>`;
      $$("[data-add]", R).forEach(b => b.onclick = () => { sc.items.push(scanItem(b.dataset.add, FOODS[b.dataset.add].unit[1])); sc.q = ""; renderScan(); setTimeout(() => { const el = $$(".item", $("#flow")).pop(); el && el.scrollIntoView({block: "center", behavior: "smooth"}); }, 30); toast("انضاف " + FOODS[b.dataset.add].ar); }); };
    drawRes();
    $("#sc-q", R).oninput = e => { sc.q = e.target.value; drawRes(); };
    $$("[data-cat]", R).forEach(b => b.onclick = () => { sc.cat = b.dataset.cat; $$("[data-cat]", R).forEach(x => x.setAttribute("aria-pressed", x === b)); drawRes(); });
    $$("[data-rm]", R).forEach(b => b.onclick = () => { sc.items.splice(+b.dataset.rm, 1); renderScan(); });
    $$("[data-st]", R).forEach(b => b.onclick = () => { const it = sc.items[+b.dataset.st], step = Math.max(10, r0(it.data.unit[1] / 4)); it.grams = Math.max(0, it.grams + step * +b.dataset.d); renderScan(); });
    $$("[data-po]", R).forEach(b => b.onclick = () => { const it = sc.items[+b.dataset.po]; it.grams = it.data.unit[1] * +b.dataset.f; renderScan(); });
    $("#sc-tray", R) && ($("#sc-tray", R).onclick = () => { sc.tray = !sc.tray; if (sc.tray && sc.share === 1) sc.share = 0.33; renderScan(); });
    $$("[data-share]", R).forEach(b => b.onclick = () => { sc.share = +b.dataset.share; renderScan(); });
  }
  if (sc.stage === "context") {
    $$("[data-c]", R).forEach(b => b.onclick = () => { sc.ctx[b.dataset.c] = b.dataset.v; $$(`[data-c="${b.dataset.c}"]`, R).forEach(x => x.setAttribute("aria-pressed", x === b)); });
    $$("[data-t]", R).forEach(b => b.onclick = () => { sc.ctx.time = b.dataset.t; $$("[data-t]", R).forEach(x => x.setAttribute("aria-pressed", x === b)); });
    $$("[data-s]", R).forEach(b => b.onclick = () => { const k = b.dataset.s; sc.ctx.state[k] = !sc.ctx.state[k]; b.setAttribute("aria-pressed", sc.ctx.state[k]); });
    $("#sc-pre", R).oninput = e => { const v = parseFloat(e.target.value); sc.pre = isFinite(v) && v >= 30 ? v : null; };
  }
  $("#sc-next", R) && ($("#sc-next", R).onclick = () => { sc.stage = sc.stage === "items" ? "context" : "result"; renderScan(); });
  $("#sc-backctx", R) && ($("#sc-backctx", R).onclick = () => { sc.stage = "context"; renderScan(); });
  $("#sc-done", R) && ($("#sc-done", R).onclick = () => { S.scan = null; go("today"); });
  $("#sc-say", R) && ($("#sc-say", R).onclick = () => { try { const u = new SpeechSynthesisUtterance(sc.R.doTxt); u.lang = "ar-SA"; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { toast("الصوت غير متاح في هذا المتصفح"); } });
  $$("[data-apply]", R).forEach(b => b.onclick = () => { const v = sc.R.vs[+b.dataset.apply];
    if (v.ctx) Object.assign(sc.ctx, v.ctx);
    else if (v.swapFor) { const i = sc.items.indexOf(v.swapFor); if (i >= 0) sc.items[i] = scanItem(v.to, v.swapFor.grams * v.k); }
    else if (v.id === "less") sc.items.forEach(it => { if (it.data.c - it.data.f > 10 && !it.data.liquid && it.data.gi > 0) it.grams *= 0.75; });
    toast("طبّقناها"); renderScan(); });
  $("#sc-save", R) && ($("#sc-save", R).onclick = saveMeal);
}
async function saveMeal() {
  const sc = S.scan, Rz = sc.R, editing = sc.editId ? S.meals.find(x => x.id === sc.editId) : null, pack = p => p && {peak: r0(p.peak), tp: r0(p.tp), g0: r0(p.g0), rise: r1(p.rise), grade: p.grade, curve: p.curve.filter(x => x[0] % 10 === 0).map(x => [x[0], r0(x[1])])};
  const items = eff(sc).map(x => ({key: x.it.key, name: x.it.name, grams: r0(x.g), ...(x.it.key === "other" ? {data: x.it.data} : {})}));
  const m = {id: editing ? editing.id : uid("m"), ts: editing ? editing.ts : Date.now(), photo: sc.photo, items, ctx: {...sc.ctx}, pre: sc.pre, pred: pack(Rz.pred), combo: pack(Rz.combo), grade: Rz.pred.grade, advice: Rz.pick.map(v => v.label), measureAt: Rz.measureAt, sAtPredict: Rz.model.s, title: sc.title || ""};
  await Store.put("meals", m);
  if (editing) {
    S.meals[S.meals.indexOf(editing)] = m;
    for (const r of S.readings.filter(r => r.mealId === m.id)) { const P = r.followed && m.combo ? m.combo : m.pred; r.expected = r0(valAt(P.curve, r.minutes)); await Store.put("readings", r); }
    S.scan = null; go("log"); setTimeout(() => openMealSheet(m), 60); toast("انحفظت التعديلات"); return;
  }
  S.meals.unshift(m);
  if (sc.pre != null) { const r = {id: uid("r"), ts: m.ts, v: sc.pre, kind: "pre"}; await Store.put("readings", r); S.readings.unshift(r); }
  S.scan = null; scheduleNotif(m); go("today");
  openSheet(`<div class="empty"><div class="art" style="background:var(--gA-s);color:var(--gA)">${ic("check")}</div><h2 style="font-size:1.3rem">انحفظت الوجبة</h2>
    <p class="muted">قِس سكرك بعد <b class="num">${m.measureAt}</b> دقيقة من أول لقمة (الساعة <b>${fmtTime(m.ts + m.measureAt * 60000)}</b>). قراءتك تعلّم النموذج جسمك.</p></div>
    ${"Notification" in window && Notification.permission !== "granted" ? `<button class="btn saffron block" data-a="n">${ic("bell")} ذكّرني بموعد القياس</button>` : ""}
    <button class="btn primary block" data-close>تمام</button>`, (sh, close) => {
    const n = $("[data-a=n]", sh); if (n) n.onclick = async () => { const r = await Notification.requestPermission(); if (r === "granted") { scheduleNotif(m); toast("بنذكّرك وقت القياس (والتطبيق مفتوح)"); } close(); }; });
}
const notifTimers = {};
function scheduleNotif(m) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const ms = m.ts + m.measureAt * 60000 - Date.now(); if (ms <= 0 || ms > 4 * 3600e3) return;
  clearTimeout(notifTimers[m.id]);
  notifTimers[m.id] = setTimeout(async () => { const body = `حان وقت قياس سكرك بعد ${mealName(m)}`;
    try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) reg.showNotification("Preventive Glucose AI", {body, icon: "icon.svg", tag: m.id}); else new Notification("Preventive Glucose AI", {body}); } catch (e) {} if (location.hash === "#today" || !location.hash) route(); }, ms);
}

/* ================= image + AI ================= */
function loadImg(file) { return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = URL.createObjectURL(file); }); }
function draw(img, max, q) { const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas"); c.width = r0(img.naturalWidth * k); c.height = r0(img.naturalHeight * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", q); }
async function processImage(file) { const img = await loadImg(file); return {thumb: draw(img, 480, 0.72), b64: draw(img, 1024, 0.82).split(",")[1]}; }
const AI_PROMPT = () => `You are a clinical dietitian specialised in Saudi and Gulf cuisine. Identify the foods in this meal photo and estimate the amounts.
Known foods (use these exact keys when an item matches):
${Object.values(FOODS).map(f => `${f.id} = ${f.ar}`).join("\n")}
Rules:
- Estimate grams realistically from visual cues: dinner plate ~26 cm, Saudi tray (صينية) ~60 cm, tea glass 100 ml, cup 240 ml, one date ~10 g, khubz ~90 g.
- If food is served on one large shared tray for several people, set "shared": true and give grams for the WHOLE tray.
- Rice cooked with meat/chicken and spices maps to the kabsa/mandi/bukhari keys, not plain rice.
- An item with no matching key: key "other", give name_ar and per-100g values (carb_per100, fiber_per100, protein_per100, fat_per100, kcal_per100) and a glycemic index gi.
- confidence 0-1 covers both the identity and the amount.
- Not food: return an empty items array.
Reply with ONLY JSON:
{"summary_ar":"وصف قصير بالعربي","shared":false,"items":[{"key":"kabsa_chicken","name_ar":"كبسة دجاج","grams":350,"confidence":0.8}],"notes_ar":""}`;
let aiCtl = null;
function abortAI() { if (aiCtl) { aiCtl.abort(); aiCtl = null; } }
function parseJSON(t) { try { return JSON.parse(t); } catch (e) { const m = String(t).match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); throw new Error("json"); } }
async function aiCall(st, parts, signal) {
  if (st.provider === "gemini") {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(st.model || "gemini-3.8-flash")}:generateContent`, {method: "POST", signal,
      headers: {"content-type": "application/json", "x-goog-api-key": st.key}, body: JSON.stringify({contents: [{parts}], generationConfig: {responseMimeType: "application/json", temperature: 0.2}})});
    if (!r.ok) throw new Error("http" + r.status);
    const d = await r.json(); return (d.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  }
  if (st.provider === "worker") {
    const img = parts.find(p => p.inline_data);
    const r = await fetch(st.endpoint, {method: "POST", signal, headers: {"content-type": "application/json"}, body: JSON.stringify({image: img ? img.inline_data.data : "", mediaType: "image/jpeg", foods: Object.fromEntries(Object.values(FOODS).map(f => [f.id, f.ar])), ping: !img})});
    if (!r.ok) throw new Error("http" + r.status); return await r.text();
  }
  throw new Error("noai");
}
async function aiPing(st) { if (st.provider === "none") throw new Error("noai"); if (st.provider === "gemini" && !st.key) throw new Error("nokey");
  const t = await aiCall(st, [{text: 'Reply with only this JSON: {"ok":true}'}]); if (st.provider === "gemini") parseJSON(t); }
function aiErrText(e) { const m = String(e && e.message || e); return m === "nokey" ? "أدخل المفتاح" : m === "noai" ? "اختر طريقة تحليل" : m === "http400" ? "المفتاح أو الموديل غير صحيح" : m === "http403" ? "المفتاح مرفوض" : m === "http404" ? "اسم الموديل غير موجود" : m === "http429" ? "وصلت الحد المجاني، جرّب بعد شوي" : m.startsWith("http") ? "الخادم رد بخطأ " + m.slice(4) : "تأكد من الاتصال"; }
async function runAI() {
  const sc = S.scan; sc.stage = "analyzing"; sc.err = ""; renderScan(); aiCtl = new AbortController();
  try {
    const txt = await aiCall(S.settings, [{inline_data: {mime_type: "image/jpeg", data: sc.b64}}, {text: AI_PROMPT()}], aiCtl.signal);
    const out = parseJSON(txt);
    const items = (Array.isArray(out.items) ? out.items : []).map(x => { const g = Math.max(0, Number(x.grams) || 0), conf = clamp(Number(x.confidence) || 0.5, 0, 1);
      if (FOODS[x.key]) return scanItem(x.key, g, {conf});
      const name = String(x.name_ar || "صنف").slice(0, 60), c = +x.carb_per100 || 0, f = +x.fiber_per100 || 0, p = +x.protein_per100 || 0, fat = +x.fat_per100 || 0;
      const d = {id: "other", ar: name, cat: "other", kcal: +x.kcal_per100 || (c * 4 + p * 4 + fat * 9), c, f, p, fat, gi: clamp(+x.gi || 60, 0, 100), src: "AI", unit: ["حصة", Math.max(20, r0(g / 2) || 50)], liquid: !!x.liquid};
      return {key: "other", name, data: d, grams: g, conf}; }).filter(i => i.grams > 0);
    if (S.scan !== sc) return;
    if (!items.length) { sc.stage = "items"; sc.aiNote = ""; sc.err = ""; toast("ما تعرّفنا على أكل واضح. اختر الأصناف بنفسك."); renderScan(); return; }
    sc.items = items; sc.tray = !!out.shared; sc.share = out.shared ? 0.33 : 1; sc.title = "";
    sc.aiNote = [out.summary_ar, out.notes_ar].filter(Boolean).map(String).join(". ") + " راجع الكميات وعدّلها إذا تحتاج.";
    sc.stage = "items"; renderScan();
  } catch (e) {
    if (S.scan !== sc) return; if (e.name === "AbortError") return;
    sc.stage = "photo"; sc.err = "تعذّر التحليل: " + aiErrText(e) + ". تقدر تختار الأصناف بنفسك."; renderScan();
  } finally { aiCtl = null; }
}

/* ================= CALIBRATION ================= */
const TPS = [30, 60, 90, 120];
function nextDue(run) { if (!run || !run.start) return null; for (const t of TPS) if (run.R[t] == null) return {t, left: run.start + t * 60000 - Date.now()}; return null; }
const fmtLeft = ms => { const s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, "0")}`; };
async function saveRun() { await saveKV("calibRun", S.calibRun); }
function renderCalib() {
  const p = S.profile, [ok, msg] = calAllowed(p);
  if (!S.calibRun || (S.calibRun.stage === "done" && S.calibRun.closed)) S.calibRun = {stage: "prep", checks: [], dose: 50, start: null, R: {}};
  const run = S.calibRun; if (p && p.status === "t2") run.dose = 50;
  let body = "", foot = "", step = {prep: 1, fasting: 2, run: 3, done: 4}[run.stage];
  if (!ok) { body = `<h2>اختبار المعايرة</h2><div class="note bad">${ic("shield")}<span><b>الاختبار غير مناسب لك</b><br>${esc(msg)}</span></div><p class="muted">مو مشكلة. التطبيق يشتغل بالتقدير الأولي من بياناتك، ويتعلم من قراءاتك بعد كل وجبة.</p>`; foot = `<button class="btn primary block" id="cb-close">رجوع</button>`; }
  else if (run.stage === "prep") {
    const CH = [["fast", "صائم من ٨ إلى ١٢ ساعة", "ماء فقط"], ["glu", `عندي ${run.dose} جم جلوكوز (دكستروز)`, "من الصيدلية. سكر الطاولة ما يصلح لأن نصّه فركتوز"], ["meter", "جهاز القياس جاهز", "شرائط وإبرة كافية لخمس قراءات"], ["well", "مو مريض وما تمرنت اليوم", "وبتجلس ساعتين بدون مجهود"]];
    body = `<h2>اختبار المعايرة</h2><p class="sub">ساعتين صباحاً تكشف كيف يتعامل جسمك مع السكر. هذا اللي يخلي التوقع على مقاسك.</p>
      ${msg ? `<div class="note">${ic("shield")}<span>${esc(msg)}</span></div>` : ""}
      <h3>الجرعة</h3><div class="chips">${[50, 75].map(d => `<button class="chip" data-dose="${d}" aria-pressed="${run.dose === d}" ${p.status === "t2" && d === 75 ? "disabled" : ""}>${d} جم${d === 50 ? " (المعتمد)" : ""}</button>`).join("")}</div>
      <h3>قبل ما تبدأ</h3><div class="stack">${CH.map(([k, t, d]) => `<button class="check" data-ch="${k}" aria-pressed="${run.checks.includes(k)}"><span class="box">${ic("check")}</span><span><b>${t}</b><br><span class="xs muted">${d}</span></span></button>`).join("")}</div>
      <div class="note bad">${ic("shield")}<span>أوقف الاختبار فوراً إذا حسيت بدوخة شديدة أو تعرّق أو رجفة، أو وصلت أي قراءة ٢٥٠ أو أكثر.</span></div>`;
    foot = `<button class="btn primary block" id="cb-next" ${run.checks.length === CH.length ? "" : "disabled"}>جاهز، قِس الصيام</button>`;
  } else if (run.stage === "fasting") {
    body = `<h2>قراءة الصيام</h2><p class="sub">قِس الحين قبل ما تشرب أي شي.</p>
      <div class="field"><label for="cb-f">القراءة (ملجم/دسل)</label><input id="cb-f" class="input bignum" type="number" inputmode="numeric" min="30" max="600" placeholder="000" value="${run.R[0] ?? ""}"></div><div id="cb-msg"></div>`;
    foot = `<button class="btn primary block" id="cb-start">${ic("clock")} شربت الجلوكوز، ابدأ المؤقت</button><p class="xs muted" style="text-align:center">اشربه خلال ٥ دقائق مذاباً في ٢٥٠ مل ماء</p>`;
  } else if (run.stage === "run") {
    const nx = nextDue(run), C = 2 * Math.PI * 92;
    body = `<h2>الاختبار شغّال</h2><p class="sub">اجلس وارتح. ننبهك وقت كل قراءة.</p>
      <div class="timer"><svg width="220" height="220" viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="92" stroke="var(--line)" stroke-width="12" fill="none"/><circle id="cb-arc" cx="110" cy="110" r="92" stroke="var(--brand2)" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 110 110)"/></svg>
        <div class="center"><span class="small muted" id="cb-lbl">${nx ? `قراءة ${nx.t} دقيقة بعد` : "خلصت القراءات"}</span><b id="cb-left">${nx ? fmtLeft(nx.left) : "✓"}</b><span class="xs muted">بدأ ${fmtTime(run.start)}</span></div></div>
      <div class="stack">${TPS.map(t => { const v = run.R[t], dueAt = run.start + t * 60000, open = Date.now() >= dueAt - 5 * 60000;
        return `<div class="tp ${v != null ? "done" : open ? "due" : ""}"><span class="st num">${t}</span><span><b>بعد ${t} دقيقة</b><br><span class="xs muted">${fmtTime(dueAt)}${t === 90 ? " · اختيارية" : ""}</span></span><input data-tp="${t}" type="number" inputmode="numeric" min="30" max="600" value="${v ?? ""}" ${open || v != null ? "" : "disabled"} aria-label="قراءة ${t} دقيقة" placeholder="—"></div>`; }).join("")}</div>
      <div id="cb-msg"></div>`;
    const enough = run.R[30] != null && run.R[60] != null && run.R[120] != null;
    foot = `<button class="btn primary block" id="cb-calc" ${enough ? "" : "disabled"}>احسب بصمتي</button><button class="btn ghost block" id="cb-cancel">ألغِ الاختبار</button>
      <div id="cb-cc" hidden class="note bad"><span><b>تلغي الاختبار؟ تضيع القراءات.</b><br><span class="row" style="margin-top:8px"><button class="btn sm primary" id="cb-cy">ألغِ</button><button class="btn sm" id="cb-cn">كمّل</button></span></span></div>`;
  } else if (run.stage === "done") {
    const C = S.calib;
    body = `<div class="empty" style="padding-top:0"><div class="art" style="background:var(--gA-s);color:var(--gA)">${ic("check")}</div><h2>عرفنا جسمك</h2></div>
      ${run.warn ? run.warn : ""}
      <div class="card"><div class="chart">${calibChart(C)}</div>
        <div class="kpis"><div class="kpi"><small>الارتفاع الأقصى</small><b class="num">+${r0(C.rise)}</b></div><div class="kpi"><small>وقت القمة</small><b class="num">${C.peakT} د</b></div><div class="kpi"><small>حساسيتك</small><b class="num">${r1(C.s)}</b></div></div>
        <p class="small">${esc(C.shape)}.${C.peakT >= 60 ? " قمتك متأخرة، وهذا يتوافق مع ضعف المرحلة الأولى لإفراز الإنسولين: بالضبط اللي يفيد معه ترتيب الأكل." : ""}</p></div>
      <div class="note info">${ic("flask")}<span>${curModel().calCount > 1 ? "دمجنا النتيجة مع اختبارك السابق." : "استجابة الشخص تتغير من يوم ليوم، فالأفضل تعيد الاختبار مرة ثانية خلال أسبوعين."}</span></div>`;
    foot = `<button class="btn primary block" id="cb-fin">${ic("camera")} صوّر أول وجبة</button><button class="btn ghost block" id="cb-home">للرئيسية</button>`;
  }
  $("#flow").innerHTML = `<div class="wrap"><div class="flowhead"><button class="iconbtn" id="cb-x" aria-label="إغلاق">${ic("x")}</button>${ok ? `<div class="progress"><i style="width:${step / 4 * 100}%"></i></div>` : ""}</div><div class="flowbody">${body}</div><div class="flowfoot">${foot}</div></div>`;
  const R = $("#flow");
  $("#cb-x", R).onclick = () => go("today");
  $("#cb-close", R) && ($("#cb-close", R).onclick = () => go("today"));
  $$("[data-dose]", R).forEach(b => b.onclick = async () => { run.dose = +b.dataset.dose; await saveRun(); renderCalib(); });
  $$("[data-ch]", R).forEach(b => b.onclick = async () => { const k = b.dataset.ch; run.checks = run.checks.includes(k) ? run.checks.filter(x => x !== k) : [...run.checks, k]; await saveRun(); renderCalib(); });
  $("#cb-next", R) && ($("#cb-next", R).onclick = async () => { run.stage = "fasting"; await saveRun(); renderCalib(); });
  $("#cb-start", R) && ($("#cb-start", R).onclick = async () => { const v = parseFloat($("#cb-f", R).value), lim = p.status === "t2" ? 160 : 126, m = $("#cb-msg", R);
    if (!isFinite(v) || v < 30 || v > 600) { m.innerHTML = `<div class="note bad">${ic("x")}<span>أدخل قراءة الصيام أولاً.</span></div>`; return; }
    if (v < 70) { m.innerHTML = `<div class="note bad">${ic("shield")}<span><b>أقل من ٧٠: لا تبدأ الاختبار.</b> إذا عندك أعراض خذ ١٥ جم سكر سريع، وكلّم طبيبك.</span></div>`; return; }
    if (v >= lim) { m.innerHTML = `<div class="note bad">${ic("shield")}<span><b>قراءة الصيام ${lim} أو أكثر: لا تشرب الجلوكوز.</b> ${p.status === "t2" ? "سكرك مرتفع من البداية." : "هذا الرقم قد يعني سكري. راجع الطبيب لتأكيد التشخيص."}</span></div>`; return; }
    run.R[0] = v; run.start = Date.now(); run.stage = "run"; await saveRun();
    if ("Notification" in window && Notification.permission === "default") { try { await Notification.requestPermission(); } catch (e) {} }
    scheduleCalibNotifs(); renderCalib(); });
  if (run.stage === "run") {
    $$("[data-tp]", R).forEach(inp => inp.onchange = async () => { const t = +inp.dataset.tp, v = parseFloat(inp.value);
      if (!isFinite(v)) { delete run.R[t]; } else { run.R[t] = v; if (v >= 250) $("#cb-msg", R).innerHTML = `<div class="note bad">${ic("shield")}<span><b>قراءة ٢٥٠ أو أكثر: أوقف الاختبار</b> وتواصل مع طبيبك.</span></div>`; else if (v < 70) $("#cb-msg", R).innerHTML = `<div class="note bad">${ic("shield")}<span><b>هبوط تحت ٧٠:</b> كُل شي خفيف، وبلّغ طبيبك.</span></div>`; }
      await saveRun(); renderCalib(); });
    const arc = $("#cb-arc", R), C = 2 * Math.PI * 92;
    const tick = () => { const nx = nextDue(run); if (!$("#cb-left")) return; if (!nx) { $("#cb-left").textContent = "✓"; $("#cb-lbl").textContent = "خلصت القراءات"; arc.setAttribute("stroke-dashoffset", 0); return; }
      $("#cb-left").textContent = nx.left > 0 ? fmtLeft(nx.left) : "الحين"; $("#cb-lbl").textContent = nx.left > 0 ? `قراءة ${nx.t} دقيقة بعد` : `وقت قراءة ${nx.t} دقيقة`;
      const prev = TPS[TPS.indexOf(nx.t) - 1] || 0, span = (nx.t - prev) * 60000, done = clamp(1 - nx.left / span, 0, 1); arc.setAttribute("stroke-dashoffset", C * (1 - done));
      $$("[data-tp]", R).forEach(inp => { const t = +inp.dataset.tp; if (inp.disabled && Date.now() >= run.start + t * 60000 - 5 * 60000) renderCalib(); }); };
    tick(); clearInterval(tickTimer); tickTimer = setInterval(tick, 1000);
    $("#cb-calc", R).onclick = finishCalib;
    $("#cb-cancel", R).onclick = () => $("#cb-cc", R).hidden = false;
    $("#cb-cn", R).onclick = () => $("#cb-cc", R).hidden = true;
    $("#cb-cy", R).onclick = async () => { S.calibRun = null; await Store.del("calibRun"); toast("انلغى الاختبار"); go("today"); };
  }
  $("#cb-fin", R) && ($("#cb-fin", R).onclick = async () => { run.closed = true; await saveRun(); newScan(); go("scan"); });
  $("#cb-home", R) && ($("#cb-home", R).onclick = async () => { run.closed = true; await saveRun(); go("today"); });
}
function scheduleCalibNotifs() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const run = S.calibRun; for (const t of TPS) { const ms = run.start + t * 60000 - Date.now(); if (ms > 0) setTimeout(async () => { try { const reg = await navigator.serviceWorker?.getRegistration(); const b = `حان وقت قراءة ${t} دقيقة في اختبار المعايرة`; reg ? reg.showNotification("Preventive Glucose AI", {body: b, icon: "icon.svg", tag: "cal" + t}) : new Notification("Preventive Glucose AI", {body: b}); } catch (e) {} }, ms); }
}
function classifyShape(R) {
  const pts = [0, ...TPS].filter(t => R[t] != null); let peaks = 0;
  for (let i = 1; i < pts.length - 1; i++) if (R[pts[i]] > R[pts[i - 1]] && R[pts[i]] > R[pts[i + 1]]) peaks++;
  const last = pts[pts.length - 1]; if (R[last] >= Math.max(...pts.map(t => R[t])) - 2) return "منحنى متصاعد حتى النهاية: القمة متأخرة جداً";
  return peaks >= 2 ? "منحنى ثنائي القمة: نمط مرتبط بحساسية أفضل للإنسولين" : "منحنى أحادي القمة: نمط أكثر شيوعاً مع ضعف حساسية الإنسولين";
}
async function finishCalib() {
  const run = S.calibRun, R = run.R, vals = Object.values(R);
  let peakT = 0, peakV = R[0]; for (const t of TPS) if (R[t] != null && R[t] > peakV) { peakV = R[t]; peakT = t; }
  const rise = Math.max(5, peakV - R[0]), s = rise / run.dose, base = curModel(), prev = base.calibrated ? base.s : null;
  let warn = "";
  if (Math.max(...vals) >= 250) warn += `<div class="note bad">${ic("shield")}<span><b>وصلت قراءة ٢٥٠ أو أكثر.</b> اعرض النتيجة على طبيبك.</span></div>`;
  if (Math.min(...vals.slice(1)) < 70) warn += `<div class="note bad">${ic("shield")}<span><b>نزلت قراءة تحت ٧٠</b> (هبوط تفاعلي). بلّغ طبيبك.</span></div>`;
  if (run.dose === 75 && R[120] != null) { if (R[120] >= 200) warn += `<div class="note bad">${ic("shield")}<span><b>قراءة الساعتين ٢٠٠ أو أكثر بعد ٧٥ جم</b> تقع في نطاق السكري حسب اختبار التحمل. الاختبار المنزلي ما يكفي للتشخيص، راجع طبيبك بهالقراءات.</span></div>`;
    else if (R[120] >= 140) warn += `<div class="note">${ic("shield")}<span><b>قراءة الساعتين بين ١٤٠ و١٩٩</b> تتوافق مع ضعف تحمل الجلوكوز (ما قبل السكري). اعرضها على طبيبك.</span></div>`; }
  else if (Math.max(...vals) >= 200) warn += `<div class="note">${ic("shield")}<span><b>قراءة ٢٠٠ أو أكثر بعد ٥٠ جم:</b> استجابة عالية. اعرض القراءات على طبيبك.</span></div>`;
  const model = {...base, s: prev ? (prev + s) / 2 : s, tpG: peakT || 30, g0: R[0], calibrated: true, calCount: (base.calCount || 0) + 1};
  await saveKV("model", model);
  await saveKV("calib", {R: {...R}, ts: Date.now(), dose: run.dose, rise, peakT, s, shape: classifyShape(R)});
  run.stage = "done"; run.warn = warn; await saveRun();
  for (const t of [0, ...TPS]) if (R[t] != null) { const r = {id: uid("r"), ts: run.start + t * 60000, v: R[t], kind: t === 0 ? "fasting" : "random", calib: true}; await Store.put("readings", r); S.readings.unshift(r); }
  S.readings.sort((a, b) => b.ts - a.ts);
  renderCalib();
}
function calibChart(C) { const pts = Object.keys(C.R).map(Number).sort((a, b) => a - b).map(t => [t, C.R[t]]); return curveSVG([{pts, color: "var(--saffron)", dots: true, labels: true, w: 2.6}], {xmax: 120, ticks: [0, 30, 60, 90, 120], label: "منحنى اختبار الجلوكوز"}); }

/* ================= boot ================= */
(async function boot() {
  await Store.open(); await loadAll();
  route();
  for (const m of S.meals) scheduleNotif(m);
  if (S.calibRun && S.calibRun.stage === "run") scheduleCalibNotifs();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  if (!Store.db) toast("المتصفح يمنع الحفظ الدائم، بياناتك تنحفظ مؤقتاً");
  setInterval(() => { if (!location.hash || location.hash === "#today") { if (!$(".sheet-bg")) viewToday(); } }, 60000);
})();
