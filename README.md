# Preventive Glucose AI — v4 (MVP)

Predicts your blood sugar after a meal **before** you eat it, from a photo, and gives a short plan (water, eating order, walking, swaps) that lowers it. Learns from your readings.

Live: https://abo7km6070-stack.github.io/glucose-ai/

## What's new in v4
- White, large-type design for older users.
- Email sign-in with a 6-digit code (Supabase) — data syncs across devices; "use without account" still works offline.
- Detailed registration: diabetes type and duration, current + previous HbA1c (trend up/down), fasting sugar, weight trend, waist, BMI with healthy range, activity, family history, meds, safety conditions.
- Every meal asks "how much is your sugar now?" before the prediction.
- Clearer result: grade, numbered checklist plan (before / during / after eating) with each step's effect, big before→after numbers, one chart with a "with plan / without" toggle.
- Food photos (Wikimedia Commons) in the library, search and meals.
- 8,950-item food database: 161 Saudi dishes (SFDA 2026 tables, published Saudi studies) + 8,789 USDA SR28 foods.

## Backend (Supabase)
1. Create a project, run `supabase/schema.sql`, then `supabase/seed_foods_01..09.sql`.
2. Auth → URL configuration: set Site URL to the live link. Email template "Magic Link": include `{{ .Token }}` so users get a 6-digit code.
3. Put the project URL and the **publishable (anon) key** in `config.js`. Never put the service_role key in the site.

Tables: `profiles`, `meals`, `meal_items` (per-food grams/carbs/kcal for analytics), `readings`, `foods` (public read). Row-level security: each user reads/writes only their own rows; photos live in a private `meal-photos` bucket under the user's folder.

## Data sources
SFDA Saudi Food Composition Tables 2026 · Basaqr et al., Front Nutr 2025 · AlGeffari et al., Ann Saudi Med 2016 (dates GI) · USDA SR28 (public domain) · Buchanan & McKiddie 1967 · Shukla 2015 (food order) · Reynolds 2016 (post-meal walking). Food photos: Wikimedia Commons (CC0 / CC BY / CC BY-SA).

Not a diagnostic tool and not a substitute for a doctor.
