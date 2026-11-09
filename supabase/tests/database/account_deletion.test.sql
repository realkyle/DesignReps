-- Account deletion: deleting the auth user (what the delete-account Edge
-- Function does through the admin API) must remove every row of that
-- user's personal data, and nothing belonging to anyone else.
-- Run with: npx supabase test db

begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

-- Fixtures: two users, each with a profile (created by the sign-up trigger),
-- progress and an event on the same lesson.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'delete-me@example.com'),
  ('00000000-0000-0000-0000-0000000000d2', 'keep-me@example.com');

insert into public.tracks (id, slug, title, position, is_published) values
  ('00000000-0000-0000-0000-0000000000e1', 'deletion-track', 'Deletion track', 96, true);

insert into public.lessons (id, track_id, slug, title, position, content, is_published) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', 'deletion-lesson', 'Deletion lesson', 1, '{}', true);

insert into public.progress (user_id, lesson_id, best_score) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e2', 4),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000e2', 5);

insert into public.events (user_id, type, lesson_id) values
  ('00000000-0000-0000-0000-0000000000d1', 'lesson_completed', '00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-0000000000d2', 'lesson_completed', '00000000-0000-0000-0000-0000000000e2');

select ok(exists (select 1 from public.users where id = '00000000-0000-0000-0000-0000000000d1'),
  'the sign-up trigger created the profile');

delete from auth.users where id = '00000000-0000-0000-0000-0000000000d1';

select is((select count(*)::int from public.users where id = '00000000-0000-0000-0000-0000000000d1'), 0,
  'deleting the account removes the profile');
select is((select count(*)::int from public.progress where user_id = '00000000-0000-0000-0000-0000000000d1'), 0,
  '…and their progress');
select is((select count(*)::int from public.events where user_id = '00000000-0000-0000-0000-0000000000d1'), 0,
  '…and their events');

select is((select count(*)::int from public.progress where user_id = '00000000-0000-0000-0000-0000000000d2'), 1,
  'another user''s progress is untouched');
select is((select count(*)::int from public.events where user_id = '00000000-0000-0000-0000-0000000000d2'), 1,
  'another user''s events are untouched');
select ok(exists (select 1 from public.lessons where id = '00000000-0000-0000-0000-0000000000e2'),
  'shared lesson content is untouched');

select * from finish();
rollback;
