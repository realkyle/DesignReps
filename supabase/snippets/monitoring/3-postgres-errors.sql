-- Monitoring query 3: Postgres errors, last 24 h.
-- Paste into: Logs Explorer (NOT the SQL Editor).
-- Source: postgres_logs.
-- Known and expected: 22023 from log_event when the trigger script runs
-- (p_type 'monitoring_test'). 42501 from log_event means a signed-out call.
-- Red flag: anything else, especially from complete_lesson.
select
  parsed.error_severity,
  parsed.sql_state_code,
  count(*) as errors,
  max(postgres_logs.timestamp) as last_seen,
  any_value(event_message) as example
from postgres_logs
  cross join unnest(metadata) as m
  cross join unnest(m.parsed) as parsed
where postgres_logs.timestamp > timestamp_sub(current_timestamp(), interval 24 hour)
  and parsed.error_severity in ('ERROR', 'FATAL', 'PANIC')
group by parsed.error_severity, parsed.sql_state_code
order by errors desc
limit 100;
