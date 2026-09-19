-- Run once in Supabase Dashboard > SQL Editor (after schema.sql). Safe to re-run.
-- Lecture Q&A: one row per question a student asked about a lecture, with the answer they got.

create table if not exists public.lecture_questions (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  question text not null check (char_length(question) between 1 and 1000),
  answer text not null,
  created_at timestamptz not null default now()
);

alter table public.lecture_questions enable row level security;

drop policy if exists "own questions" on public.lecture_questions;
create policy "own questions" on public.lecture_questions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The lecture page reads one lecture's history in order; the route counts a student's recent questions.
create index if not exists lecture_questions_lecture_created_idx
  on public.lecture_questions (lecture_id, created_at);
create index if not exists lecture_questions_user_created_idx
  on public.lecture_questions (user_id, created_at desc);
