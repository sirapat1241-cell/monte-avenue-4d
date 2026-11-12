-- MONTE AVENUE 4D — Supabase schema
-- Run once in Supabase → SQL Editor → New query → paste all → Run.
-- Safe to run again (it only creates what is missing and replaces the functions/policies).

-- 1) Documents: daily reports (col = 'progress' | 'days')
create table if not exists public.docs (
  col        text not null,
  id         text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (col, id)
);

-- 2) People allowed to write (add e-mail addresses here)
create table if not exists public.editors (
  email text primary key,
  note  text,
  added_at timestamptz not null default now()
);

-- helper: is the signed-in user an editor?
create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.editors e where lower(e.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- helper: two-level jsonb merge — top-level keys merge, and inside an object field (e.g. "days")
-- each key is replaced whole (a re-saved day report replaces that day, other days are kept)
create or replace function public.jsonb_merge2(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select coalesce(a, '{}'::jsonb) || coalesce((
    select jsonb_object_agg(k,
      case when jsonb_typeof(a -> k) = 'object' and jsonb_typeof(b -> k) = 'object' then (a -> k) || (b -> k) else b -> k end)
    from jsonb_object_keys(b) k), '{}'::jsonb);
$$;
drop function if exists public.jsonb_deep_merge(jsonb, jsonb);

-- write one document (set or merge) — editors only; merge happens on the server so two people
-- reporting different activities/days at the same time never overwrite each other
create or replace function public.write_doc(p_col text, p_id text, p_data jsonb, p_merge boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  if not public.is_editor() then raise exception 'permission denied' using errcode = '42501'; end if;
  if p_col not in ('progress', 'days') then raise exception 'unknown collection %', p_col; end if;
  insert into public.docs as d (col, id, data, updated_at, updated_by)
    values (p_col, p_id, p_data, now(), auth.jwt() ->> 'email')
  on conflict (col, id) do update
    set data = case when p_merge then public.jsonb_merge2(d.data, excluded.data) else excluded.data end,
        updated_at = now(), updated_by = excluded.updated_by
  returning data into out;
  return out;
end $$;

-- 3) Row level security: everyone reads, nobody writes directly (only through write_doc)
alter table public.docs    enable row level security;
alter table public.editors enable row level security;
drop policy if exists docs_read on public.docs;
create policy docs_read on public.docs for select using (true);
-- editors table: no policies → not readable/writable from the web (manage it in the dashboard)

grant select on public.docs to anon, authenticated;
grant execute on function public.is_editor() to anon, authenticated;
grant execute on function public.write_doc(text, text, jsonb, boolean) to authenticated;
revoke execute on function public.write_doc(text, text, jsonb, boolean) from anon;

-- 4) Live updates
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;

-- 5) Photo storage: public bucket "photos" (read by anyone with the link, upload by editors, max 8 MB, images only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists photos_insert on storage.objects;
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_editor());

-- 6) >>> CHANGE THIS: put the e-mail addresses of people who may record reports <<<
insert into public.editors (email, note) values
  ('your-email@example.com', 'เจ้าของโครงการ')
on conflict (email) do nothing;
