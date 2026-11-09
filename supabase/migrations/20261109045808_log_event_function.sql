-- =============================================================================
-- log_event: the app's way to record usage events for the project metrics
-- (daily use, lessons started vs. completed).
--
--   app ──► supabase.rpc('log_event', { p_type, p_lesson_id }) ──► events
--
-- Four event types exist. complete_lesson() already writes the two that prove
-- progress (lesson_completed, scenario_completed) inside its transaction.
-- This function writes only the two the app reports itself:
--   app_opened      the app came to the foreground while signed in
--   lesson_started  the user opened a lesson
--
-- Why a function and not an insert policy: one place controls the rules.
--   • The user always comes from the JWT (auth.uid()), never a parameter, so
--     nobody can log events as someone else.
--   • Only the two client types are accepted, so the app can't fake a
--     completion.
--   • occurred_at is always the server's clock.
--   • Rate limit: the same event (same type and lesson) within 60 seconds is
--     ignored and returns false, so a loop or a spammed button can't flood
--     the table.
--
-- security definer is needed because users have no write access to events;
-- the function runs as its owner and enforces the rules above itself.
-- search_path is empty and every name is schema-qualified.
-- =============================================================================

create function public.log_event(
  p_type      text,
  p_lesson_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_throttle constant interval := interval '60 seconds';
  v_user_id  uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'log_event requires a signed-in user' using errcode = '42501';
  end if;

  if p_type is null or p_type not in ('app_opened', 'lesson_started') then
    raise exception 'log_event: type must be app_opened or lesson_started' using errcode = '22023';
  end if;

  if p_type = 'app_opened' and p_lesson_id is not null then
    raise exception 'log_event: app_opened takes no lesson' using errcode = '22023';
  end if;

  if p_type = 'lesson_started' and not exists (
    select 1
    from public.lessons l
    join public.tracks t on t.id = l.track_id
    where l.id = p_lesson_id and l.is_published and t.is_published
  ) then
    raise exception 'log_event: lesson_started needs a published lesson' using errcode = '22023';
  end if;

  -- Rate limit: ignore an identical event from the last 60 seconds.
  if exists (
    select 1
    from public.events e
    where e.user_id = v_user_id
      and e.type = p_type
      and e.lesson_id is not distinct from p_lesson_id
      and e.occurred_at > now() - c_throttle
  ) then
    return false;
  end if;

  insert into public.events (user_id, type, lesson_id)
  values (v_user_id, p_type, p_lesson_id);

  return true;
end;
$$;

comment on function public.log_event(text, uuid) is
  'Records app_opened / lesson_started for the signed-in user (auth.uid()). Ignores repeats within 60 s. See migration header.';

-- Only signed-in users may call it (it also checks auth.uid() itself).
revoke execute on function public.log_event(text, uuid) from public, anon;
grant execute on function public.log_event(text, uuid) to authenticated;

-- Serves the rate-limit lookup above and per-user metric queries.
create index events_user_type_occurred_at_idx on public.events (user_id, type, occurred_at desc);
