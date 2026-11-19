"use strict";
/* ================= v5 features: cooking fat, quick logging, barcode, voice, caregivers, doctor report,
   lab photo, Ramadan, calorie targets, weight, Libre CSV, Arabic→USDA search, install hint ================= */

/* ---------- Arabic text helpers ---------- */
const normAr = s => String(s || "").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[ً-ْـ]/g, "")
  .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[،,.!?؟]/g, " ").replace(/\s+/g, " ").trim();
const isArabic = s => /[؀-ۿ]/.test(s);

/* ---------- cooking fat (photos miss oil: apps under-count fat ~30 g/meal) ---------- */
const OIL_CATS = new Set(["rice", "meat", "fish", "fast", "breakfast", "wheat", "bread", "soup"]);
function oilAdj(F, oil) { if (!F || !oil || oil === "normal" || !OIL_CATS.has(F.cat)) return F;
  const d = oil === "rich" ? 6 : -3, fat = Math.max(0, F.fat + d); return {...F, fat, kcal: (F.kcal || 0) + (fat - F.fat) * 9}; }
function mealTotals(m) { return totals(m.items.map(it => ({g: it.grams, data: oilAdj(itemData(it), (m.ctx || {}).oil)})).filter(x => x.data)); }

/* ---------- extra restaurant / café items (standard estimates) ---------- */
(function addFoods() {
  const rows = [
    ["nuggets", "ناجتس دجاج", "fast", 296, 15, 19, 16, 1, 46, "٦ قطع", 100],
    ["crispy_sand", "ساندويتش دجاج كرسبي", "fast", 260, 12, 12, 26, 1.5, 66, "ساندويتش", 220],
    ["toum", "صوص ثوم (ثومية)", "fast", 650, 1, 70, 4, 0.3, 50, "ملعقة", 15],
    ["spanish_latte", "سبانش لاتيه", "drink", 80, 3, 3, 11, 0, 60, "كوب", 350, 1],
    ["frappe", "فرابيه", "drink", 90, 1.5, 2.5, 16, 0, 65, "كوب", 400, 1],
    ["croissant", "كرواسون", "bread", 406, 8, 21, 46, 2.6, 67, "حبة", 60],
    ["donut", "دونات", "sweet", 421, 5.4, 23, 49, 1.4, 76, "حبة", 60]
  ];
  for (const [id, ar, cat, kcal, p, fat, c, f, gi, unit, ug, liq] of rows) if (!FOODS[id]) FOODS[id] = {id, ar, cat, kcal, p, fat, c, f, gi, src: "STD", unit: [unit, ug], liquid: !!liq};
  SRC_NAME.OFF = "Open Food Facts (من الباركود)";
})();

/* ---------- Arabic words → USDA English search ---------- */
const AR2EN = {"شوفان": "oats", "عدس": "lentils", "حمص": "chickpeas", "فاصوليا": "beans", "رز": "rice", "بطاطس": "potato", "بطاطا": "sweet potato", "تفاح": "apple", "تفاحه": "apple", "موز": "banana",
  "برتقال": "orange", "عنب": "grapes", "فراوله": "strawberries", "بطيخ": "watermelon", "حبحب": "watermelon", "مانجو": "mango", "كيوي": "kiwi", "اناناس": "pineapple", "خوخ": "peach", "كمثري": "pear",
  "رمان": "pomegranate", "تين": "figs", "زبيب": "raisins", "لوز": "almonds", "جوز": "walnuts", "فول سوداني": "peanuts", "كاجو": "cashew", "فستق": "pistachio", "دجاج": "chicken", "صدر": "breast",
  "لحم": "beef", "بقر": "beef", "غنم": "lamb", "تونه": "tuna", "سلمون": "salmon", "روبيان": "shrimp", "جمبري": "shrimp", "بيض": "egg", "حليب": "milk", "زبادي": "yogurt", "جبن": "cheese", "زبده": "butter",
  "زيت": "oil", "زيتون": "olive", "عسل": "honey", "سكر": "sugar", "خبز": "bread", "توست": "bread white", "مكرونه": "pasta", "شعير": "barley", "ذره": "corn", "خيار": "cucumber", "طماطم": "tomato",
  "خس": "lettuce", "جزر": "carrot", "بروكلي": "broccoli", "سبانخ": "spinach", "باذنجان": "eggplant", "كوسه": "squash", "فلفل": "pepper", "بصل": "onion", "ثوم": "garlic", "فطر": "mushroom",
  "شوكولاته": "chocolate", "بسكويت": "cookies", "كيك": "cake", "عصير": "juice", "قهوه": "coffee", "شاي": "tea", "افوكادو": "avocado", "كينوا": "quinoa", "توت": "berries", "مشمش": "apricot",
  "بازلاء": "peas", "فول": "fava", "ملفوف": "cabbage", "قرنبيط": "cauliflower", "كريمه": "cream", "ايس كريم": "ice cream", "فشار": "popcorn", "شيبس": "potato chips"};
function toEnQuery(q) { let t = " " + normAr(q) + " "; const out = [];
  for (const k of Object.keys(AR2EN).sort((a, b) => b.length - a.length)) { const nk = normAr(k); if (t.includes(" " + nk + " ") || t.includes(" ال" + nk + " ")) { out.push(AR2EN[k]); t = t.replace(nk, " "); } }
  return out.join(" "); }
function searchAny(q, n = 15) { const en = /[a-z]/i.test(q) ? q : isArabic(q) ? toEnQuery(q) : ""; return en ? searchUSDA(en, n) : []; }

/* ---------- quick logging ---------- */
function recentMeals(n = 3) { const seen = new Set(), out = [];
  for (const m of S.meals) { const k = m.items.map(i => i.key + ":" + r0(i.grams / 10)).sort().join("|"); if (seen.has(k) || !m.items.length) continue; seen.add(k); out.push(m); if (out.length >= n) break; }
  return out; }
function frequentFoods(n = 8) { const c = {}; for (const m of S.meals) for (const it of m.items) if (FOODS[it.key]) c[it.key] = (c[it.key] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => FOODS[k]); }
function repeatMeal(m) { newScan(); S.scan.items = m.items.map(it => ({key: it.key, name: it.name, data: itemData(it), grams: it.grams})).filter(i => i.data);
  S.scan.ctx.oil = (m.ctx || {}).oil || "normal"; S.scan.stage = "items"; go("scan"); }
