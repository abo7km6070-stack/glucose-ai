-- v5: family sharing (caregivers), AI usage limit, prediction accuracy view
create table if not exists public.care_links (
  owner_id uuid not null references auth.users(id) on delete cascade,
  follower_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, follower_id)
);
create table if not exists public.care_invites (
  code text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '2 days'
);
alter table public.care_links enable row level security;
alter table public.care_invites enable row level security;
drop policy if exists links_see on public.care_links;
create policy links_see on public.care_links for select to authenticated using ((select auth.uid()) in (owner_id, follower_id));
drop policy if exists links_del on public.care_links;
create policy links_del on public.care_links for delete to authenticated using ((select auth.uid()) in (owner_id, follower_id));
drop policy if exists invites_own on public.care_invites;
create policy invites_own on public.care_invites for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create or replace function public.is_follower(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.care_links where owner_id = o and follower_id = (select auth.uid()));
$$;
create or replace function public.accept_care_invite(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  select owner_id into o from public.care_invites where code = upper(p_code) and expires_at > now();
  if o is null then raise exception 'invalid'; end if;
  if o = auth.uid() then raise exception 'self'; end if;
  insert into public.care_links (owner_id, follower_id) values (o, auth.uid()) on conflict do nothing;
  delete from public.care_invites where code = upper(p_code);
  return json_build_object('owner', o, 'name', (select profile->>'name' from public.profiles where user_id = o));
end $$;
revoke execute on function public.accept_care_invite(text) from public, anon;
grant execute on function public.accept_care_invite(text) to authenticated;

do $$ declare t text; begin
  foreach t in array array['profiles','meals','meal_items','readings'] loop
    execute format('drop policy if exists follower_read on public.%I', t);
    execute format('create policy follower_read on public.%I for select to authenticated using (public.is_follower(user_id))', t);
  end loop;
end $$;
drop policy if exists photos_follower on storage.objects;
create policy photos_follower on storage.objects for select to authenticated
  using (bucket_id = 'meal-photos' and public.is_follower(((storage.foldername(name))[1])::uuid));

create table if not exists public.ai_usage (user_id uuid not null, day date not null, n int not null default 0, primary key (user_id, day));
alter table public.ai_usage enable row level security;
create or replace function public.bump_ai_usage(p_user uuid, p_day date) returns int
language sql security definer set search_path = public as $$
  insert into public.ai_usage (user_id, day, n) values (p_user, p_day, 1)
  on conflict (user_id, day) do update set n = public.ai_usage.n + 1 returning n;
$$;
revoke execute on function public.bump_ai_usage(uuid, date) from public, anon, authenticated;

-- team view (dashboard): how far real readings land from predictions, per week
create or replace view public.prediction_accuracy with (security_invoker = true) as
  select date_trunc('week', ts) as week, count(*) as readings, round(avg(abs(v - expected)), 1) as mean_abs_error, round(avg(v - expected), 1) as bias
  from public.readings where expected is not null group by 1 order by 1 desc;
select 'v5 ok' as result;
