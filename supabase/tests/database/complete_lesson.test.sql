-- Tests for public.complete_lesson, mapped to the contract's test plan
-- (api/complete-lesson.md). Run with: npx supabase test db
-- Everything runs in one transaction and is rolled back at the end.
-- Concurrency (two sessions at once) is tested separately: a single pgTAP
-- session can't run two transactions at the same time.

begin;
create extension if not exists pgtap with schema extensions;

select plan(58);

-- -----------------------------------------------------------------------------
-- Fixtures: 2 users, 1 track with lesson 1, lesson 2, a scenario (3) and an
-- unpublished lesson (4). Each lesson has 2 questions: q1 → a, q2 → b.
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'test-a@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'test-b@example.com');
-- (The sign-up trigger creates the public.users rows.)

insert into public.tracks (id, slug, title, position, is_published)
values ('00000000-0000-0000-0000-0000000000f1', 'test-track', 'Test track', 99, true);

create temp table fixture_content as
select '{
  "steps": [
    { "type": "concept", "id": "c1", "title": "Idea", "body": "Body" },
    { "type": "question", "id": "q1", "prompt": "One?",
      "choices": [{ "id": "a", "text": "A" }, { "id": "b", "text": "B" }],
      "correctChoiceId": "a", "explanation": "Because." },
    { "type": "question", "id": "q2", "prompt": "Two?",
      "choices": [{ "id": "a", "text": "A" }, { "id": "b", "text": "B" }],
      "correctChoiceId": "b", "explanation": "Because." }
  ]
}'::jsonb as content;

insert into public.lessons (id, track_id, slug, title, kind, position, content, is_published)
select v.id::uuid, '00000000-0000-0000-0000-0000000000f1', v.slug, v.slug, v.kind, v.position, f.content, v.published
from fixture_content f, (values
  ('00000000-0000-0000-0000-0000000000b1', 'lesson-one',   'lesson',   1, true),
  ('00000000-0000-0000-0000-0000000000b2', 'lesson-two',   'lesson',   2, true),
  ('00000000-0000-0000-0000-0000000000b3', 'scenario',     'scenario', 3, true),
  ('00000000-0000-0000-0000-0000000000b4', 'unpublished',  'lesson',   4, false)
) as v(id, slug, kind, position, published);

-- Shorthands.
create temp table ids as select
  '00000000-0000-0000-0000-0000000000a1'::uuid as user_a,
  '00000000-0000-0000-0000-0000000000a2'::uuid as user_b,
  '00000000-0000-0000-0000-0000000000b1'::uuid as l1,
  '00000000-0000-0000-0000-0000000000b2'::uuid as l2,
  '00000000-0000-0000-0000-0000000000b3'::uuid as s3,
  '00000000-0000-0000-0000-0000000000b4'::uuid as l4,
  '[{"questionId":"q1","choiceId":"a"},{"questionId":"q2","choiceId":"b"}]'::jsonb as all_right,
  '[{"questionId":"q1","choiceId":"b"},{"questionId":"q2","choiceId":"b"}]'::jsonb as one_wrong;

-- Calls the function and returns error.code (or null on success).
create function pg_temp.error_code(p_lesson uuid, p_answers jsonb, p_tz text default 'UTC')
returns text language sql as $$
  select public.complete_lesson((select user_a from ids), p_lesson, p_answers, p_tz) -> 'error' ->> 'code'
$$;

-- =============================================================================
-- Security: only service_role may call it
-- =============================================================================
select ok(not has_function_privilege('anon', 'public.complete_lesson(uuid, uuid, jsonb, text)', 'execute'),
  'anon cannot call complete_lesson');
select ok(not has_function_privilege('authenticated', 'public.complete_lesson(uuid, uuid, jsonb, text)', 'execute'),
  'authenticated users cannot call complete_lesson directly');
select ok(has_function_privilege('service_role', 'public.complete_lesson(uuid, uuid, jsonb, text)', 'execute'),
  'service_role (the Edge Function) can call complete_lesson');

-- =============================================================================
-- Error 2 (400): body rules
-- =============================================================================
select is(pg_temp.error_code(l1, '{}'), 'INVALID_REQUEST', 'answers not an array → 400') from ids;
select is(pg_temp.error_code(l1, '[]'), 'INVALID_REQUEST', 'empty answers → 400') from ids;
select is(pg_temp.error_code(l1, '[{"questionId":"q1"}]'), 'INVALID_REQUEST', 'answer without choiceId → 400') from ids;
select is(pg_temp.error_code(l1, '[{"questionId":"q1","choiceId":"a"},{"questionId":"q1","choiceId":"b"}]'),
  'INVALID_REQUEST', 'duplicate question → 400') from ids;
select is(pg_temp.error_code(l1, all_right, 'Mars/Olympus_Mons'), 'INVALID_REQUEST', 'invalid time zone → 400') from ids;
select is(pg_temp.error_code(l1, '[{"questionId":"q1","choiceId":"a"}]'), 'INVALID_REQUEST', 'missing answer → 400') from ids;
select is(pg_temp.error_code(l1, '[{"questionId":"q1","choiceId":"a"},{"questionId":"q9","choiceId":"a"}]'),
  'INVALID_REQUEST', 'unknown question → 400') from ids;
