-- Monitoring query 2: our own warn/error log lines, grouped by function and code.
-- Paste into: Logs Explorer (NOT the SQL Editor).
-- Source: function_logs (what our code console.logs; shape in
-- supabase/functions/_shared/http/RequestLog.ts).
-- Red flag: any "error" row. Each one has the failure line with the cause.
select
  regexp_extract(event_message, r'"fn":"([a-z-]+)"') as fn,
  regexp_extract(event_message, r'"level":"([a-z]+)"') as level,
  regexp_extract(event_message, r'"code":"([^"]+)"') as code,
  count(*) as lines,
  max(function_logs.timestamp) as last_seen,
  any_value(event_message) as example
from function_logs
where function_logs.timestamp > timestamp_sub(current_timestamp(), interval 24 hour)
  and regexp_contains(event_message, r'"level":"(warn|error)"')
group by fn, level, code
order by level, lines desc
limit 100;
