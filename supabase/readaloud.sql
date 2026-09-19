-- Run once in Supabase Dashboard > SQL Editor (after schema.sql). Safe to re-run.
-- Read-aloud audio cache: a private bucket for the MP3 files, plus one row per file so the
-- app can find a cached file and add up how many characters a student has had spoken today.
-- Files live at "<user_id>/<lecture_id>/<hash>.mp3", so the first folder decides who owns them.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('readaloud', 'readaloud', false, 10485760, array['audio/mpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "readaloud: upload to own folder" on storage.objects;
drop policy if exists "readaloud: read own files" on storage.objects;
drop policy if exists "readaloud: replace own files" on storage.objects;
drop policy if exists "readaloud: delete own files" on storage.objects;

create policy "readaloud: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'readaloud' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "readaloud: read own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'readaloud' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "readaloud: replace own files" on storage.objects
  for update to authenticated
  using (bucket_id = 'readaloud' and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'readaloud' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "readaloud: delete own files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'readaloud' and (storage.foldername(name))[1] = (select auth.uid()::text));

create table if not exists public.read_aloud_audio (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  lecture_id uuid not null references public.lectures on delete cascade,
  section text not null check (section in ('summary', 'terms', 'outline')),
  -- Hash of voice + model + text, so changed material or a new voice makes a new file.
  text_hash text not null,
  path text not null,
  characters integer not null check (characters > 0),
  created_at timestamptz not null default now(),
  unique (user_id, path)
);

alter table public.read_aloud_audio enable row level security;

drop policy if exists "own audio" on public.read_aloud_audio;
create policy "own audio" on public.read_aloud_audio for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists read_aloud_audio_user_created_idx
  on public.read_aloud_audio (user_id, created_at desc);