select is(
  public.complete_lesson(user_a, l1, '[{"questionId":"q1","choiceId":"a"},{"questionId":"q2","choiceId":"z"}]', 'UTC')
    -> 'error' -> 'details',
  '{"field": "answers[1].choiceId", "reason": "unknown choice"}'::jsonb,
  'unknown choice → 400 with the failing field') from ids;
select is(pg_temp.error_code(l1, (select jsonb_agg(x) from generate_series(1, 21) x)),
  'INVALID_REQUEST', 'more than 20 answers → 400') from ids;
select is(public.complete_lesson(null, l1, all_right, 'UTC') -> 'error' ->> 'code', 'UNAUTHENTICATED',
  'no user id → UNAUTHENTICATED') from ids;

-- =============================================================================
-- Error 3 (404) and Error 4 (403)
-- =============================================================================
select is(pg_temp.error_code(gen_random_uuid(), all_right), 'LESSON_NOT_FOUND', 'unknown lesson → 404') from ids;
select is(pg_temp.error_code(l4, all_right), 'LESSON_NOT_FOUND', 'unpublished lesson → 404') from ids;
select is(
  public.complete_lesson(user_a, l2, all_right, 'UTC') -> 'error',
  jsonb_build_object('code', 'LESSON_LOCKED', 'message', 'Complete the previous lesson first.',
                     'details', jsonb_build_object('requiredLessonId', l1)),
  'lesson 2 before lesson 1 → 403 naming lesson 1') from ids;

select is((select count(*)::int from public.progress, ids where user_id = user_a), 0, 'errors write no progress');
select is((select xp from public.users, ids where id = user_a), 0, 'errors award no XP');

-- =============================================================================
-- Happy path: first completion of lesson 1 (one answer wrong)
-- =============================================================================
create temp table r1 as select public.complete_lesson(user_a, l1, one_wrong, 'UTC') as r from ids;

select is((select r ->> 'alreadyCompleted' from r1), 'false', 'first completion: alreadyCompleted false');
select is((select r -> 'score' from r1), '{"correct": 1, "total": 2}'::jsonb, 'server grades the answers');
select is((select (r ->> 'xpAwarded')::int from r1), 10, 'first lesson completion → +10 XP');
select is((select (r ->> 'totalXp')::int from r1), 10, 'totalXp is 10');
select is((select r -> 'level' from r1), '{"current": 1, "leveledUp": false, "nextLevelXp": 20}'::jsonb,
  'staying within a level → no level-up');
select is((select r -> 'streak' from r1), '{"current": 1, "longest": 1, "extendedToday": true}'::jsonb,
  'first ever completion → streak 1');
select is((select (r ->> 'unlockedLessonId')::uuid from r1), (select l2 from ids),
  'first completion unlocks the next lesson');
select is((select r ->> 'lessonId' from r1), (select l1::text from ids), 'echoes lessonId');
select is((select array(select jsonb_object_keys(r) order by 1) from r1),
  array['alreadyCompleted', 'lessonId', 'level', 'score', 'streak', 'totalXp', 'unlockedLessonId', 'xpAwarded'],
  'response has exactly the contract fields');

select is((select best_score::int from public.progress, ids where user_id = user_a and lesson_id = l1), 1,
  'progress row stores the score');
select is((select (xp, level, streak_current, last_active_date)::text from public.users, ids where id = user_a),
  (select (10, 1, 1, (now() at time zone 'UTC')::date)::text), 'users row updated');
select is((select count(*)::int from public.events, ids where user_id = user_a and type = 'lesson_completed'), 1,
  'one lesson_completed event');

-- =============================================================================
-- Repeat: lesson 1 again, same day, all right
-- =============================================================================
create temp table r2 as select public.complete_lesson(user_a, l1, all_right, 'UTC') as r from ids;

select is((select r ->> 'alreadyCompleted' from r2), 'true', 'repeat: alreadyCompleted true');
select is((select (r ->> 'xpAwarded')::int from r2), 0, 'repeat → 0 XP');
select is((select (r ->> 'totalXp')::int from r2), 10, 'repeat leaves total XP unchanged');
select is((select r -> 'unlockedLessonId' from r2), 'null'::jsonb, 'repeat → unlockedLessonId null');
select is((select r -> 'streak' from r2), '{"current": 1, "longest": 1, "extendedToday": false}'::jsonb,
  'same day → streak unchanged');
select is((select (best_score, completion_count)::text from public.progress, ids where user_id = user_a and lesson_id = l1),
  '(2,2)', 'repeat keeps the best score and counts the completion');
select is((select count(*)::int from public.events, ids where user_id = user_a), 2, 'repeat still logs an event');

-- =============================================================================
-- Next day: lesson 2, last active yesterday
-- =============================================================================
update public.users set last_active_date = (now() at time zone 'UTC')::date - 1
where id = (select user_a from ids);

create temp table r3 as select public.complete_lesson(user_a, l2, all_right, 'UTC') as r from ids;

