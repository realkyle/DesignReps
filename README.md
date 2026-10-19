# DesignReps

**Show up daily. Design better.**

A Duolingo-style mobile app for practicing **system design** for software-engineering interviews. Short, daily, gamified lessons cover the core concepts (scaling, caching, load balancing, databases), plus guided exercises on classic prompts like *design a URL shortener*. Streaks, XP and levels turn system design into a habit instead of a last-minute cram.

> 🚧 In active development. MVP targeting the iOS App Store, with Android as a secondary target.

## Why I'm building it

Coding interviews have LeetCode for daily practice. System design has scattered videos and long-form reading. DesignReps aims to be the daily practice tool for system design, built for students and early-career engineers who are preparing for their first system design round.

## Engineering highlights

The backend is the main technical focus. The mobile app is intentionally a thin client. *(Already built: the app ↔ Supabase foundation, the key-safety check and the unit-tested domain layer. The rest is being built now.)*

- **Server-authoritative game logic.** XP, streaks, levels and lesson unlocks are computed in a Supabase Edge Function, never on the device, so a modified client can't award itself points. Submissions are validated, and duplicate or replayed submissions earn nothing.
- **Security by design.**
  - PostgreSQL Row Level Security on every table: users can read and write only their own rows, and no client can write XP or streak values directly.
  - The app ships only a public, RLS-restricted key. It **refuses to start** if a privileged (`secret` / `service_role`) key is ever configured, which catches that mistake before it can reach a release build.
- **Data-driven lesson engine.** Lessons are structured JSON rendered by shared components, so a new topic or a whole new track is a content change rather than new screens or schema changes.
- **Reproducible backend.**
  - A normalized 5-table schema (`users`, `tracks`, `lessons`, `progress`, `events`) built only through version-controlled SQL migrations.
  - Lessons are loaded by a seed script.
  - The full backend can be rebuilt from the repo on a fresh project.
- **Tested and measured.**
  - Unit tests for app logic.
  - An automated suite of 20+ Edge Function tests and 10+ Row Level Security tests.
  - Performance target: 95% of `complete-lesson` calls finish in under 1 s, with load testing at 50 concurrent users.
- **Clean architecture.** Screens stay thin; domain logic lives in small, dependency-injected TypeScript classes that are unit tested without a network or device.

## Tech stack

| Layer | Technology |
|---|---|
| Mobile | React Native, Expo (SDK 57), TypeScript, Expo Router |
| Backend | Supabase: PostgreSQL, Auth, Row Level Security, Edge Functions (TypeScript/Deno) |
| Testing | Jest (app), Deno test runner and SQL tests (backend) |
| Delivery | Expo EAS Build/Submit, TestFlight, App Store |

## Architecture

```
┌───────────────────────────────┐  HTTPS   ┌──────────────────────────────────┐
│ DesignReps app (iOS/Android)  │ ───────▶ │ Supabase                         │
│  screens → hooks → domain lib │          │  Auth (sessions)                 │
│  JSON lesson engine           │ ◀─────── │  Edge Function: complete-lesson  │
└───────────────────────────────┘          │   (XP · streak · unlock rules)   │
                                           │  PostgreSQL + Row Level Security │
                                           └──────────────────────────────────┘
```

When a user finishes a lesson, the app sends the result with its session token to `complete-lesson`. The function validates it, updates XP and the streak, unlocks the next lesson, and logs an anonymous usage event. Row Level Security enforces data isolation at the database layer, independent of any client code.

## Engineering practices

- Every feature and fix ships on its own branch through a pull request; releases are tagged.
- Type-check, lint and tests run before every merge.
- No secrets in the repository. Build-time and server secrets live in EAS and Supabase secret stores.
