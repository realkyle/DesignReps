@AGENTS.md

## Secrets: NEVER touch `.env` files

**NEVER look at, open, read, search, print, copy, edit, create, delete, move, source, or otherwise interact with `.env` or any `.env.*` file** (`.env.local`, `.env.development`, `.env.production`, `supabase/.env`, etc.), not even to check that one exists. They hold API keys and are managed only by the project owner.

- The only exception is `.env.example`, which holds placeholder names and no real values.
- Never ask for key values to be pasted into chat, and never echo or log `process.env` values.
- If a task needs an env value, write code that reads `process.env.EXPO_PUBLIC_*` and tell the owner which variable to add themselves.
- Never commit secrets. The `service_role` key belongs only in Supabase Edge Function secrets, never in the app or in `.env`.
- These rules are also enforced by deny rules in `.claude/settings.json`, but they apply regardless of those rules.
