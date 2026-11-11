# DesignReps

**Show up daily. Design better.**

A Duolingo-style mobile app for practicing **system design** for software-engineering interviews. Short, daily, gamified lessons cover the core concepts (scaling, caching, load balancing, databases), plus guided exercises on classic prompts like *design a URL shortener*. Streaks, XP and levels turn system design into a habit instead of a last-minute cram.

> 🚧 In active development. MVP targeting the iOS App Store, with Android as a secondary target.

## Why I'm building it

Coding interviews have LeetCode for daily practice. System design has scattered videos and long-form reading. DesignReps aims to be the daily practice tool for system design, built for students and early-career engineers who are preparing for their first system design round.

## Engineering highlights

The backend is the main technical focus. The mobile app is intentionally a thin client.

**Built so far:**
- the database schema, built only through migrations
- email/password sign-in with protected screens
- the lesson path, lesson player and results screens
- server-side grading and game rules (XP, levels, streaks, unlocking) in one Postgres transaction
- read-only Row Level Security
- in-app account deletion
- usage-event logging for metrics
- the lesson content format and its validator

All of it is covered by 290+ automated tests. **In progress:** the first full set of lessons and the TestFlight release.

- **Server-authoritative game logic.** XP, streaks, levels and lesson unlocks are computed on the server, never on the device: the app sends the user's answers, not a score. A modified client can't award itself points.
  - The rules run in one PostgreSQL function, `complete_lesson()`, inside a single transaction:
    - it locks the user's row (`SELECT … FOR UPDATE`)
    - it grades the answers
    - it updates XP, level, streak and unlocks, and records progress and a usage event

    A two-session test proves that a double submission can't award XP twice. Streaks follow the user's own time zone.
  - The `complete-lesson` Edge Function (TypeScript/Deno) stays thin. It verifies the user's token, checks the request shape, and calls that function with a server-only key.
  - The schema enforces the rules too: XP can't go negative, levels are 1–5, and the `progress (user_id, lesson_id)` primary key means XP is awarded at most once per lesson.
- **Security by design.**
  - PostgreSQL Row Level Security on every table: users can **read** only published content and their own rows, and **no client can write any table directly**.
  - Writes go through server functions that take the user from the verified token, never from the request. These are `complete_lesson()` and `log_event()`, which accepts only two app event types and has a 60-second rate limit.
  - **In-app account deletion** (an App Store requirement): the `delete-account` Edge Function deletes the user through the admin API. Cascading foreign keys then remove their profile, progress and events in one step, and the logs never record who was deleted.
  - The app ships only a public, RLS-restricted key. It **refuses to start** if a privileged (`secret` / `service_role`) key is ever configured, which catches that mistake before it can reach a release build.
- **Data-driven lessons.** Lessons are structured JSON, validated against a schema in the test suite (exactly 5 questions, a correct answer that exists, cited sources), and rendered by shared components. A new topic or a whole new track is a content change rather than new screens or schema changes.
- **Reproducible backend.**
  - A normalized 5-table schema (`users`, `tracks`, `lessons`, `progress`, `events`) built only through version-controlled SQL migrations.
  - Lessons are loaded by a seed script.
  - Migrations, functions and seed data all live in the repo, so the backend can be recreated on a fresh project. A full rebuild test is planned.
- **Tested and measured.**
  - Jest unit tests cover the app logic and the Edge Function handlers, with dependencies injected so no network is needed.
  - pgTAP database tests cover Row Level Security, grading and game rules, the deletion cascade and event logging.
  - A two-session concurrency test checks the double-submit case.
  - Planned: performance (95% of `complete-lesson` calls under 1 s) and load testing at 50 concurrent users.
- **Clean architecture.** Screens stay thin; domain logic lives in small, dependency-injected TypeScript classes that are unit tested without a network or device.

## Tech stack

| Layer | Technology |
|---|---|
| Mobile | React Native 0.88, Expo SDK 58, TypeScript, Expo Router |
| Backend | Supabase: PostgreSQL, Auth, Row Level Security, Edge Functions (TypeScript/Deno) |
| Testing | Jest (app and Edge Function handlers), pgTAP (database), a two-session concurrency test |
| Delivery | Expo EAS Build/Submit, TestFlight, App Store |

## Architecture

![DesignReps architecture: the app on the student's device talks to Supabase Auth, the auto-generated REST API (reads plus the log_event function) and two Edge Functions, complete-lesson and delete-account. Everything is backed by PostgreSQL, where Row Level Security makes clients read-only and the complete_lesson function grades and awards progress in one transaction. GitHub, Expo EAS and the Supabase CLI build and deploy it.](.github/assets/architecture.png)

1. The student signs in; Supabase Auth returns a JWT session token.
2. The app reads lessons and the student's own progress through Supabase's REST API. Row Level Security filters every query to that student's rows.
3. Opening a lesson logs a `lesson_started` event through `log_event()` ([contract](api/log-event.md)). The user comes from the token, and repeats within 60 s are ignored.
4. When a lesson ends, the app sends the **answers** (not a score) with the token to the `complete-lesson` Edge Function ([API contract](api/complete-lesson.md)).
5. The function verifies the token and calls `complete_lesson()`. In **one transaction**, that function locks the student's row, grades the answers, updates XP, level and streak, unlocks the next lesson, and records progress and a completion event.

**Account deletion:** the `delete-account` Edge Function ([contract](api/delete-account.md)) deletes the user, and the database cascade removes everything tied to them.

## Engineering practices

- Every feature and fix ships on its own branch through a pull request; releases will be tagged starting with the first App Store build.
- Type-check, lint and tests run before every merge.
- API behavior is specified first ([`api/complete-lesson.md`](api/complete-lesson.md)), then implemented and tested against that contract.
- The schema changes only through migrations in [`supabase/migrations`](supabase/migrations); the lesson format is documented in [`content/README.md`](content/README.md).
- No secrets in the repository. Server keys live only in Supabase's secret store; the app ships only the publishable key.
