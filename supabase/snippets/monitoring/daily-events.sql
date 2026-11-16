-- Monitoring: usage events per day, last 7 days (Pacific time).
-- Paste into: Dashboard > SQL Editor (this one IS Postgres). Read-only.
-- Red flag: a testing day with app_opened or lesson_started at 0 means the
-- app's log_event calls are failing silently (check Logs, Log Type Postgres
-- and API Gateway, for log_event errors).
-- Also shows lesson_completed, written by complete_lesson() itself.
select
  (e.occurred_at at time zone 'America/Los_Angeles')::date as day,
  e.type,
  count(*) as events,
  count(distinct e.user_id) as users
from public.events e
where e.occurred_at > now() - interval '7 days'
group by day, e.type
order by day desc, e.type;
