-- Row Level Security tests: what app users can and can't see or change.
-- Run with: npx supabase test db
-- Each test acts as a real app user by switching to the `authenticated` role
-- and setting the JWT claims Supabase would set from their access token.

begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- Fixtures (as the postgres superuser): two users, one published and one
-- unpublished lesson, and a completion for each user.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'rls-a@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'rls-b@example.com');

insert into public.tracks (id, slug, title, position, is_published) values
  ('00000000-0000-0000-0000-0000000000f1', 'rls-track', 'RLS track', 98, true),
  ('00000000-0000-0000-0000-0000000000f2', 'rls-hidden-track', 'Hidden track', 97, false);

insert into public.lessons (id, track_id, slug, title, position, content, is_published) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f1', 'visible', 'Visible', 1, '{}', true),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000f1', 'draft', 'Draft', 2, '{}', false),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000f2', 'in-hidden', 'In hidden track', 1, '{}', true);

insert into public.progress (user_id, lesson_id, best_score) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 3),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b1', 5);

-- =============================================================================
-- Signed in as user A
-- =============================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);

select is((select count(*)::int from public.users), 1, 'A sees exactly one profile');
select is((select id from public.users), '00000000-0000-0000-0000-0000000000a1'::uuid, '…and it is their own');
select is((select count(*)::int from public.progress), 1, 'A sees only their own progress');
select is((select best_score::int from public.progress), 3, '…not B''s');

select ok(exists (select 1 from public.tracks where slug = 'rls-track'), 'A can read published tracks');
select ok(not exists (select 1 from public.tracks where slug = 'rls-hidden-track'), 'A cannot read unpublished tracks');
select ok(exists (select 1 from public.lessons where slug = 'visible'), 'A can read published lessons');
select ok(not exists (select 1 from public.lessons where slug = 'draft'), 'A cannot read unpublished lessons');
select ok(not exists (select 1 from public.lessons where slug = 'in-hidden'), 'A cannot read lessons in an unpublished track');
select is((select count(*)::int from public.events), 0, 'A cannot read events');

-- Writes are all denied: RLS silently filters UPDATE/DELETE (0 rows) and
-- rejects INSERT with an error.
update public.users set xp = 9999 where id = '00000000-0000-0000-0000-0000000000a1';
select is((select xp from public.users), 0, 'A cannot give themselves XP');

delete from public.progress;
select is((select count(*)::int from public.progress), 1, 'A cannot delete progress');

select throws_ok(
  $$ insert into public.progress (user_id, lesson_id, best_score)
     values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2', 5) $$,
  '42501', null, 'A cannot insert progress directly');

select throws_ok(
  $$ insert into public.events (user_id, type) values ('00000000-0000-0000-0000-0000000000a1', 'lesson_completed') $$,
  '42501', null, 'A cannot insert events directly (yet)');

select throws_ok(
  $$ select public.complete_lesson('00000000-0000-0000-0000-0000000000a2'::uuid,
       '00000000-0000-0000-0000-0000000000b1'::uuid, '[]'::jsonb, 'UTC') $$,
  '42501', null, 'A cannot call complete_lesson directly (e.g. as user B)');

-- =============================================================================
-- Signed out (anon)
-- =============================================================================
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select is((select count(*)::int from public.lessons), 0, 'signed-out visitors see no lessons');

reset role;
select * from finish();
rollback;
