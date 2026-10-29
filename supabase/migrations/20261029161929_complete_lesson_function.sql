-- =============================================================================
-- complete_lesson: the database half of POST /complete-lesson
-- (api/complete-lesson.md).
--
--   app ──► Edge Function complete-lesson ──► complete_lesson(...) ──► tables
--           verifies the JWT, checks          grades, applies the game rules
--           the body's shape                  and writes, in ONE transaction
--
-- The game rules live here, next to the data, so they run inside the same
-- transaction as the writes. Edge Functions are kept for work that talks to
-- outside services.
--
-- Concurrency: the user's row is locked (SELECT ... FOR UPDATE) before any
-- state is read, so two submissions from the same user run one after the
-- other. The second one sees the first one's progress row and is treated as a
-- repeat (0 XP). The progress primary key is a second guard.
--
-- Errors are returned, not raised, as { "error": { code, message, details } }
-- with the contract's codes; the Edge Function maps them to HTTP statuses.
-- They are all detected before the first write, so nothing is half-written.
-- Anything unexpected raises, and the whole transaction rolls back.
-- =============================================================================

create function public.complete_lesson(
  p_user_id   uuid,
  p_lesson_id uuid,
  p_answers   jsonb,
  p_timezone  text default 'UTC'
)
returns jsonb
language plpgsql
-- Runs with the caller's rights. Only service_role may call it (grants below),
-- and service_role bypasses RLS, so no security definer is needed.
security invoker
set search_path = ''
as $$
declare
  -- Game rules (contract "Game rules"). Changing a value is a new migration.
  c_lesson_xp   constant integer   := 10;
  c_scenario_xp constant integer   := 25;
  -- Level n starts at c_levels[n] total XP.
  c_levels      constant integer[] := array[0, 20, 40, 70, 100];
  -- Contract "Input limits".
  c_max_answers constant integer   := 20;

  v_user       public.users%rowtype;
  v_lesson     public.lessons%rowtype;
  v_questions  jsonb;
  v_bad_index  integer;
  v_bad_id     text;
  v_required   uuid;
  v_already    boolean;
  v_correct    integer;
  v_total      integer;
  v_xp_awarded integer;
  v_total_xp   integer;
  v_level      smallint;
  v_today      date;
  v_gap        integer;
  v_streak     integer;
  v_longest    integer;
  v_extended   boolean;
  v_unlocked   uuid;
