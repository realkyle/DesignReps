-- log_event: what the app can and can't log.
-- Run with: npx supabase test db
-- Calls run as real app users (the `authenticated` role with JWT claims).

begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'events-a@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'events-b@example.com');

insert into public.tracks (id, slug, title, position, is_published) values
  ('00000000-0000-0000-0000-0000000000c5', 'events-track', 'Events track', 95, true);

insert into public.lessons (id, track_id, slug, title, position, content, is_published) values
  ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000c5', 'events-lesson', 'Events lesson', 1, '{}', true),
  ('00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000c5', 'events-draft', 'Draft', 2, '{}', false);

-- Permissions
select ok(has_function_privilege('authenticated', 'public.log_event(text, uuid)', 'execute'), 'signed-in users can call log_event');
select ok(not has_function_privilege('anon', 'public.log_event(text, uuid)', 'execute'), 'signed-out (anon) callers cannot');

-- =============================================================================
-- Signed in as user A
-- =============================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}', true);

select is(public.log_event('app_opened'), true, 'A can log app_opened');
select is(public.log_event('lesson_started', '00000000-0000-0000-0000-0000000000c6'), true, 'A can log lesson_started for a published lesson');

select is(public.log_event('app_opened'), false, 'the same event within 60 s is ignored (rate limit)');
select is(public.log_event('lesson_started', '00000000-0000-0000-0000-0000000000c6'), false, '…for lesson_started too');

select throws_ok($$ select public.log_event('lesson_completed', '00000000-0000-0000-0000-0000000000c6') $$,
  '22023', null, 'A cannot fake lesson_completed');
select throws_ok($$ select public.log_event('scenario_completed', '00000000-0000-0000-0000-0000000000c6') $$,
  '22023', null, 'A cannot fake scenario_completed');
select throws_ok($$ select public.log_event('lesson_started') $$,
  '22023', null, 'lesson_started needs a lesson');
select throws_ok($$ select public.log_event('lesson_started', '00000000-0000-0000-0000-0000000000c7') $$,
  '22023', null, 'lesson_started rejects an unpublished lesson');
select throws_ok($$ select public.log_event('app_opened', '00000000-0000-0000-0000-0000000000c6') $$,
  '22023', null, 'app_opened takes no lesson');

select throws_ok($$ insert into public.events (user_id, type) values ('00000000-0000-0000-0000-0000000000c1', 'app_opened') $$,
  '42501', null, 'A still cannot insert into events directly');

-- =============================================================================
-- Signed in as user B: their own rate limit, their own rows
-- =============================================================================
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c2", "role": "authenticated"}', true);
select is(public.log_event('app_opened'), true, 'B''s app_opened is not limited by A''s');

-- =============================================================================
-- Checks as the database owner
-- =============================================================================
reset role;

select is(
  (select count(*)::int from public.events where user_id = '00000000-0000-0000-0000-0000000000c1'), 2,
  'A has exactly 2 events (the repeats and the rejected calls wrote nothing)');
select is(
  (select count(*)::int from public.events where user_id = '00000000-0000-0000-0000-0000000000c2'), 1,
  'every event belongs to the user from the JWT');

-- After the window passes, the same event is logged again.
update public.events set occurred_at = now() - interval '2 minutes'
where user_id = '00000000-0000-0000-0000-0000000000c1' and type = 'app_opened';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}', true);
select is(public.log_event('app_opened'), true, 'after 60 s the same event is logged again');

select * from finish();
rollback;
