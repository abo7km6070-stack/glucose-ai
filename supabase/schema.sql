-- Preventive Glucose AI — Supabase schema (run once in SQL editor)
-- Every user sees only their own rows (RLS). The foods table is public read-only.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null, model jsonb, calib jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.meals (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ts timestamptz not null, grade text, peak numeric,
  data jsonb not null, photo_path text,
  updated_at timestamptz not null default now()
);
create table if not exists public.meal_items (
  id bigint generated always as identity primary key,
  meal_id text not null references public.meals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id text, name text, grams numeric, carbs numeric, fiber numeric, protein numeric, fat numeric, kcal numeric
);
create table if not exists public.readings (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ts timestamptz not null, v numeric not null, kind text,
  meal_id text references public.meals(id) on delete cascade,
  minutes int, expected numeric, followed text, data jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists meals_user_ts on public.meals(user_id, ts desc);
create index if not exists readings_user_ts on public.readings(user_id, ts desc);
create index if not exists meal_items_food on public.meal_items(food_id);

-- Food composition database (Saudi SFDA 2026 + studies + USDA SR28)
create table if not exists public.foods (
  id text primary key,
  name_ar text, name_en text, cat text,
  kcal numeric, carb numeric, fiber numeric, protein numeric, fat numeric, sugar numeric, sodium numeric,
  gi numeric, source text, unit_name text, unit_g numeric, liquid boolean default false, image_title text
);
create index if not exists foods_name_ar on public.foods using gin (to_tsvector('simple', coalesce(name_ar,'')));
create index if not exists foods_name_en on public.foods using gin (to_tsvector('english', coalesce(name_en,'')));

alter table public.profiles   enable row level security;
alter table public.meals      enable row level security;
alter table public.meal_items enable row level security;
alter table public.readings   enable row level security;
alter table public.foods      enable row level security;

do $$ declare t text; begin
  foreach t in array array['profiles','meals','meal_items','readings'] loop
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format('create policy own_rows on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;
drop policy if exists foods_read on public.foods;
create policy foods_read on public.foods for select to anon, authenticated using (true);

-- Private photo bucket: each user writes/reads only inside the folder named after their id
insert into storage.buckets (id, name, public) values ('meal-photos','meal-photos', false) on conflict (id) do nothing;
drop policy if exists photos_own on storage.objects;
create policy photos_own on storage.objects for all to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Anonymous analytics for the team (no user ids): which foods people log, and how far real readings land from predictions
create or replace view public.food_log_stats with (security_invoker = true) as
  select food_id, max(name) as name, count(*) as times_logged, round(avg(grams)) as avg_grams, round(avg(carbs),1) as avg_carbs
  from public.meal_items group by food_id;
