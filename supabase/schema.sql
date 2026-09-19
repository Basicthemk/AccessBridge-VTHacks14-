-- Run once in Supabase Dashboard > SQL Editor.
create type disability_profile as enum ('dyslexia', 'deaf_hoh');

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  disability_profile disability_profile not null default 'dyslexia',
  created_at timestamptz not null default now()
);

create table public.lectures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  audio_url text,
  transcript text,
  transcript_status text not null default 'pending'
    check (transcript_status in ('pending', 'processing', 'ready', 'failed')),
  transcript_error text,
  transcript_started_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.generated_content (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures on delete cascade,
  profile_type disability_profile not null,
  content_json jsonb not null,
  created_at timestamptz not null default now()
);

create table public.accommodation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  lecture_id uuid references public.lectures on delete set null,
  professor_email text not null,
  email_body text not null,
  status text not null default 'draft',
  sent_at timestamptz
);

-- Create a profile row whenever someone signs up (profile comes from signup metadata).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, disability_profile)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'disability_profile', ''), 'dyslexia')::disability_profile
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.lectures enable row level security;
alter table public.generated_content enable row level security;
alter table public.accommodation_requests enable row level security;

create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own lectures" on public.lectures for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own content" on public.generated_content for all
  using (exists (select 1 from public.lectures l where l.id = lecture_id and l.user_id = auth.uid()))
  with check (exists (select 1 from public.lectures l where l.id = lecture_id and l.user_id = auth.uid()));
create policy "own requests" on public.accommodation_requests for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
