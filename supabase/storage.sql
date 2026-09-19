-- Run once in Supabase Dashboard > SQL Editor (after schema.sql). Safe to re-run.
-- Private bucket for lecture recordings. Files live at "<user_id>/<file>", so
-- the first folder in the path decides who owns them.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lectures',
  'lectures',
  false,
  52428800, -- 50 MB, the Supabase free-plan per-file ceiling
  array[
    'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav',
    'audio/ogg', 'audio/webm', 'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "lectures: upload to own folder" on storage.objects;
drop policy if exists "lectures: read own files" on storage.objects;
drop policy if exists "lectures: delete own files" on storage.objects;

create policy "lectures: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'lectures' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "lectures: read own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'lectures' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "lectures: delete own files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'lectures' and (storage.foldername(name))[1] = (select auth.uid()::text));
