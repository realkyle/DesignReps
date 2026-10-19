# API Contract: `complete-lesson`

| | |
|---|---|
| **Status** | Draft v1 (Oct 2026). The implementation must follow this document; change the contract first, then the code. |
| **Type** | Supabase Edge Function (TypeScript / Deno) |
| **Endpoint** | `POST {SUPABASE_URL}/functions/v1/complete-lesson` |
| **Auth** | Signed-in user (Supabase Auth access token) |

## Purpose

This is the **only** way a user earns XP, extends a streak or unlocks a lesson. The app submits the user's answers. The server grades them, applies the game rules and returns the new state. Clients can never write XP, level, streak or progress directly: Row Level Security makes those columns read-only for users (see [Security](#security)).

---

## Request

### Headers

| Header | Required | Value |
|---|---|---|
| `Authorization` | ✅ | `Bearer <access_token>` of the signed-in user |
| `apikey` | ✅ | The project's publishable key |
| `Content-Type` | ✅ | `application/json` |

`supabase.functions.invoke("complete-lesson", { body })` sets all three automatically.

### Body

```json
{
  "lessonId": "6f1c2a9e-3b7d-4c55-9a10-2f8e4d1b7c33",
  "answers": [
    { "questionId": "q1", "choiceId": "b" },
    { "questionId": "q2", "choiceId": "a" },
    { "questionId": "q3", "choiceId": "d" },
    { "questionId": "q4", "choiceId": "c" },
    { "questionId": "q5", "choiceId": "a" }
  ],
  "timezone": "America/Los_Angeles"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `lessonId` | string (UUID) | ✅ | Must be an existing, published lesson or scenario. |
| `answers` | array | ✅ | Exactly one entry per question in the lesson, with no duplicates and no unknown IDs. Scenarios use the same shape: one entry per guided step. |
| `answers[].questionId` | string | ✅ | A question ID from the lesson's JSON content. |
| `answers[].choiceId` | string | ✅ | A choice ID belonging to that question. |
| `timezone` | string | ❌ | An IANA time zone name, used to decide what "today" means for the streak. Defaults to `UTC`; invalid names are rejected. |

The client does **not** send a score or XP. Grading happens on the server, against the lesson content stored in the database.

### TypeScript types

```ts
interface CompleteLessonRequest {
  lessonId: string;
  answers: { questionId: string; choiceId: string }[];
  timezone?: string;
}
```

---

## Response: `200 OK`

```json
{
  "lessonId": "6f1c2a9e-3b7d-4c55-9a10-2f8e4d1b7c33",
  "alreadyCompleted": false,
  "score": { "correct": 4, "total": 5 },
  "xpAwarded": 10,
  "totalXp": 30,
  "level": { "current": 2, "leveledUp": true, "nextLevelXp": 40 },
  "streak": { "current": 3, "longest": 5, "extendedToday": true },
  "unlockedLessonId": "0b9d7e21-5a4f-4e0c-8d3b-7a1f6c2e9d48"
}
```

| Field | Type | Meaning |
|---|---|---|
| `lessonId` | string | Echo of the request. |
| `alreadyCompleted` | boolean | `true` if the user had finished this lesson before. Repeats are allowed (practice) but award no XP. |
| `score` | `{ correct, total }` | Server-graded result. Shown to the user; it does **not** change the XP awarded. |
| `xpAwarded` | number | `10` for a lesson, `25` for a scenario, `0` for a repeat. |
| `totalXp` | number | The user's XP after this request. |
| `level.current` | 1–5 | Level after this request. |
| `level.leveledUp` | boolean | `true` if this request moved the user up a level. |
| `level.nextLevelXp` | number \| null | Total XP needed for the next level; `null` at level 5. |
| `streak.current` | number | Consecutive days with at least one completion, including today. |
| `streak.longest` | number | Best streak ever. |
| `streak.extendedToday` | boolean | `true` if this request was the first completion of the day, so the streak changed. |
| `unlockedLessonId` | string \| null | The next lesson, if this request unlocked it; otherwise `null`. |

```ts
interface CompleteLessonResponse {
  lessonId: string;
  alreadyCompleted: boolean;
  score: { correct: number; total: number };
  xpAwarded: number;
  totalXp: number;
  level: { current: 1 | 2 | 3 | 4 | 5; leveledUp: boolean; nextLevelXp: number | null };
  streak: { current: number; longest: number; extendedToday: boolean };
  unlockedLessonId: string | null;
}
```

---

## Errors

Every error uses the same shape, so the app needs one error handler:

```json
{ "error": { "code": "LESSON_LOCKED", "message": "Complete the previous lesson first." } }
```

```ts
interface ApiError {
  error: { code: ErrorCode; message: string; details?: Record<string, unknown> };
}
```

`message` is safe to show to the user. `details` is optional debugging context, such as which field failed validation.

### The 4 contract error cases

| # | HTTP | `code` | When | Example `details` |
|---|---|---|---|---|
| 1 | `401` | `UNAUTHENTICATED` | Missing, malformed or expired access token | none |
| 2 | `400` | `INVALID_REQUEST` | Body isn't valid JSON, or fails a [body rule](#body): bad UUID, missing or duplicate answers, unknown question or choice ID, invalid time zone | `{ "field": "answers[2].choiceId", "reason": "unknown choice" }` |
| 3 | `404` | `LESSON_NOT_FOUND` | `lessonId` doesn't exist or isn't published | `{ "lessonId": "…" }` |
| 4 | `403` | `LESSON_LOCKED` | The lesson exists, but the user hasn't completed the lesson before it in the track | `{ "requiredLessonId": "…" }` |

### Platform errors (not part of the 4)

| HTTP | `code` | When |
|---|---|---|
| `405` | `METHOD_NOT_ALLOWED` | Any method other than `POST` (`OPTIONS` is answered for CORS) |
| `500` | `INTERNAL_ERROR` | An unexpected failure. Nothing is written (the transaction rolls back) and the error is logged server-side. The message never includes internal details. |

**Check order:** auth → body validation → lesson exists → lesson unlocked. The first failing check decides the error. For example, a malformed request from a signed-out user gets `401`.

---

## Game rules

All values are constants in the function, so changing them is a single code change.

### XP
| Event | XP |
|---|---|
| First completion of a lesson | 10 |
| First completion of a scenario | 25 |
| Any repeat completion | 0 |

The MVP track has 8 lessons and 1 scenario, so a user can earn at most 8 × 10 + 25 = **105 XP**.

### Levels (proposed thresholds, fitted to the 105-XP MVP track)
| Level | Total XP needed |
|---|---|
| 1 | 0 |
| 2 | 20 (2 lessons) |
| 3 | 40 (4 lessons) |
| 4 | 70 (7 lessons) |
| 5 | 100 (the whole track, including the scenario) |

### Streak
Dates are calendar days in the request's `timezone`.

| User's last completion day | Effect on `streak.current` |
|---|---|
| Today | Unchanged (`extendedToday: false`) |
| Yesterday | +1 |
| Earlier, or never | Reset to 1 |

Any valid completion counts toward the streak, **including repeats**. Practicing an old lesson keeps a streak alive, as in Duolingo. `streak.longest` = max(`longest`, `current`).

### Unlocking
- Lessons are ordered within a track (`lessons.position`). The first lesson in a track is always unlocked.
- Lesson *n* is unlocked once lesson *n − 1* is completed.
- `unlockedLessonId` is returned only on the **first** completion, and only if a next lesson exists.

---

## Side effects

The whole request runs as **one database transaction**: either everything below happens, or nothing does.

1. `progress`: insert `(user_id, lesson_id, score, completed_at)` on the first completion. On a repeat, update `last_completed_at` and `best_score` only.
2. `users`: update `xp`, `level`, `streak_current`, `streak_longest` and `last_active_date`.
3. `events`: insert one event of type `lesson_completed` or `scenario_completed`. Events record usage for the metrics (no answers, no personal data).

---

## Security

- **Identity comes from the token, never the body.** The user ID is taken from the verified access token, so one user can't submit on behalf of another.
- **Privileged writes.** The function writes with a server-only key that is stored in Supabase Edge Function secrets and never sent to the app. RLS denies client `INSERT`/`UPDATE` on `progress` and on the XP and streak columns of `users`.
- **No client-supplied scores.** XP depends on server-side lesson type and completion history, not on anything the client claims.
- **Duplicate and replay protection.** A unique constraint on `progress(user_id, lesson_id)` and row locking on the user row mean that two simultaneous submissions (a double tap, a retry, a replayed request) award XP **at most once**. Later submissions return `alreadyCompleted: true` and `xpAwarded: 0`.
- **Input limits.** The body is capped at 16 KB and `answers` at 20 entries, which is more than any lesson needs.

## Performance target

95% of requests finish in **under 1 second**, measured from Edge Function logs during user testing (plan metric 4).

---

## Test plan (maps to the 20+ Edge Function tests)

| Area | Cases |
|---|---|
| Happy path | First lesson completion → +10 XP · first scenario completion → +25 XP · response matches the schema |
| XP and duplicates | Repeat → 0 XP and `alreadyCompleted` · two concurrent submissions → XP awarded once · replayed request → no extra XP |
| Levels | Crossing a threshold → `leveledUp` · staying within a level → no level-up · level 5 → `nextLevelXp: null` |
| Streak | First ever → 1 · same day → unchanged · next day → +1 · gap of 2+ days → reset to 1 · `longest` kept after a reset · time zone moves the day boundary · repeat completion still extends the streak |
| Unlocking | First completion unlocks the next lesson · last lesson → `null` · repeat → `null` |
| Error 1 (401) | No token · expired token |
| Error 2 (400) | Invalid JSON · bad UUID · missing answer · duplicate question · unknown choice · invalid time zone |
| Error 3 (404) | Unknown lesson ID · unpublished lesson |
| Error 4 (403) | Submitting lesson 2 before lesson 1 |
| Atomicity | Simulated failure partway through → no partial writes |

## Open decisions

- [ ] Confirm the level thresholds above. They're sized for the 105-XP MVP track and will need rescaling when more tracks are added.
- [ ] Confirm that repeat completions keep a streak alive.
- [ ] Confirm that the score is informational only, with no minimum score to "pass" a lesson.
