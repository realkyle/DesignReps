# API: `rpc/log_event` (usage events)

Records usage events for the project metrics (daily use, lessons started vs. completed). Called from the app with `supabase.rpc("log_event", …)`; it's a Postgres function exposed through Supabase's REST API, not an Edge Function, so there's no cold start for a fire-and-forget call.

## Event types

| Type | Written by | When |
|---|---|---|
| `app_opened` | the app → `log_event` | The app comes to the foreground while signed in |
| `lesson_started` | the app → `log_event` | A lesson finishes loading in the player |
| `lesson_completed` | the server, inside `complete_lesson()` | A lesson is completed (first time or repeat) |
| `scenario_completed` | the server, inside `complete_lesson()` | A scenario is completed |

The app can only log the first two, so completions can't be faked.

## Request

```
POST /rest/v1/rpc/log_event
Authorization: Bearer <access token>
{ "p_type": "app_opened" }
{ "p_type": "lesson_started", "p_lesson_id": "<lesson uuid>" }
```

## Responses

| Result | Meaning |
|---|---|
| `true` | Logged |
| `false` | Ignored: the same event (type + lesson) was logged in the last 60 seconds (rate limit) |
| `42501` | Not signed in (anon can't execute the function) |
| `22023` | Bad input: another type, `lesson_started` without a published lesson, or `app_opened` with a lesson |

## Rules (enforced in the function)

- The user always comes from the JWT (`auth.uid()`), never a parameter.
- `occurred_at` is the server's clock.
- Users still have no direct write access to `events`; the function is `security definer` and enforces the rules itself.
- Index `events (user_id, type, occurred_at desc)` serves the rate-limit lookup and per-user metric queries.

## Client behavior

`UsageEvents` (`src/lib/events/`) is fire-and-forget: it never throws or blocks the UI. A failed event is only reported to the dev log, because a lost event makes a metric slightly low and nothing else.

## Implementation

| Piece | File |
|---|---|
| Function + index | `supabase/migrations/20261109045808_log_event_function.sql` |
| Tests (pgTAP, 16) | `supabase/tests/database/log_event.test.sql` |
| App client (4 tests) | `src/lib/events/UsageEvents.ts` |
| `app_opened` hook | `src/hooks/useAppOpenedEvent.ts` (used by `src/app/(app)/_layout.tsx`) |
| `lesson_started` | `src/hooks/useLessonPlayer.ts` |
