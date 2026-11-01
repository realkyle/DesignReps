#!/usr/bin/env bash
# Double-tap test for public.complete_lesson (contract: "two concurrent
# submissions → XP awarded once").
#
# Runs against the LOCAL Supabase database only (npx supabase start).
# Two sessions submit the same first completion at the same time:
#   A: locks the user row, then holds its transaction open for 2 seconds
#   B: starts 0.5 s later and must WAIT for A's lock, then see A's result
# Expected: one gets 10 XP, the other 0 (alreadyCompleted), total XP = 10.
#
# Usage: npm run test:db:concurrency
set -euo pipefail

CONTAINER="supabase_db_DesignReps"
psql_local() { docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qtA "$@"; }

USER_ID="00000000-0000-0000-0000-00000000c0c0"
TRACK_ID="00000000-0000-0000-0000-00000000c0f1"
LESSON_ID="00000000-0000-0000-0000-00000000c0b1"
ANSWERS='[{"questionId":"q1","choiceId":"a"}]'

cleanup() {
  psql_local -c "delete from auth.users where id = '$USER_ID'; delete from public.tracks where id = '$TRACK_ID';" >/dev/null
}
trap cleanup EXIT
cleanup

psql_local >/dev/null <<SQL
insert into auth.users (id, email) values ('$USER_ID', 'concurrency@example.com');
insert into public.tracks (id, slug, title, position, is_published)
  values ('$TRACK_ID', 'concurrency-track', 'Concurrency', 999, true);
insert into public.lessons (id, track_id, slug, title, position, content, is_published)
  values ('$LESSON_ID', '$TRACK_ID', 'only-lesson', 'Only lesson', 1,
          '{"steps":[{"type":"question","id":"q1","choices":[{"id":"a"}],"correctChoiceId":"a"}]}', true);
SQL

CALL="select public.complete_lesson('$USER_ID', '$LESSON_ID', '$ANSWERS', 'UTC') ->> 'xpAwarded'"

# Session A: submit, then keep the transaction (and the row lock) open.
psql_local -c "begin;" -c "$CALL;" -c "select pg_sleep(2);" -c "commit;" > /tmp/designreps-a.raw &
sleep 0.5

# Session B: the "second tap".
START=$(date +%s)
psql_local -c "$CALL;" > /tmp/designreps-b.out
WAITED=$(( $(date +%s) - START ))
wait

A=$(head -1 /tmp/designreps-a.raw); B=$(cat /tmp/designreps-b.out)
STATE=$(psql_local -c "select u.xp || ' ' || p.completion_count || ' ' || (select count(*) from public.events e where e.user_id = u.id)
                       from public.users u join public.progress p on p.user_id = u.id where u.id = '$USER_ID';")
read -r XP COUNT EVENTS <<< "$STATE"
rm -f /tmp/designreps-a.raw /tmp/designreps-b.out

echo "Session A xpAwarded: $A"
echo "Session B xpAwarded: $B (waited ~${WAITED}s for A's lock)"
echo "Final: xp=$XP, completion_count=$COUNT, events=$EVENTS"

if [[ "$A" == "10" && "$B" == "0" && "$XP" == "10" && "$COUNT" == "2" && "$EVENTS" == "2" && "$WAITED" -ge 1 ]]; then
  echo "PASS: concurrent submissions awarded XP once"
else
  echo "FAIL: expected A=10, B=0, xp=10, completion_count=2, events=2, and B to wait" >&2
  exit 1
fi
