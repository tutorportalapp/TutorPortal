-- TutorPortal database setup. Paste into Supabase > SQL Editor > Run (safe to re-run).

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at timestamptz default now()
);

create table if not exists public.questions (
  id text primary key,
  data jsonb not null
);

create table if not exists public.diagrams (
  question_id text primary key,
  figures jsonb not null
);

create table if not exists public.saved_papers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  title text,
  settings jsonb,
  question_ids text[],
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.diagrams enable row level security;
alter table public.saved_papers enable row level security;

-- Questions and diagrams: readable ONLY by logged-in users. Writes happen with the service key (bypasses RLS).
drop policy if exists "questions: logged in read" on public.questions;
create policy "questions: logged in read" on public.questions for select to authenticated using (true);
drop policy if exists "diagrams: logged in read" on public.diagrams;
create policy "diagrams: logged in read" on public.diagrams for select to authenticated using (true);

-- Profiles and saved papers: each user sees and edits only their own.
drop policy if exists "profiles: own" on public.profiles;
create policy "profiles: own" on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "papers: own" on public.saved_papers;
create policy "papers: own" on public.saved_papers for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Create a profile row automatically when someone signs up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Paper history: recently built vs completed.
alter table public.saved_papers add column if not exists completed boolean not null default false;
alter table public.saved_papers add column if not exists completed_at timestamptz;
alter table public.saved_papers add column if not exists updated_at timestamptz default now();

-- Starred papers and questions (Library).
create table if not exists public.favourites (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('paper','question')),
  item_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, item_key)
);
alter table public.favourites enable row level security;
drop policy if exists favourites_own on public.favourites;
create policy favourites_own on public.favourites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Contact form on the home page. Anyone can send a message; nobody can read them through the site.
-- Read them in Supabase: Table Editor > contact_messages.
create table if not exists public.contact_messages (
  id bigint generated always as identity primary key,
  email text not null check (char_length(email) between 3 and 254),
  message text not null check (char_length(message) between 5 and 4000),
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.contact_messages enable row level security;
drop policy if exists contact_anyone_can_send on public.contact_messages;
create policy contact_anyone_can_send on public.contact_messages for insert to anon, authenticated with check (true);
grant insert on public.contact_messages to anon, authenticated;

-- "Last updated" note: the sync job stores when the question bank last changed.
create table if not exists public.site_meta (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.site_meta enable row level security;
drop policy if exists site_meta_readable on public.site_meta;
create policy site_meta_readable on public.site_meta for select to anon, authenticated using (true);
-- Builder preview for visitors who are not logged in.
-- Run once in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
-- It lets signed-out visitors read ONLY the handful of questions listed in preview_questions
-- (the sync job chooses them: 10 multiple choice + 10 written response). Everything else stays login-only.

create table if not exists public.preview_questions (
  id text primary key
);
alter table public.preview_questions enable row level security;
grant select on public.preview_questions to anon, authenticated;

drop policy if exists preview_ids_readable on public.preview_questions;
create policy preview_ids_readable on public.preview_questions for select to anon, authenticated using (true);

drop policy if exists questions_preview_read on public.questions;
create policy questions_preview_read on public.questions for select to anon
  using (id in (select id from public.preview_questions));

drop policy if exists diagrams_preview_read on public.diagrams;
create policy diagrams_preview_read on public.diagrams for select to anon
  using (question_id in (select id from public.preview_questions));