begin
  p_timezone := coalesce(p_timezone, 'UTC');

  -- ---------------------------------------------------------------------------
  -- 1. Body shape (400 INVALID_REQUEST). The Edge Function checks this too;
  --    repeating it here means the function is safe whoever calls it.
  -- ---------------------------------------------------------------------------
  if p_user_id is null then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'UNAUTHENTICATED', 'message', 'Sign in to continue.'));
  end if;

  if p_lesson_id is null then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'INVALID_REQUEST', 'message', 'Something went wrong. Please try again.',
      'details', jsonb_build_object('field', 'lessonId', 'reason', 'required')));
  end if;

  if jsonb_typeof(p_answers) is distinct from 'array'
     or jsonb_array_length(p_answers) = 0
     or jsonb_array_length(p_answers) > c_max_answers then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'INVALID_REQUEST', 'message', 'Something went wrong. Please try again.',
      'details', jsonb_build_object('field', 'answers',
        'reason', format('must be an array of 1-%s answers', c_max_answers))));
  end if;

  -- Each answer must be { "questionId": string, "choiceId": string }.
  select t.ord - 1 into v_bad_index
  from jsonb_array_elements(p_answers) with ordinality as t(answer, ord)
  where jsonb_typeof(t.answer) is distinct from 'object'
     or jsonb_typeof(t.answer -> 'questionId') is distinct from 'string'
     or jsonb_typeof(t.answer -> 'choiceId') is distinct from 'string'
  order by t.ord
  limit 1;
  if found then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'INVALID_REQUEST', 'message', 'Something went wrong. Please try again.',
      'details', jsonb_build_object('field', format('answers[%s]', v_bad_index),
        'reason', 'must have string questionId and choiceId')));
  end if;

  if (select count(distinct t.answer ->> 'questionId')
      from jsonb_array_elements(p_answers) as t(answer)) <> jsonb_array_length(p_answers) then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'INVALID_REQUEST', 'message', 'Something went wrong. Please try again.',
      'details', jsonb_build_object('field', 'answers', 'reason', 'duplicate question')));
  end if;

  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'INVALID_REQUEST', 'message', 'Something went wrong. Please try again.',
      'details', jsonb_build_object('field', 'timezone', 'reason', 'unknown time zone')));
  end if;

  -- ---------------------------------------------------------------------------
  -- 2. The lesson exists and is published, in a published track (404).
  -- ---------------------------------------------------------------------------
  select l.* into v_lesson
  from public.lessons l
  join public.tracks t on t.id = l.track_id
  where l.id = p_lesson_id and l.is_published and t.is_published;
  if not found then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'LESSON_NOT_FOUND', 'message', 'That lesson isn''t available.',
      'details', jsonb_build_object('lessonId', p_lesson_id)));
  end if;

  -- ---------------------------------------------------------------------------
  -- 3. Answers match this lesson's questions (400). Needs the lesson, so it
  --    runs after the 404 check.
  -- ---------------------------------------------------------------------------
  select coalesce(jsonb_agg(s.step order by s.ord), '[]'::jsonb) into v_questions
  from jsonb_array_elements(v_lesson.content -> 'steps') with ordinality as s(step, ord)
  where s.step ->> 'type' = 'question';

  select t.ord - 1 into v_bad_index
  from jsonb_array_elements(p_answers) with ordinality as t(answer, ord)
  where not exists (
    select 1 from jsonb_array_elements(v_questions) as q(question)
    where q.question ->> 'id' = t.answer ->> 'questionId')
  order by t.ord
  limit 1;
  if found then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'INVALID_REQUEST', 'message', 'Something went wrong. Please try again.',
      'details', jsonb_build_object('field', format('answers[%s].questionId', v_bad_index),
        'reason', 'unknown question')));
  end if;

  select t.ord - 1 into v_bad_index
  from jsonb_array_elements(p_answers) with ordinality as t(answer, ord)
  join jsonb_array_elements(v_questions) as q(question)
    on q.question ->> 'id' = t.answer ->> 'questionId'
  where not exists (
    select 1 from jsonb_array_elements(q.question -> 'choices') as c(choice)
    where c.choice ->> 'id' = t.answer ->> 'choiceId')
  order by t.ord
  limit 1;
  if found then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'INVALID_REQUEST', 'message', 'Something went wrong. Please try again.',
      'details', jsonb_build_object('field', format('answers[%s].choiceId', v_bad_index),
        'reason', 'unknown choice')));
  end if;

  -- Answers are unique and all known, so any shortfall is a missing answer.
  select q.question ->> 'id' into v_bad_id
  from jsonb_array_elements(v_questions) with ordinality as q(question, ord)
  where not exists (
    select 1 from jsonb_array_elements(p_answers) as t(answer)
    where t.answer ->> 'questionId' = q.question ->> 'id')
  order by q.ord
  limit 1;
  if found then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'INVALID_REQUEST', 'message', 'Something went wrong. Please try again.',
      'details', jsonb_build_object('field', 'answers', 'reason', format('missing answer for %s', v_bad_id))));
  end if;

  -- ---------------------------------------------------------------------------
  -- 4. Lock the user's row. Every read of game state comes after this line,
  --    so a concurrent submission waits here and then sees our writes.
  -- ---------------------------------------------------------------------------
  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    -- Valid token, but the account is gone (e.g. deleted mid-session).
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'UNAUTHENTICATED', 'message', 'Sign in to continue.'));
  end if;

  -- ---------------------------------------------------------------------------
  -- 5. Unlocked? Lesson n needs the previous published lesson completed (403).
  -- ---------------------------------------------------------------------------
  select l.id into v_required
  from public.lessons l
  where l.track_id = v_lesson.track_id and l.is_published and l.position < v_lesson.position
  order by l.position desc
  limit 1;
  if v_required is not null and not exists (
       select 1 from public.progress p where p.user_id = p_user_id and p.lesson_id = v_required) then
    return jsonb_build_object('error', jsonb_build_object(
      'code', 'LESSON_LOCKED', 'message', 'Complete the previous lesson first.',
      'details', jsonb_build_object('requiredLessonId', v_required)));
  end if;

  -- ---------------------------------------------------------------------------
  -- 6. Game rules.
  -- ---------------------------------------------------------------------------
  v_already := exists (
    select 1 from public.progress p where p.user_id = p_user_id and p.lesson_id = p_lesson_id);

  -- Grade. Informational only: there is no passing score.
  v_total := jsonb_array_length(v_questions);
  select count(*) filter (where q.question ->> 'correctChoiceId' = t.answer ->> 'choiceId')
    into v_correct
  from jsonb_array_elements(p_answers) as t(answer)
  join jsonb_array_elements(v_questions) as q(question)
    on q.question ->> 'id' = t.answer ->> 'questionId';

  -- XP: 10 per lesson, 25 per scenario, 0 for a repeat.
  v_xp_awarded := case
    when v_already then 0
    when v_lesson.kind = 'scenario' then c_scenario_xp
    else c_lesson_xp
  end;
  v_total_xp := v_user.xp + v_xp_awarded;

  -- Level: how many thresholds the new total has reached (1-5).
  select count(*)::smallint into v_level from unnest(c_levels) as threshold where threshold <= v_total_xp;

  -- Streak, by calendar day in the user's time zone. Repeats count.
  v_today := (now() at time zone p_timezone)::date;
  if v_user.last_active_date is null then
    v_streak := 1;
    v_extended := true;
  else
    v_gap := v_today - v_user.last_active_date;
    if v_gap <= 0 then
      -- Same day, or "today" is earlier than the stored day (the user moved
      -- west or changed time zone): treat it as the same day, don't fail.
      v_streak := v_user.streak_current;
      v_extended := false;
    elsif v_gap = 1 then
      v_streak := v_user.streak_current + 1;
      v_extended := true;
    else
      v_streak := 1;
      v_extended := true;
    end if;
  end if;
  v_longest := greatest(v_user.streak_longest, v_streak);

  -- Unlock: only on the first completion, and only if a next lesson exists.
  if not v_already then
    select l.id into v_unlocked
    from public.lessons l
    where l.track_id = v_lesson.track_id and l.is_published and l.position > v_lesson.position
    order by l.position
    limit 1;
  end if;

  -- ---------------------------------------------------------------------------
  -- 7. Writes (contract "Side effects").
  -- ---------------------------------------------------------------------------
  insert into public.progress as p (user_id, lesson_id, best_score)
  values (p_user_id, p_lesson_id, v_correct)
  on conflict (user_id, lesson_id) do update
    set best_score        = greatest(p.best_score, excluded.best_score),
        completion_count  = p.completion_count + 1,
        last_completed_at = now();

  update public.users
  set xp               = v_total_xp,
      level            = v_level,
      streak_current   = v_streak,
      streak_longest   = v_longest,
      last_active_date = case when v_extended then v_today else v_user.last_active_date end
  where id = p_user_id;

  insert into public.events (user_id, type, lesson_id)
  values (p_user_id,
          case when v_lesson.kind = 'scenario' then 'scenario_completed' else 'lesson_completed' end,
          p_lesson_id);

  return jsonb_build_object(
    'lessonId', p_lesson_id,
    'alreadyCompleted', v_already,
    'score', jsonb_build_object('correct', v_correct, 'total', v_total),
    'xpAwarded', v_xp_awarded,
    'totalXp', v_total_xp,
    'level', jsonb_build_object(
      'current', v_level,
      'leveledUp', v_level > v_user.level,
      'nextLevelXp', case when v_level < array_length(c_levels, 1) then c_levels[v_level + 1] end),
    'streak', jsonb_build_object(
      'current', v_streak, 'longest', v_longest, 'extendedToday', v_extended),
    'unlockedLessonId', v_unlocked
  );
end;
$$;

comment on function public.complete_lesson(uuid, uuid, jsonb, text) is
  'Grades a lesson and applies XP/level/streak/unlock in one transaction. Called only by the complete-lesson Edge Function (service_role).';

-- Apps must go through the Edge Function, which verifies who the user is.
-- If the app could call this directly, it could pass any p_user_id.
revoke execute on function public.complete_lesson(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.complete_lesson(uuid, uuid, jsonb, text) to service_role;