select is((select r -> 'streak' from r3), '{"current": 2, "longest": 2, "extendedToday": true}'::jsonb,
  'next day → streak +1');
select is((select (r ->> 'totalXp')::int from r3), 20, 'second lesson → 20 XP');
select is((select r -> 'level' from r3), '{"current": 2, "leveledUp": true, "nextLevelXp": 40}'::jsonb,
  'crossing 20 XP → level 2, leveledUp');
select is((select (r ->> 'unlockedLessonId')::uuid from r3), (select s3 from ids), 'lesson 2 unlocks the scenario');

-- =============================================================================
-- Gap: the scenario, 3 days after the last activity
-- =============================================================================
update public.users set last_active_date = (now() at time zone 'UTC')::date - 3
where id = (select user_a from ids);

create temp table r4 as select public.complete_lesson(user_a, s3, all_right, 'UTC') as r from ids;

select is((select (r ->> 'xpAwarded')::int from r4), 25, 'first scenario completion → +25 XP');
select is((select r -> 'streak' from r4), '{"current": 1, "longest": 2, "extendedToday": true}'::jsonb,
  'gap of 2+ days → reset to 1, longest kept');
select is((select r -> 'unlockedLessonId' from r4), 'null'::jsonb,
  'last published lesson → unlockedLessonId null');
select is((select count(*)::int from public.events, ids where user_id = user_a and type = 'scenario_completed'), 1,
  'scenario logs a scenario_completed event');
select is((select r -> 'level' from r4), '{"current": 3, "leveledUp": true, "nextLevelXp": 70}'::jsonb,
  '45 XP → level 3');

-- =============================================================================
-- Time zones move the day boundary
-- =============================================================================
-- Kiritimati is UTC+14. "Yesterday" there is exactly one local day ago.
update public.users
set last_active_date = (now() at time zone 'Pacific/Kiritimati')::date - 1, streak_current = 1
where id = (select user_a from ids);
select is(public.complete_lesson(user_a, l1, all_right, 'Pacific/Kiritimati') -> 'streak' -> 'current', '2'::jsonb,
  'streak uses the request''s time zone') from ids;

-- Pago Pago (UTC-11) is always at least one calendar day behind Kiritimati,
-- so "today" there is earlier than the stored day: treated as the same day.
update public.users
set last_active_date = (now() at time zone 'Pacific/Kiritimati')::date, streak_current = 3, streak_longest = 3
where id = (select user_a from ids);
create temp table r5 as select public.complete_lesson(user_a, l1, all_right, 'Pacific/Pago_Pago') as r from ids;
select is((select r -> 'streak' from r5), '{"current": 3, "longest": 3, "extendedToday": false}'::jsonb,
  '"today" earlier than last active (moved west) → same day, no error');
select is((select last_active_date from public.users, ids where id = user_a),
  (now() at time zone 'Pacific/Kiritimati')::date, 'last active date never moves backwards');
select is((select r -> 'error' from r5), null, 'moving west is not an error');

-- A repeat on a new day still extends the streak.
update public.users set last_active_date = (now() at time zone 'UTC')::date - 1, streak_current = 4, streak_longest = 4
where id = (select user_a from ids);
select is(public.complete_lesson(user_a, l1, all_right, 'UTC') -> 'streak',
  '{"current": 5, "longest": 5, "extendedToday": true}'::jsonb,
  'repeat completion still extends the streak') from ids;

-- =============================================================================
-- Level 5: no next level
-- =============================================================================
update public.users set xp = 95, level = 4 where id = (select user_b from ids);
create temp table r6 as select public.complete_lesson(user_b, l1, all_right, 'UTC') as r from ids;
select is((select (r ->> 'totalXp')::int from r6), 105, 'user B reaches 105 XP');
select is((select r -> 'level' from r6), '{"current": 5, "leveledUp": true, "nextLevelXp": null}'::jsonb,
  'level 5 → nextLevelXp null');

-- =============================================================================
-- Users are isolated from each other
-- =============================================================================
select is(public.complete_lesson(user_b, l2, all_right, 'UTC') -> 'error' ->> 'code', null,
  'user B completed lesson 1 too, so lesson 2 is open') from ids;
select is(public.complete_lesson(user_b, s3, all_right, 'UTC') -> 'error' ->> 'code', null,
  'user B can do the scenario after lesson 2') from ids;
select is((select count(*)::int from public.progress, ids where user_id = user_b), 3, 'user B has their own 3 progress rows');

-- Lesson 2 for a brand-new user is locked, whatever other users completed.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a3', 'test-c@example.com');
select is(public.complete_lesson('00000000-0000-0000-0000-0000000000a3', l2, all_right, 'UTC') -> 'error' ->> 'code',
  'LESSON_LOCKED', 'another user''s progress doesn''t unlock lessons for you') from ids;

-- =============================================================================
-- Account gone
-- =============================================================================
select is(public.complete_lesson(gen_random_uuid(), l1, all_right, 'UTC') -> 'error' ->> 'code', 'UNAUTHENTICATED',
  'unknown user id → UNAUTHENTICATED, nothing written') from ids;

select * from finish();
rollback;
