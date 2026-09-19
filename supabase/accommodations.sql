-- Run once in Supabase Dashboard > SQL Editor (after schema.sql). Safe to re-run.
-- Lets accommodation_requests hold a draft before the student has typed the
-- professor's address, and track a send (draft, sending, sent, failed).

alter table public.accommodation_requests
  alter column professor_email drop not null,
  add column if not exists profile_type disability_profile,
  add column if not exists error text,
  add column if not exists resend_id text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Older rows (none expected) may hold other status text; fold them into draft first.
update public.accommodation_requests
set status = 'draft'
where status not in ('draft', 'sending', 'sent', 'failed');

alter table public.accommodation_requests
  drop constraint if exists accommodation_requests_status_check;
alter table public.accommodation_requests
  add constraint accommodation_requests_status_check
  check (status in ('draft', 'sending', 'sent', 'failed'));

-- The send route counts a student's recent drafts and sends to cap abuse.
create index if not exists accommodation_requests_user_created_idx
  on public.accommodation_requests (user_id, created_at desc);
