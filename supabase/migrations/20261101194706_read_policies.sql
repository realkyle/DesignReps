-- =============================================================================
-- Read-only RLS policies: what a signed-in app user may SELECT.
--
--   tracks, lessons → published ones (shared catalog)
--   users, progress → only their own row(s)
--   events          → nothing (write/read policies come with event logging)
--
-- There are deliberately NO insert/update/delete policies, so every client
-- write is still denied. Game state changes only through complete_lesson
-- (service_role), as the API contract requires.
--
-- Note: lessons.content includes each question's correctChoiceId. The app
-- needs it to show instant feedback after each answer, as Duolingo does.
-- That's acceptable because the server re-grades every submission and the
-- score never changes the XP awarded.
--
-- `(select auth.uid())` instead of `auth.uid()`: Postgres evaluates it once
-- per query instead of once per row (Supabase's RLS performance advice).
-- =============================================================================

create policy "Signed-in users can read published tracks"
  on public.tracks for select
  to authenticated
  using (is_published);

create policy "Signed-in users can read published lessons in published tracks"
  on public.lessons for select
  to authenticated
  using (
    is_published
    and exists (select 1 from public.tracks t where t.id = track_id and t.is_published)
  );

create policy "Users can read their own profile"
  on public.users for select
  to authenticated
  using (id = (select auth.uid()));

create policy "Users can read their own progress"
  on public.progress for select
  to authenticated
  using (user_id = (select auth.uid()));
