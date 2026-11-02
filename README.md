# Preventive Glucose AI — MVP

توقّع منحنى السكر قبل اللقمة الأولى. موقع ثابت (HTML واحد) يشتغل على GitHub Pages مجاناً، والبيانات تنحفظ في جهاز المستخدم فقط.

## الملفات
- `index.html` — التطبيق كامل (ملف، معايرة بالجلوكوز، وجبة، سجل، مصادر).
- `worker.js` — Cloudflare Worker اختياري لتحليل صورة الوجبة (يخفي مفتاح API).
- `manifest.webmanifest`, `icon.svg`, `sw.js` — تثبيت على الشاشة الرئيسية والعمل بدون نت.

## تفعيل تحليل الصور (اختياري)
1. حساب مجاني على Cloudflare، ثم Workers & Pages ← Create Worker، والصق `worker.js`.
2. Settings ← Variables: أضف `ANTHROPIC_API_KEY` كـ Secret، و`ALLOWED_ORIGIN` = `https://abo7km6070-stack.github.io`.
3. انسخ رابط الـWorker وحطه في `AI_ENDPOINT` أعلى سكربت `index.html`.

تكلفة التحليل على مفتاح Anthropic حسب الاستخدام، والـWorker نفسه مجاني حتى ١٠٠ ألف طلب يومياً.

## تنبيه
أداة نمط حياة، ليست جهازاً طبياً ولا تُستخدم للتشخيص.
