-- Do the lookups behind complete-lesson and the home screen use an index?
--
-- Runs against the LOCAL Supabase database only, inside a transaction that is
-- rolled back, so it leaves nothing behind:
--   npm run perf:explain
--
-- On tiny tables Postgres reads the whole table instead of an index (cheaper
-- for a few rows), so the plan says nothing until there is data. This loads a
-- volume well past our expected scale first: 50 tracks x 20 lessons = 1,000
-- lessons, and 5,000 users x 20 completions = 100,000 progress rows.
--
-- Answers the Week 7 PLAN question: do progress(user_id) and lessons(track_id)
-- need their own indexes? Expected: no. progress_pkey (user_id, lesson_id) and
-- lessons_track_id_position_key (track_id, position) already start with those
-- columns, and a B-tree index serves any search on its leading column.
-- Small tables (tracks: about 50 rows) are expected to be read whole.

\set ON_ERROR_STOP on
begin;

insert into public.tracks (id, slug, title, position, is_published)
select ('00000000-0000-0000-0000-' || lpad(to_hex(t), 12, '0'))::uuid,
       'perf-track-' || t, 'Perf track ' || t, 1000 + t, true
from generate_series(1, 50) t;

insert into public.lessons (track_id, slug, title, position, content, is_published)
select ('00000000-0000-0000-0000-' || lpad(to_hex(t), 12, '0'))::uuid,
       'lesson-' || p, 'Lesson ' || p, p,
       '{"steps":[{"type":"question","id":"q1","choices":[{"id":"a"}],"correctChoiceId":"a"}]}', true
from generate_series(1, 50) t, generate_series(1, 20) p;

-- public.users rows come from the auth.users trigger.
insert into auth.users (id, email)
select ('00000000-0000-0000-0001-' || lpad(to_hex(u), 12, '0'))::uuid, 'perf' || u || '@example.com'
from generate_series(1, 5000) u;

insert into public.progress (user_id, lesson_id, best_score)
select u.id, l.id, 1
from public.users u
join public.lessons l on l.track_id = '00000000-0000-0000-0000-000000000001'
where u.id::text like '00000000-0000-0000-0001-%';

analyze public.tracks, public.lessons, public.users, public.progress;

\echo
\echo '== Row counts'
select (select count(*) from public.lessons) as lessons, (select count(*) from public.progress) as progress;

-- A real lesson ID to plug in below, so each plan shows only the query being checked.
select id as lesson_id from public.lessons
where track_id = '00000000-0000-0000-0000-000000000001' and position = 5 \gset

-- complete_lesson() lookups, in the function's order. The progress upsert
-- (step 7, on conflict (user_id, lesson_id)) needs no plan: on conflict always
-- goes through that unique index, progress_pkey.

\echo '== 1. complete_lesson step 2: the lesson, in a published track'
explain (costs off)
select l.* from public.lessons l
join public.tracks t on t.id = l.track_id
where l.id = :'lesson_id' and l.is_published and t.is_published;

\echo '== 2. complete_lesson step 4: lock the user row'
explain (costs off)
select * from public.users where id = '00000000-0000-0000-0001-000000000001' for update;

\echo '== 3. complete_lesson step 5: the previous published lesson in the track'
explain (costs off)
select l.id from public.lessons l
where l.track_id = '00000000-0000-0000-0000-000000000007' and l.is_published and l.position < 12
order by l.position desc
limit 1;

\echo '== 4. complete_lesson steps 5/6: has this user completed this lesson?'
explain (costs off)
select 1 from public.progress p
where p.user_id = '00000000-0000-0000-0001-000000000001'
  and p.lesson_id = :'lesson_id';

\echo '== 5. complete_lesson step 6: the next published lesson in the track (unlock)'
explain (costs off)
select l.id from public.lessons l
where l.track_id = '00000000-0000-0000-0000-000000000007' and l.is_published and l.position > 12
order by l.position
limit 1;

-- The app's reads (src/lib/learning/LearningRepository.ts), run as a signed-in
-- user so RLS adds its filters exactly as in production.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0001-000000000001","role":"authenticated"}', true) \g /dev/null

\echo '== 6. app, home path: my progress (RLS adds user_id = auth.uid())'
explain (costs off)
select lesson_id from public.progress;

\echo '== 7. app, home path: all published lessons in order (filtered by track on the client)'
\echo '   Reads every row it returns, so a whole-table scan is expected; no index can skip work here.'
explain (costs off)
select id, slug, title, kind, position, track_id from public.lessons order by position;

\echo '== 8. app, lesson player: one lesson by id'
explain (costs off)
select id, slug, title, kind, position, content from public.lessons where id = :'lesson_id';

reset role;
rollback;