function quickHTML() {
  const rm = recentMeals(), ff = frequentFoods(), ram = S.settings.ramadan;
  if (!rm.length && !ff.length && !ram) return "";
  return `<div class="card soft"><h3>سجّل بسرعة</h3>
    ${ram ? `<button class="lrow" data-quick="iftar"><span class="oi">${ic("moon")}</span><span><b>إفطار صايم</b><br><span class="xs muted">٣ تمرات + ماء + شوربة عدس</span></span>${ic("plus")}</button>` : ""}
    ${rm.map(m => `<button class="lrow" data-repeat="${m.id}">${thumbHTML(m)}<span style="min-width:0"><b>كرّر: ${esc(mealName(m))}</b><br><span class="xs muted">${fmtDay(m.ts)}</span></span>${ic("plus")}</button>`).join("")}
    ${ff.length ? `<span class="flabel">أكثر شي تاكله</span><div class="chips wrap">${ff.map(f => `<button class="chip" data-fav="${f.id}">${esc(f.ar)}</button>`).join("")}</div>` : ""}</div>`;
}
function bindQuick(R) {
  $$("[data-repeat]", R).forEach(b => b.onclick = () => { const m = S.meals.find(x => x.id === b.dataset.repeat); S.scan.items = m.items.map(it => ({key: it.key, name: it.name, data: itemData(it), grams: it.grams})).filter(i => i.data); S.scan.ctx.oil = (m.ctx || {}).oil || "normal"; renderScan(); toast("انضافت الوجبة، عدّل الكميات إذا تغيرت"); });
  $$("[data-fav]", R).forEach(b => b.onclick = () => { const F = FOODS[b.dataset.fav]; S.scan.items.push(foodItem(F, F.unit[1])); renderScan(); toast("انضاف " + F.ar); });
  $$("[data-quick=iftar]", R).forEach(b => b.onclick = () => { const D = FOODS.dates_sukkari; S.scan.items.push(foodItem(D, 30), foodItem(FOODS.water, FOODS.water.unit[1]), foodItem(FOODS.lentil_soup, FOODS.lentil_soup.unit[1])); S.scan.ctx.time = "iftar"; renderScan(); });
}
function logToolsHTML() { return `<div class="grid2"><button class="btn sm" id="sc-voice">${ic("mic")} قلها بصوتك</button><button class="btn sm" id="sc-bar">${ic("barcode")} باركود</button></div>`; }
function bindLogTools(R) { $("#sc-voice", R) && ($("#sc-voice", R).onclick = openVoiceSheet); $("#sc-bar", R) && ($("#sc-bar", R).onclick = openBarcodeSheet); }

