-- =============================================================================
-- Core schema: the 5 tables behind DesignReps.
--
--   users ─┬─< progress >── lessons >── tracks
--          └─< events   >── lessons
--
-- Game state (xp, level, streak, progress) is written ONLY by the
-- complete-lesson Edge Function (see api/complete-lesson.md). RLS is enabled
-- on every table with no policies yet, which means "deny all" for app clients
-- until the Week 5 policies are added. Nothing is exposed by accident in the meantime.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- tracks: a learning path, e.g. "System Design Fundamentals".
-- -----------------------------------------------------------------------------
create table public.tracks (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        text not null check (length(trim(title)) > 0),
  description  text,
  position     integer not null unique check (position > 0),
  is_published boolean not null default false,
  created_at   timestamptz not null default now()
);

comment on table public.tracks is 'Learning paths. Ordered by position on the home screen.';


-- -----------------------------------------------------------------------------
-- lessons: one lesson or guided scenario. The body lives in `content` as JSON,
-- so new lessons need no schema or screen changes (plan metric 5).
-- -----------------------------------------------------------------------------
create table public.lessons (
  id           uuid primary key default gen_random_uuid(),
  track_id     uuid not null references public.tracks (id) on delete cascade,
  slug         text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        text not null check (length(trim(title)) > 0),
  kind         text not null default 'lesson' check (kind in ('lesson', 'scenario')),
  -- Order within the track; lesson n unlocks after lesson n - 1 is completed.
  position     integer not null check (position > 0),
  content      jsonb not null check (jsonb_typeof(content) = 'object'),
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (track_id, slug),
  -- Also serves as the index for "lessons in a track, in order" lookups.
  unique (track_id, position)
);

comment on table public.lessons is 'Lessons and scenarios. kind decides XP (10 vs 25); content is the lesson JSON.';


-- -----------------------------------------------------------------------------
-- users: app profile + game state, one row per Supabase Auth account.
-- Created automatically by the trigger below; deleted with the auth account.
-- -----------------------------------------------------------------------------
create table public.users (
  id               uuid primary key references auth.users (id) on delete cascade,
  xp               integer not null default 0 check (xp >= 0),
  level            smallint not null default 1 check (level between 1 and 5),
  streak_current   integer not null default 0 check (streak_current >= 0),
  streak_longest   integer not null default 0 check (streak_longest >= streak_current),
  -- Calendar day (in the user's time zone) of the last completion; drives the streak.
  last_active_date date,
  tier             text not null default 'free' check (tier in ('free', 'premium')),
  created_at       timestamptz not null default now()
);

comment on table public.users is 'Per-user game state. Written only by the complete-lesson Edge Function.';


-- -----------------------------------------------------------------------------
-- progress: which user completed which lesson. The composite primary key is
-- the duplicate guard from the API contract: XP can be awarded at most once
-- per (user, lesson), even under concurrent submissions.
-- -----------------------------------------------------------------------------
create table public.progress (
  user_id           uuid not null references public.users (id) on delete cascade,
  lesson_id         uuid not null references public.lessons (id) on delete cascade,
  best_score        smallint not null check (best_score >= 0),
  completion_count  integer not null default 1 check (completion_count >= 1),
  completed_at      timestamptz not null default now(),   -- first completion
  last_completed_at timestamptz not null default now(),

  primary key (user_id, lesson_id),
  check (last_completed_at >= completed_at)
);

comment on table public.progress is 'Lesson completions. PK (user_id, lesson_id) prevents double XP.';


-- -----------------------------------------------------------------------------
-- events: usage log for the engagement metrics (plan metric 7).
-- No answers or personal details, just what happened and when.
-- -----------------------------------------------------------------------------
create table public.events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.users (id) on delete cascade,
  type        text not null check (
                type in ('app_opened', 'lesson_started', 'lesson_completed', 'scenario_completed')
              ),
  lesson_id   uuid references public.lessons (id) on delete set null,
  occurred_at timestamptz not null default now()
);

comment on table public.events is 'Usage events for metrics. Deleted with the user (account deletion).';


-- -----------------------------------------------------------------------------
-- Keep lessons.updated_at current so content edits are traceable.
-- -----------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger lessons_set_updated_at
  before update on public.lessons
  for each row execute function public.set_updated_at();


-- -----------------------------------------------------------------------------
-- Create the public.users row whenever someone signs up.
-- security definer: runs with the owner's rights, because the signing-up user
-- has no permission to insert into public.users themselves.
-- -----------------------------------------------------------------------------
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id) values (new.id);
  return new;
end;
$$;

-- Only the trigger should ever call this.
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Accounts created before this migration (e.g. while testing) get a row too.
insert into public.users (id)
select id from auth.users
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- Row Level Security: on for every table, no policies yet = deny all for
-- the anon and authenticated roles. Policies + tests arrive in Week 5.
-- (The Edge Function uses the service role, which bypasses RLS by design.)
-- -----------------------------------------------------------------------------
alter table public.tracks   enable row level security;
alter table public.lessons  enable row level security;
alter table public.users    enable row level security;
alter table public.progress enable row level security;
alter table public.events   enable row level security;
