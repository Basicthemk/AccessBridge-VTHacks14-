-- Run once in Supabase Dashboard > SQL Editor (after schema.sql). Safe to re-run.
-- Tracks transcription progress so the dashboard can show progress, ready, or failed.

alter table public.lectures
  add column if not exists transcript_status text not null default 'pending'
    check (transcript_status in ('pending', 'processing', 'ready', 'failed')),
  add column if not exists transcript_error text,
  add column if not exists transcript_started_at timestamptz;

-- Lectures that already have a transcript are ready.
update public.lectures set transcript_status = 'ready'
where transcript is not null and transcript_status = 'pending';