/* ---------- barcode (Open Food Facts) ---------- */
let zxingLoading = null;
function loadZXing() { if (window.ZXing) return Promise.resolve(); return zxingLoading || (zxingLoading = new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s); })); }
async function lookupBarcode(code) {
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_ar,brands,nutriments,serving_quantity,categories_tags`);
  if (!r.ok) throw new Error("http" + r.status); const d = await r.json(); if (!d.product) throw new Error("notfound");
  const P = d.product, n = P.nutriments || {}, c = +n.carbohydrates_100g || 0, sug = +n.sugars_100g || 0, liquid = (P.categories_tags || []).some(t => /beverages|drinks/.test(t));
  const gi = c < 3 ? 0 : clamp(Math.round(40 + 35 * (c ? sug / c : 0)), 35, 75), sq = +P.serving_quantity || (liquid ? 250 : 100);
  return {id: "off_" + code, ar: [P.product_name_ar || P.product_name || "منتج " + code, P.brands ? "(" + String(P.brands).split(",")[0] + ")" : ""].join(" ").trim(), cat: liquid ? "drink" : "other",
    kcal: +n["energy-kcal_100g"] || (c * 4 + (+n.proteins_100g || 0) * 4 + (+n.fat_100g || 0) * 9), c, f: +n.fiber_100g || 0, p: +n.proteins_100g || 0, fat: +n.fat_100g || 0, gi, src: "OFF", unit: [P.serving_quantity ? "حصة" : liquid ? "علبة" : "١٠٠ جم", sq], liquid};
}
function openBarcodeSheet() {
  let stream = null, reader = null, done = false, timer = null;
  const close = openSheet(`<h2 style="font-size:1.35rem">امسح الباركود</h2><p class="muted">وجّه الكاميرا على الباركود اللي على العلبة.</p>
    <div class="camzone" style="aspect-ratio:4/3"><video id="bc-v" playsinline muted style="width:100%;height:100%;object-fit:cover"></video></div>
    <div class="field"><label for="bc-n">أو اكتب الرقم</label><div class="unitbox"><input id="bc-n" inputmode="numeric" placeholder="6281234567890"><span>${ic("barcode")}</span></div></div>
    <div id="bc-msg"></div><button class="btn primary block" id="bc-go">ابحث</button><button class="btn ghost block" data-close>إغلاق</button>`, (sh, cl) => {
    const msg = t => $("#bc-msg", sh).innerHTML = t;
    const found = async code => { if (done) return; done = true; stop(); msg(`<p class="muted">نبحث عن ${esc(code)}…</p>`);
      try { const F = await lookupBarcode(code); S.scan.items.push(foodItem(F, F.unit[1])); cl(); renderScan(); toast("انضاف " + F.ar); }
      catch (e) { done = false; msg(`<div class="note bad">${ic("x")}<span>${e.message === "notfound" ? "المنتج مو موجود في القاعدة. اختره بالبحث." : "ما قدرنا نوصل للقاعدة. تأكد من الاتصال."}</span></div>`); } };
    const stop = () => { clearInterval(timer); try { reader && reader.reset(); } catch (e) {} if (stream) stream.getTracks().forEach(t => t.stop()); };
    $("#bc-go", sh).onclick = () => { const v = $("#bc-n", sh).value.replace(/\D/g, ""); if (v.length >= 8) found(v); else msg(`<div class="note bad">${ic("x")}<span>الرقم قصير.</span></div>`); };
    const v = $("#bc-v", sh);
    (async () => { try {
      if ("BarcodeDetector" in window) { const det = new BarcodeDetector({formats: ["ean_13", "ean_8", "upc_a", "upc_e"]}); stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: "environment"}}); v.srcObject = stream; await v.play();
        timer = setInterval(async () => { try { const r = await det.detect(v); if (r[0]) found(r[0].rawValue); } catch (e) {} }, 400); }
      else { await loadZXing(); reader = new ZXing.BrowserMultiFormatReader(); reader.decodeFromVideoDevice(null, v, res => { if (res) found(res.getText()); }); }
    } catch (e) { msg(`<div class="note">${ic("camera")}<span>ما قدرنا نفتح الكاميرا. اكتب الرقم بدالها.</span></div>`); } })();
    const obs = new MutationObserver(() => { if (!document.body.contains(sh)) { stop(); obs.disconnect(); } }); obs.observe(document.body, {childList: true, subtree: true});
  });
  return close;
}

/* ---------- voice / free text in Saudi dialect ---------- */
const SYN = {"رز": "rice_white", "عيش": "rice_white", "كبسه": "kabsa_chicken", "كبسة": "kabsa_chicken", "شاهي": "tea_sugar", "شاي": "tea_sugar", "قهوه": "qahwa", "تمر": "dates_sukkari", "تمرات": "dates_sukkari", "تمره": "dates_sukkari",
  "خبز": "khubz_arabi", "لبن": "laban", "سلطه": "salad", "دجاج": "chicken_grill", "لحم": "lamb", "بيض": "egg", "بيضه": "egg", "بيضتين": "egg", "حليب": "milk", "عصير": "vimto", "بيبسي": "soda", "ببسي": "soda",
  "مويه": "water", "مويا": "water", "ماء": "water", "شاورما": "shawarma_sand", "برجر": "burger", "بطاطس": "fries", "مندي": "mandi", "جريش": "jareesh", "مطبق": "mutabbaq_meat", "كرك": "karak", "قرصان": "qursan",
  "مرقوق": "margoug", "سمبوسه": "sambosa", "فول": "foul", "حمص": "hummus", "لقيمات": "luqaimat", "كنافه": "kunafa_cream", "بسبوسه": "basbousa", "تميس": "tamees", "بروست": "broast", "بيتزا": "pizza", "شوربه": "lentil_soup", "خبز تميس": "tamees", "خبز بر": "brown_bread", "خبز اسمر": "brown_bread", "شاهي احمر": "tea_sugar"};
const CONT = new Set(["صحن", "كاسه", "كوب", "حبه", "قطعه", "ملعقه", "علبه", "ساندويتش", "اكلت", "شربت"]);
const NUMW = {"واحد": 1, "وحده": 1, "حبه": 1, "صحن": 1, "كاسه": 1, "كوب": 1, "اثنين": 2, "ثنتين": 2, "اثنتين": 2, "صحنين": 2, "حبتين": 2, "كاستين": 2, "كوبين": 2, "تمرتين": 2, "بيضتين": 2,
  "ثلاث": 3, "ثلاثه": 3, "اربع": 4, "اربعه": 4, "خمس": 5, "خمسه": 5, "ست": 6, "سته": 6, "سبع": 7, "سبعه": 7, "نص": 0.5, "نصف": 0.5, "ربع": 0.25};
function parseMealText(text) {
  let t = " " + normAr(text) + " "; const hits = [];
  const names = [...Object.values(FOODS).map(f => [normAr(f.ar).replace(/\s*\(.*\)/, "").replace(" / ", " "), f.id]), ...Object.entries(SYN).map(([k, v]) => [normAr(k), v])].filter(([n]) => n.length > 1).sort((a, b) => b[0].length - a[0].length);
  for (const [n, id] of names) {
    const re = new RegExp("(^|\\s)(و)?(ال)?" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=\\s)");
    let m;
    while ((m = re.exec(t))) {
      const i = m.index + m[1].length, end = m.index + m[0].length;
      const pre = t.slice(0, i), before = /\s{3,}$/.test(pre) ? [] : pre.trim().split(" ").slice(-2).reverse(), after = t.slice(end).trim().split(" ")[0] || "";
      let q = 1; for (const w0 of before) { const w = w0.replace(/^و(?=.)/, ""); if (/^\d+(\.\d+)?$/.test(w)) { q = +w; break; } if (CONT.has(w)) continue; if (NUMW[w] != null) { q = NUMW[w]; break; } break; }
      if (/^و?نص$/.test(after)) q += 0.5; if (/تين$/.test(n)) q = Math.max(q, 2);
      const F = FOODS[id]; if (F) hits.push(foodItem(F, r0(F.unit[1] * q)));
      t = t.slice(0, i) + " ".repeat(end - i) + t.slice(end);
    }
  }
  const merged = []; for (const h of hits) { const e = merged.find(x => x.key === h.key); if (e) e.grams += h.grams; else merged.push(h); }
  return merged;
}
const TEXT_PROMPT = text => `You are a dietitian for Saudi/Gulf food. The user described what they ate, in Saudi Arabic dialect: """${text.slice(0, 400)}"""
Known foods (use exact keys when matching):
${Object.values(FOODS).map(f => `${f.id} = ${f.ar} (${f.unit[0]} ${f.unit[1]} g)`).join("\n")}
Convert to items with realistic grams. Unknown food: key "other" with name_ar and per-100g carb_per100, fiber_per100, protein_per100, fat_per100, kcal_per100, gi.
Reply ONLY JSON: {"items":[{"key":"kabsa_chicken","name_ar":"كبسة دجاج","grams":350,"confidence":0.8}],"oil":"normal"}`;
function aiItems(out) { return (Array.isArray(out.items) ? out.items : []).map(x => { const g = Math.max(0, Number(x.grams) || 0), conf = clamp(Number(x.confidence) || 0.5, 0, 1);
  if (FOODS[x.key]) return foodItem(FOODS[x.key], g, {conf});
  const name = String(x.name_ar || x.name_en || "صنف").slice(0, 60), c = +x.carb_per100 || 0, f = +x.fiber_per100 || 0, p = +x.protein_per100 || 0, fat = +x.fat_per100 || 0;
  return {key: "ai", name, grams: g, conf, data: {id: "ai", ar: name, cat: "other", kcal: +x.kcal_per100 || (c * 4 + p * 4 + fat * 9), c, f, p, fat, gi: clamp(+x.gi || 60, 0, 100), src: "AI", unit: ["حصة", Math.max(20, r0(g / 2) || 50)], liquid: !!x.liquid}}; }).filter(i => i.grams > 0); }
function openVoiceSheet() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  openSheet(`<h2 style="font-size:1.35rem">وش أكلت؟</h2><p class="muted">قلها مثل ما تتكلم: «صحن كبسة دجاج وسلطة وثلاث تمرات وكاسة لبن».</p>
    ${SR ? `<button class="btn primary block" id="vc-mic" style="min-height:70px">${ic("mic")} اضغط وتكلم</button>` : ""}
    <div class="field"><label for="vc-t">${SR ? "أو اكتبها" : "اكتبها"}</label><textarea id="vc-t" class="input" rows="3" style="min-height:96px;padding-top:12px"></textarea></div>
    <div id="vc-msg"></div><button class="btn primary block" id="vc-go">أضف الأكل</button><button class="btn ghost block" data-close>إلغاء</button>`, (sh, close) => {
    const ta = $("#vc-t", sh), msg = h => $("#vc-msg", sh).innerHTML = h;
    if (SR) { let rec = null; $("#vc-mic", sh).onclick = () => { if (rec) { rec.stop(); return; } rec = new SR(); rec.lang = "ar-SA"; rec.interimResults = true; rec.continuous = false;
      $("#vc-mic", sh).innerHTML = `${ic("mic")} أسمعك… اضغط للإيقاف`;
      rec.onresult = e => { ta.value = [...e.results].map(r => r[0].transcript).join(" "); };
      rec.onerror = () => msg(`<div class="note">${ic("mic")}<span>ما قدرنا نسمعك. اكتبها بدالها.</span></div>`);
      rec.onend = () => { rec = null; $("#vc-mic", sh).innerHTML = `${ic("mic")} اضغط وتكلم`; if (ta.value.trim()) $("#vc-go", sh).click(); }; rec.start(); }; }
    $("#vc-go", sh).onclick = async () => { const text = ta.value.trim(); if (!text) return; const b = $("#vc-go", sh); b.disabled = true; b.textContent = "نفهمها…"; let items = [];
      if (aiReady()) { try { const out = parseJSON(await aiCall(aiSettings(), [{text: TEXT_PROMPT(text)}])); items = aiItems(out); if (out.oil) S.scan.ctx.oil = out.oil; } catch (e) { items = []; } }
      if (!items.length) items = parseMealText(text);
      b.disabled = false; b.textContent = "أضف الأكل";
      if (!items.length) { msg(`<div class="note bad">${ic("x")}<span>ما عرفنا الأكل. جرّب أسماء ثانية أو اختره بالبحث.</span></div>`); return; }
      S.scan.items.push(...items); close(); renderScan(); toast(`انضاف ${items.length} ${items.length > 2 ? "أصناف" : "صنف"}، راجع الكميات`); };
  });
}

/* ---------- AI provider: app server (Supabase function) by default ---------- */
function aiSettings() { const s = S.settings; if (s.provider === "gemini" && s.key) return s; if (s.provider === "worker" && s.endpoint) return s; return {...s, provider: "cloud"}; }
async function cloudAI(parts, signal) {
  if (!Cloud.user) throw new Error("login");
  const {data: {session}} = await Cloud.sb.auth.getSession();
  const r = await fetch(window.PGA_CONFIG.supabaseUrl + "/functions/v1/analyze", {method: "POST", signal, headers: {"content-type": "application/json", apikey: window.PGA_CONFIG.supabaseKey, authorization: "Bearer " + session.access_token}, body: JSON.stringify({parts})});
  if (!r.ok) throw new Error("http" + r.status); const d = await r.json(); return d.text || "";
}

/* ---------- lab report photo → fills A1c / fasting ---------- */
const LAB_PROMPT = `Read this medical lab report photo. Return ONLY JSON: {"a1c": number or null (HbA1c in %), "a1c_prev": number or null (an older HbA1c if shown), "fbg": number or null (fasting glucose in mg/dL; convert mmol/L ×18), "date": "YYYY-MM-DD" or null}. Use only values clearly printed.`;
async function readLabPhoto(file) { const {b64} = await processImage(file); return parseJSON(await aiCall(aiSettings(), [{inline_data: {mime_type: "image/jpeg", data: b64}}, {text: LAB_PROMPT}])); }

/* ---------- daily targets ---------- */
function targets(p) { if (!p || !p.weight || !p.height || !p.age) return null;
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === "f" ? -161 : 5), act = {low: 1.3, mid: 1.5, high: 1.7}[p.activity] || 1.4, tdee = bmr * act, b = bmi(p);
  const kcal = r0(b >= 25 ? Math.max(p.sex === "f" ? 1200 : 1500, tdee - 500) : tdee), carbShare = ["pre", "t2"].includes(p.status) ? 0.4 : 0.45;
  return {kcal, carb: r0(kcal * carbShare / 4), protein: r0(((p.cond || {}).ckd ? 0.8 : 1.0) * Math.min(p.weight, 25 * Math.pow(p.height / 100, 2))), fiber: p.sex === "f" ? 25 : 30, lose: b >= 25}; }
function dayTotals(ts = Date.now()) { const T = {kcal: 0, c: 0, p: 0, f: 0}; for (const m of S.meals) if (sameDay(m.ts, ts)) { const t = mealTotals(m); T.kcal += t.kcal; T.c += t.c; T.p += t.p; T.f += t.f; } return T; }
function macroCardHTML() { const tg = targets(S.profile); if (!tg) return ""; const T = dayTotals();
  const bar = (l, v, max, u) => { const pct = clamp(v / max * 100, 0, 100), over = v > max * 1.05; return `<div class="mrow"><div class="row between"><span>${l}</span><span class="small"><b class="num">${r0(v)}</b> <span class="muted">من ${max} ${u}</span></span></div><div class="mbar"><i style="width:${pct}%;background:${over ? "var(--gE)" : "var(--brand2)"}"></i></div></div>`; };
  return `<div class="card"><div class="row between"><h3>أكلك اليوم</h3><span class="xs muted">${tg.lose ? "هدف نزول وزن هادئ" : "هدف ثبات الوزن"}</span></div>
    ${bar("السعرات", T.kcal, tg.kcal, "")}${bar("النشويات", T.c, tg.carb, "جم")}${bar("البروتين", T.p, tg.protein, "جم")}${bar("الألياف", T.f, tg.fiber, "جم")}</div>`; }

/* ---------- weight ---------- */
function openWeightSheet() { const p = S.profile;
  openSheet(`<h2 style="font-size:1.35rem">سجّل وزنك</h2><div class="field"><label for="wt">الوزن اليوم</label><div class="unitbox"><input id="wt" type="number" inputmode="decimal" step="0.1" value="${p.weight || ""}"><span>كجم</span></div></div>
    <button class="btn primary block" data-a="s">احفظ</button>`, (sh, close) => { $("[data-a=s]", sh).onclick = async () => { const w = parseFloat($("#wt", sh).value); if (!(w >= 30 && w <= 300)) return toast("اكتب وزن صحيح");
      const np = {...p, weight: w, updated: Date.now(), weightLog: [...(p.weightLog || []), {ts: Date.now(), w}].slice(-80)}; await saveKV("profile", np);
      if (!S.model || !S.model.calibrated) await saveKV("model", {...priorModel(np), n: (S.model || {}).n || 0}); close(); toast("انحفظ وزنك"); route(); }; }); }
function weightSVG(log) { const pts = log.slice(-30); if (pts.length < 2) return ""; const W = 360, H = 140, L = 30, R = 10, T = 14, B = 22, ws = pts.map(x => x.w), lo = Math.floor(Math.min(...ws) - 1), hi = Math.ceil(Math.max(...ws) + 1), t0 = pts[0].ts, t1 = pts[pts.length - 1].ts || t0 + 1;
  const X = t => L + (W - L - R) * (t - t0) / Math.max(1, t1 - t0), Y = v => T + (H - T - B) * (1 - (v - lo) / Math.max(1, hi - lo));
  return `<svg viewBox="0 0 ${W} ${H}" style="direction:ltr" role="img" aria-label="الوزن"><text x="${L - 6}" y="${Y(hi) + 4}" font-size="10.5" text-anchor="end" fill="var(--muted)">${hi}</text><text x="${L - 6}" y="${Y(lo) + 4}" font-size="10.5" text-anchor="end" fill="var(--muted)">${lo}</text>
    <path d="M${pts.map(x => X(x.ts).toFixed(1) + "," + Y(x.w).toFixed(1)).join("L")}" fill="none" stroke="var(--brand2)" stroke-width="3" stroke-linejoin="round"/>${pts.map(x => `<circle cx="${X(x.ts)}" cy="${Y(x.w)}" r="4" fill="var(--brand2)"/>`).join("")}
    <text x="${X(t1)}" y="${Y(ws[ws.length - 1]) - 9}" font-size="12" font-weight="700" text-anchor="end" fill="var(--ink)">${ws[ws.length - 1]}</text></svg>`; }

/* ---------- Ramadan ---------- */
function ramadanCardHTML() { if (!S.settings.ramadan) return ""; const m = (S.profile || {}).meds || {};
  return `<div class="card" style="background:#FFF8EC;border-color:#F3DDB0"><div class="row" style="gap:10px"><span class="oi">${ic("moon")}</span><h3>وضع رمضان</h3></div>
    <ul class="small" style="margin:0;padding-inline-start:20px;display:grid;gap:4px"><li>افطر على ٣ تمرات وماء، وصلِّ، وبعدها كمّل الأكل. هذا يخفف ارتفاع السكر.</li><li>أخّر السحور، وخلّه فيه بروتين وألياف (فول، بيض، لبن، خبز بُر).</li><li>اشرب ٨ أكواب ماء بين الإفطار والسحور.</li><li>قِس سكرك قبل الإفطار بساعة، وبعده بساعتين.</li></ul>
    ${m.ins || m.su ? `<div class="note bad">${ic("shield")}<span><b>أدويتك تسبب هبوط وقت الصيام.</b> لازم الطبيب يعدّل الجرعات قبل رمضان. إذا السكر أقل من ٧٠ أفطر فوراً.</span></div>` : `<p class="xs muted">إذا نزل السكر تحت ٧٠ أو فوق ٣٠٠ وقت الصيام، أفطر. هذا رأي الأطباء والعلماء.</p>`}</div>`; }
const TIME_CHIPS = () => S.settings.ramadan ? [["iftar", "إفطار"], ["evening", "بين الإفطار والسحور"], ["suhoor", "سحور"]] : [["morning", "فطور"], ["noon", "غداء"], ["evening", "عشاء"], ["iftar", "إفطار صائم"]];

/* ---------- caregivers (أتابع / يتابعني) ---------- */
const Care = {follow: [], followers: [], alerts: []};
async function refreshCare() { if (!Cloud.user) return;
  try { const {data: links} = await Cloud.sb.from("care_links").select("*"); const me = Cloud.user.id;
    const ownIds = (links || []).filter(l => l.follower_id === me).map(l => l.owner_id), folIds = (links || []).filter(l => l.owner_id === me).map(l => l.follower_id);
    const {data: profs} = ownIds.length ? await Cloud.sb.from("profiles").select("user_id,profile").in("user_id", ownIds) : {data: []};
    const since = new Date(Date.now() - 864e5).toISOString(), {data: rs} = ownIds.length ? await Cloud.sb.from("readings").select("user_id,v,ts,kind").in("user_id", ownIds).gte("ts", since).order("ts", {ascending: false}) : {data: []};
    Care.follow = ownIds.map(id => { const pr = (profs || []).find(x => x.user_id === id), mine = (rs || []).filter(r => r.user_id === id); return {id, name: (pr && pr.profile && pr.profile.name) || "مستخدم", last: mine[0], bad: mine.filter(r => r.v < 70 || r.v >= 250)}; });
    Care.followers = folIds; Care.alerts = Care.follow.filter(f => f.bad.length);
    if ((!location.hash || location.hash === "#today") && Care.alerts.length && !$(".sheet-bg")) viewToday();
  } catch (e) {} }
function careAlertHTML() { return Care.alerts.map(f => `<button class="card task alert" data-care="${f.id}"><span class="ic">${ic("family")}</span><span><b>${esc(f.name)}: قراءة ${f.bad[0].v < 70 ? "منخفضة" : "عالية"} <span class="num">${f.bad[0].v}</span></b><br><span class="small">${fmtDay(new Date(f.bad[0].ts).getTime())} ${fmtTime(new Date(f.bad[0].ts).getTime())} · اطمّن عليه</span></span>${ic("next")}</button>`).join(""); }
function careCardHTML() {
  if (!Cloud.on) return "";
  if (!Cloud.user) return `<div class="card"><div class="lrow"><span class="oi">${ic("family")}</span><span><b>تابع سكر أهلك</b><br><span class="xs muted">سجّل بإيميلك عشان تشارك بياناتك مع ولدك أو بنتك، أو تتابع أبوك وأمك</span></span><span></span></div></div>`;
  return `<div class="card"><h3>العائلة</h3><p class="small muted">شارك سكرك مع أحد أهلك عشان يطمّن عليك، أو تابع سكر أبوك وأمك من جوالك.</p>
    ${Care.follow.map(f => `<button class="lrow" data-care="${f.id}"><span class="avatar" style="width:44px;height:44px">${esc(f.name.charAt(0))}</span><span><b>${esc(f.name)}</b><br><span class="xs muted">${f.last ? `آخر قراءة <b class="num">${f.last.v}</b> · ${fmtTime(new Date(f.last.ts).getTime())}` : "ما فيه قراءات آخر ٢٤ ساعة"}</span></span>${ic("next")}</button>`).join("")}
    ${Care.followers.length ? `<p class="xs muted">يتابعك ${Care.followers.length} ${Care.followers.length > 1 ? "أشخاص" : "شخص"}.</p>` : ""}
    <div class="grid2"><button class="btn sm" data-a="share">${ic("share")} شارك سكري</button><button class="btn sm" data-a="follow">${ic("family")} أتابع أحد</button></div></div>`; }
function bindCare(root) {
  $$("[data-care]", root).forEach(b => b.onclick = () => openFollowSheet(b.dataset.care));
  $("[data-a=share]", root) && ($("[data-a=share]", root).onclick = async () => {
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), x => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[x % 31]).join("");
    const {error} = await Cloud.sb.from("care_invites").insert({code, owner_id: Cloud.user.id}); if (error) return toast("ما قدرنا ننشئ الرمز");
    const msg = `أبيك تتابع سكري في تطبيق Preventive Glucose AI. افتح ${location.origin + location.pathname} وسجّل بإيميلك، وبعدها من «حسابي» اختر «أتابع أحد» واكتب الرمز: ${code}`;
    openSheet(`<h2 style="font-size:1.35rem">رمز المشاركة</h2><p class="muted">أرسله للي تبيه يتابعك. صالح لمدة يومين ولمرة وحدة.</p>
      <div class="beforeafter"><div class="box" style="background:var(--soft)"><b class="num ltr" style="letter-spacing:.2em;font-size:2rem">${code}</b></div></div>
      <a class="btn primary block" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${ic("share")} أرسله بالواتساب</a><button class="btn ghost block" data-close>تم</button>
      <p class="xs muted">اللي يتابعك يشوف قراءاتك ووجباتك بس، وما يقدر يعدّل شيء. تقدر توقف المشاركة من هنا بأي وقت.</p>`); });
  $("[data-a=follow]", root) && ($("[data-a=follow]", root).onclick = () => openSheet(`<h2 style="font-size:1.35rem">أتابع أحد</h2><p class="muted">اكتب الرمز اللي وصلك منه.</p>
      <div class="field"><input id="cv" class="input bignum ltr" maxlength="6" style="letter-spacing:.2em;text-transform:uppercase" placeholder="ABC123"></div><div id="cm"></div><button class="btn primary block" data-a="go">تابع</button>`, (sh, close) => {
      $("[data-a=go]", sh).onclick = async () => { const code = $("#cv", sh).value.trim().toUpperCase(); if (code.length !== 6) return;
        const {data, error} = await Cloud.sb.rpc("accept_care_invite", {p_code: code});
        if (error) { $("#cm", sh).innerHTML = `<div class="note bad">${ic("x")}<span>${/self/.test(error.message) ? "هذا رمزك أنت." : "الرمز غير صحيح أو انتهى."}</span></div>`; return; }
        close(); toast("صرت تتابع " + ((data && data.name) || "")); await refreshCare(); route(); }; }));
}
async function openFollowSheet(id) {
  const close = openSheet(`<div id="fw"><p class="muted">نحمّل…</p></div>`);
  const [{data: pr}, {data: rs}, {data: ms}] = await Promise.all([Cloud.sb.from("profiles").select("profile").eq("user_id", id).maybeSingle(),
    Cloud.sb.from("readings").select("v,ts,kind").eq("user_id", id).gte("ts", new Date(Date.now() - 7 * 864e5).toISOString()).order("ts", {ascending: false}).limit(60),
    Cloud.sb.from("meals").select("ts,grade,peak,data").eq("user_id", id).gte("ts", new Date(Date.now() - 3 * 864e5).toISOString()).order("ts", {ascending: false}).limit(10)]);
  const p = (pr && pr.profile) || {}, el = $("#fw"); if (!el) return;
  const start = Date.now() - 7 * 864e5, pts = (rs || []).map(r => { const t = new Date(r.ts).getTime(); return [(t - start) / 864e5 * 20, r.v, r.v < 70 || r.v >= 180 ? "var(--gE)" : r.v >= 140 ? "var(--gC)" : "var(--gA)"]; });
  el.innerHTML = `<div class="row" style="gap:12px"><span class="avatar" style="width:56px;height:56px;font-size:1.4rem">${esc((p.name || "؟").charAt(0))}</span><div><h2 style="font-size:1.3rem">${esc(p.name || "")}</h2><span class="small muted">${p.age || ""} سنة</span></div></div>
    <div class="card"><h3>قراءات آخر أسبوع</h3>${pts.length ? `<div class="chart">${curveSVG([{pts, color: "var(--brand2)", dots: true, line: false, r: 6}], {xmax: 140, ticks: [0, 40, 80, 120], tickFmt: t => new Date(start + t / 20 * 864e5).toLocaleDateString(LOC, {day: "numeric", month: "numeric"})})}</div>` : `<p class="muted">ما فيه قراءات.</p>`}
      ${(rs || []).slice(0, 6).map(r => `<div class="lrow"><span class="oi">${ic("drop")}</span><span><b class="num">${r.v}</b><br><span class="xs muted">${fmtDay(new Date(r.ts).getTime())} ${fmtTime(new Date(r.ts).getTime())}</span></span><span class="pill ${r.v < 70 || r.v >= 180 ? "gs-E gt-E" : r.v >= 140 ? "gs-C gt-C" : "gs-A gt-A"}">${r.v < 70 ? "منخفض" : r.v < 140 ? "طبيعي" : r.v < 180 ? "مرتفع" : "عالي"}</span></div>`).join("")}</div>
    <div class="card"><h3>وجبات آخر ٣ أيام</h3>${(ms || []).length ? (ms || []).map(m => `<div class="lrow"><span class="grade g-${m.grade}" style="width:42px;height:42px;font-size:1.1rem">${m.grade}</span><span><b>${esc((m.data.items || []).map(i => i.name).slice(0, 3).join("، "))}</b><br><span class="xs muted">${fmtDay(new Date(m.ts).getTime())} · المتوقع ${r0(m.peak)}</span></span><span></span></div>`).join("") : `<p class="muted">ما سجّل وجبات.</p>`}</div>
    <button class="btn ghost block" data-a="unf" style="color:var(--gE)">أوقف المتابعة</button><button class="btn block" data-close>إغلاق</button>`;
  $$("[data-close]", el).forEach(b => b.onclick = close);
  $("[data-a=unf]", el).onclick = async () => { await Cloud.sb.from("care_links").delete().eq("owner_id", id).eq("follower_id", Cloud.user.id); close(); toast("وقفت المتابعة"); await refreshCare(); route(); };
}

/* ---------- doctor report ---------- */
function foodImpact() { const md = curModel(), byFood = {};
  for (const m of S.meals) { const rs = mealReadings(m); if (!rs.length) continue; const rise = Math.max(...rs.map(r => r.v)) - (m.pred.g0 || md.g0);
    const its = m.items.map(it => ({...it, data: itemData(it)})).filter(it => it.data), T = totals(its.map(i => ({g: i.grams, data: i.data})));
    for (const it of its) { const gl = Math.max(0, it.data.c - it.data.f) * it.grams / 100 * it.data.gi / 100; if (T.gl && gl / T.gl >= 0.25) (byFood[it.name] = byFood[it.name] || {a: [], key: it.key}).a.push(rise); } }
  return Object.entries(byFood).map(([n, o]) => ({n, key: o.key, v: avg(o.a), c: o.a.length})).sort((a, b) => b.v - a.v); }
function reportStats(days) { const since = Date.now() - days * 864e5, rs = S.readings.filter(r => r.ts >= since);
  const vals = rs.map(r => r.v), a = avg(vals), fast = avg(rs.filter(r => r.kind === "fasting").map(r => r.v)), post = avg(rs.filter(r => r.kind === "post").map(r => r.v));
  return {rs, n: rs.length, avg: a, fast, post, inRange: vals.length ? vals.filter(v => v >= 70 && v <= 180).length / vals.length * 100 : null, low: vals.filter(v => v < 70).length, high: vals.filter(v => v > 250).length,
    eA1c: vals.length >= 20 ? (a + 46.7) / 28.7 : null, meals: S.meals.filter(m => m.ts >= since), days}; }
function renderReport() {
  const p = S.profile || {}, days = S.repDays || 30, st = reportStats(days), top = foodImpact().slice(0, 5), start = Date.now() - days * 864e5, b = bmi(p);
  const DX = {none: "بدون تشخيص", pre: "ما قبل السكري", t2: "سكري النوع الثاني", t1: "سكري النوع الأول", gdm: "سكري الحمل"}, MED = {met: "ميتفورمين", glp: "GLP-1", sglt: "SGLT2", acar: "أكاربوز", su: "سلفونيل يوريا", ins: "إنسولين"};
  const meds = Object.entries(p.meds || {}).filter(([, v]) => v).map(([k]) => MED[k]).join("، ") || "لا يوجد";
  const pts = st.rs.map(r => [(r.ts - start) / 864e5 / days * 140, r.v, r.v < 70 || r.v >= 180 ? "var(--gE)" : r.v >= 140 ? "var(--gC)" : "var(--gA)"]);
  const gc = {A: 0, B: 0, C: 0, D: 0, E: 0}; st.meals.forEach(m => gc[m.grade]++);
  $("#flow").innerHTML = `<div class="flowwrap report">
    <div class="flowhead noprint"><button class="iconbtn" id="rp-x" aria-label="إغلاق">${ic("x")}</button><span class="steps-txt">تقرير للطبيب</span></div>
    <div class="flowbody">
      <div class="row between"><div><h2 style="font-size:1.5rem">تقرير السكر</h2><span class="small muted">${new Date(start).toLocaleDateString(LOC)} — ${new Date().toLocaleDateString(LOC)}</span></div><img src="icon.svg" width="44" height="44" alt=""></div>
      <div class="chips noprint">${[14, 30, 90].map(d => `<button class="chip" data-d="${d}" aria-pressed="${d === days}">آخر ${d} يوم</button>`).join("")}</div>
      <table class="tbl"><tr><td>الاسم</td><td><b>${esc(p.name || "")}</b> · ${p.age || "—"} سنة · ${p.sex === "f" ? "أنثى" : "ذكر"}</td></tr><tr><td>التشخيص</td><td>${DX[p.status] || "—"}${p.dxYears ? " · المدة " + esc(p.dxYears) + " سنة" : ""}</td></tr>
        <tr><td>الأدوية</td><td>${esc(meds)}</td></tr><tr><td>الوزن</td><td>${p.weight || "—"} كجم · كتلة الجسم ${b ? r1(b) : "—"}</td></tr><tr><td>آخر تراكمي (مختبر)</td><td>${p.a1c ? p.a1c + "%" : "—"}${p.a1cPrev ? " · قبله " + p.a1cPrev + "%" : ""}</td></tr></table>
      <div class="kpis"><div class="kpi"><small>عدد القراءات</small><b class="num">${st.n}</b></div><div class="kpi"><small>المتوسط</small><b class="num">${st.avg ? r0(st.avg) : "—"}</b></div><div class="kpi"><small>ضمن ٧٠–١٨٠</small><b class="num">${st.inRange != null ? r0(st.inRange) + "%" : "—"}</b></div></div>
      <div class="kpis"><div class="kpi"><small>متوسط الصيام</small><b class="num">${st.fast ? r0(st.fast) : "—"}</b></div><div class="kpi"><small>متوسط بعد الأكل</small><b class="num">${st.post ? r0(st.post) : "—"}</b></div><div class="kpi"><small>هبوط تحت ٧٠</small><b class="num">${st.low}</b></div></div>
      ${st.eA1c ? `<div class="note info">${ic("chart")}<span>التراكمي التقديري من القراءات: <b class="num">${r1(st.eA1c)}%</b>. تقريبي، لأن قراءات الوخز أغلبها بعد الأكل. المعتمد هو تحليل المختبر.</span></div>` : ""}
      <div class="card"><h3>القراءات</h3>${pts.length ? `<div class="chart">${curveSVG([{pts, color: "var(--brand2)", dots: true, line: false, r: 5}], {xmax: 140, ticks: [0, 35, 70, 105, 140], tickFmt: t => new Date(start + t / 140 * days * 864e5).toLocaleDateString(LOC, {day: "numeric", month: "numeric"}), label: "القراءات"})}</div>` : `<p class="muted">ما فيه قراءات في هذي الفترة.</p>`}</div>
      <div class="card"><h3>الوجبات (${st.meals.length})</h3>${st.meals.length ? `<div class="bar">${"ABCDE".split("").map(k => gc[k] ? `<i class="g-${k}" style="width:${gc[k] / st.meals.length * 100}%"></i>` : "").join("")}</div><div class="legend">${"ABCDE".split("").filter(k => gc[k]).map(k => `<span><i class="dot g-${k}"></i>${k}: ${gc[k]}</span>`).join("")}</div><p class="xs muted">A = تأثير بسيط على السكر … E = ارتفاع كبير</p>` : `<p class="muted">—</p>`}
        ${top.length ? `<span class="flabel">أكلات رفعت سكره أكثر شي</span><table class="tbl"><tr><th>الأكلة</th><th>متوسط الارتفاع</th><th>مرات</th></tr>${top.map(x => `<tr><td>${esc(x.n)}</td><td class="num">${sign(x.v)}</td><td class="num">${x.c}</td></tr>`).join("")}</table>` : ""}</div>
      <div class="card"><h3>آخر القراءات</h3><table class="tbl"><tr><th>التاريخ</th><th>النوع</th><th>القراءة</th></tr>${st.rs.filter(r => r.kind !== "cgm").slice(0, 25).map(r => `<tr><td>${new Date(r.ts).toLocaleDateString(LOC, {day: "numeric", month: "numeric"})} ${fmtTime(r.ts)}</td><td>${{fasting: "صائم", pre: "قبل الأكل", post: "بعد الأكل" + (r.minutes ? " " + r.minutes + "د" : ""), random: "عشوائية"}[r.kind] || ""}</td><td class="num"><b>${r.v}</b></td></tr>`).join("")}</table></div>
      <p class="xs muted">من تطبيق Preventive Glucose AI. القراءات أدخلها المستخدم بنفسه. التقرير للمساعدة وليس تشخيصاً.</p>
    </div>
    <div class="flowfoot noprint"><button class="btn primary block" id="rp-print">${ic("download")} احفظه PDF أو اطبعه</button><a class="btn block" id="rp-wa" target="_blank" rel="noopener">${ic("share")} أرسل ملخص بالواتساب</a></div></div>`;
  const R = $("#flow"); $("#rp-x", R).onclick = () => go("me");
  $$("[data-d]", R).forEach(b => b.onclick = () => { S.repDays = +b.dataset.d; renderReport(); });
  $("#rp-print", R).onclick = () => window.print();
  const txt = `تقرير السكر — ${p.name || ""}\nآخر ${days} يوم\nعدد القراءات: ${st.n}\nالمتوسط: ${st.avg ? r0(st.avg) : "—"}\nمتوسط الصيام: ${st.fast ? r0(st.fast) : "—"}\nمتوسط بعد الأكل: ${st.post ? r0(st.post) : "—"}\nضمن ٧٠–١٨٠: ${st.inRange != null ? r0(st.inRange) + "%" : "—"}\nهبوط تحت ٧٠: ${st.low} مرة\nآخر تراكمي (مختبر): ${p.a1c ? p.a1c + "%" : "—"}${top.length ? "\nأكثر أكلات رفعت السكر: " + top.slice(0, 3).map(x => x.n).join("، ") : ""}`;
  $("#rp-wa", R).href = "https://wa.me/?text=" + encodeURIComponent(txt);
}

/* ---------- FreeStyle Libre (LibreView CSV) import ---------- */
function parseLibreCSV(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean); let hi = lines.findIndex(l => /Device Timestamp|Historic Glucose/i.test(l)); if (hi < 0) throw new Error("format");
  const delim = [",", ";", "\t"].sort((a, b) => lines[hi].split(b).length - lines[hi].split(a).length)[0], H = lines[hi].split(delim).map(s => s.trim().replace(/"/g, ""));
  const iT = H.findIndex(h => /Device Timestamp/i.test(h)), iH = H.findIndex(h => /Historic Glucose/i.test(h)), iS = H.findIndex(h => /Scan Glucose/i.test(h)), mmol = H.some(h => /mmol/i.test(h));
  const rows = lines.slice(hi + 1).map(l => l.split(delim).map(s => s.trim().replace(/"/g, ""))); const firsts = rows.map(r => +(r[iT] || "").split(/[-\/.]/)[0]); const dmy = firsts.some(x => x > 12);
  const out = [];
  for (const r of rows) { const raw = r[iH] || (iS >= 0 ? r[iS] : ""); if (!raw || !r[iT]) continue; let v = parseFloat(raw.replace(",", ".")); if (!isFinite(v)) continue; if (mmol) v = v * 18;
    let ts; const m = r[iT].match(/^(\d{1,4})[-\/.](\d{1,2})[-\/.](\d{2,4})[ T](\d{1,2}):(\d{2})/);
    if (m) { if (m[1].length === 4) ts = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime(); else { const [a, b2] = [+m[1], +m[2]], y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; ts = dmy ? new Date(y, b2 - 1, a, +m[4], +m[5]).getTime() : new Date(y, a - 1, b2, +m[4], +m[5]).getTime(); } }
    else ts = Date.parse(r[iT]); if (isFinite(ts)) out.push({ts, v: r0(v)}); }
  return out.sort((a, b) => a.ts - b.ts);
}
async function importLibre(file) {
  const pts = parseLibreCSV(await file.text()).filter(p => p.ts > Date.now() - 45 * 864e5 && p.v >= 30 && p.v <= 600), have = new Set(S.readings.map(r => r.id)), add = [];
  for (const p of pts) { const id = "cgm-" + p.ts; if (have.has(id)) continue; add.push({id, ts: p.ts, v: p.v, kind: "cgm"}); }
  for (const r of add) { S.readings.push(r); await Store.put("readings", r); }
  if (Cloud.user && add.length) Cloud.safe(async () => { for (let i = 0; i < add.length; i += 400) { const {error} = await Cloud.sb.from("readings").upsert(add.slice(i, i + 400).map(r => ({id: r.id, user_id: Cloud.user.id, ts: new Date(r.ts).toISOString(), v: r.v, kind: "cgm", data: r}))); if (error) throw error; } });
  let linked = 0; const cg = S.readings.filter(r => r.kind === "cgm");
  for (const m of S.meals) { if (mealReadings(m).length) continue; const want = m.ts + m.measureAt * 60000, near = cg.reduce((best, r) => Math.abs(r.ts - want) < Math.abs((best || {ts: 1e18}).ts - want) ? r : best, null);
    if (near && Math.abs(near.ts - want) <= 8 * 60000) { await saveReading({v: near.v, kind: "post", meal: m, minutes: r0((near.ts - m.ts) / 60000), followed: m.combo ? "yes" : null, ts: near.ts}); linked++; } }
  S.readings.sort((a, b) => b.ts - a.ts); return {added: add.length, linked};
}

/* ---------- install hint ---------- */
let installEvt = null; window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; });
function installCardHTML() { if (matchMedia("(display-mode: standalone)").matches || navigator.standalone) return "";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return `<div class="card soft"><div class="lrow"><span class="oi">${ic("download")}</span><span><b>ثبّته على شاشة جوالك</b><br><span class="xs muted">${ios ? "من سفاري: اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»" : "يفتح مثل التطبيق، وتوصلك التذكيرات أسرع"}</span></span>${!ios && installEvt ? `<button class="btn sm primary" data-a="inst">ثبّت</button>` : "<span></span>"}</div></div>`; }
function bindInstall(root) { $("[data-a=inst]", root) && ($("[data-a=inst]", root).onclick = async () => { installEvt.prompt(); installEvt = null; viewMe(); }); }
