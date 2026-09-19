-- Run once in Supabase Dashboard > SQL Editor (after readaloud.sql). Safe to re-run.
-- Deleting a lecture removes its read-aloud MP3 files, but the read_aloud_audio rows are the
-- spending ledger behind the daily, monthly and shared ElevenLabs limits ("rows are only removed
-- with the account"). With "on delete cascade" they would vanish with the lecture, so a student
-- could generate audio, delete the lecture and start again with the limits reset. This keeps the
-- rows and just detaches them from the deleted lecture.

alter table public.read_aloud_audio
  alter column lecture_id drop not null;

alter table public.read_aloud_audio
  drop constraint if exists read_aloud_audio_lecture_id_fkey;

alter table public.read_aloud_audio
  add constraint read_aloud_audio_lecture_id_fkey
  foreign key (lecture_id) references public.lectures on delete set null;
