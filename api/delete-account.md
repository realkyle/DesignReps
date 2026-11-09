# API: `POST /delete-account`

Permanently deletes the signed-in user's account and all of their data. Required by the App Store for any app that lets people create an account (Guideline 5.1.1(v)).

## Request

```
POST /functions/v1/delete-account
Authorization: Bearer <access token>
```

No body. The account to delete **always comes from the verified token**, so a user can only delete themselves. Any body is ignored.

## Responses

| Status | When | Body |
|---|---|---|
| `204` | The account was deleted | none |
| `401` | Missing, malformed or invalid token | `{ "error": { "code": "UNAUTHENTICATED", … } }` |
| `405` | Method other than `POST` | `{ "error": { "code": "METHOD_NOT_ALLOWED", … } }` |
| `500` | Deletion failed (details only in the server log) | `{ "error": { "code": "INTERNAL_ERROR", … } }` |

## What gets deleted

The function calls Supabase's admin `deleteUser` (a hard delete). The schema cascades from `auth.users`:

```
auth.users ─(on delete cascade)→ public.users ─(on delete cascade)→ progress, events
```

Shared content (`tracks`, `lessons`) is untouched. Function logs record only `{fn, status, ms}`, never the user ID.

## Client behavior

The app asks the user to type `DELETE`, calls this endpoint, and on `204` clears the local session, so the app returns to sign-in. On any error the user stays signed in and can retry.

## Implementation

| Piece | File |
|---|---|
| Handler (tested with fakes) | `supabase/functions/delete-account/DeleteAccountHandler.ts` |
| Entry point | `supabase/functions/delete-account/index.ts` |
| Cascade tests (pgTAP) | `supabase/tests/database/account_deletion.test.sql` |
| App client | `src/lib/auth/AccountDeletionClient.ts` |
| Screen | `src/app/(app)/delete-account.tsx` |
