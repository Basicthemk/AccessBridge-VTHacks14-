-- Run once in Supabase Dashboard > SQL Editor (after readaloud.sql). Safe to re-run.
-- Lets the read-aloud route see how many characters ALL students have had spoken in the last
-- 30 days, so one shared cap can protect the ElevenLabs Free plan. Row-level security hides
-- other students' rows, so this needs a function that reads them and returns only the total.
-- It exposes one number and nothing else: no user ids, lectures or text.

create or replace function public.read_aloud_characters_last_30_days()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(characters), 0)::bigint
  from public.read_aloud_audio
  where created_at >= now() - interval '30 days';
$$;

revoke all on function public.read_aloud_characters_last_30_days() from public, anon;
grant execute on function public.read_aloud_characters_last_30_days() to authenticated;
