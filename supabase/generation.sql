-- Run once in Supabase Dashboard > SQL Editor (after schema.sql). Safe to re-run.
-- Lets generated_content track a study-material run (processing, ready, failed),
-- and keeps one row per lecture and profile so a lecture can hold both later.

alter table public.generated_content
  alter column content_json drop not null,
  add column if not exists status text not null default 'ready'
    check (status in ('processing', 'ready', 'failed')),
  add column if not exists error text,
  add column if not exists started_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Keep only the newest row if any lecture and profile pair was saved twice.
delete from public.generated_content a
using public.generated_content b
where a.lecture_id = b.lecture_id
  and a.profile_type = b.profile_type
  and (a.created_at, a.id) < (b.created_at, b.id);

create unique index if not exists generated_content_lecture_profile_key
  on public.generated_content (lecture_id, profile_type);
