-- Monitoring query 1: Edge Function requests that failed, last 24 h.
-- Paste into: Dashboard > Logs & Analytics > Logs Explorer (NOT the SQL Editor).
-- Source: function_edge_logs (one row per request, written by the platform).
-- Red flag: any 5xx. A jump in 4xx on a testing day is worth a look too.
select
  m.function_id,
  response.status_code,
  count(*) as requests,
  max(function_edge_logs.timestamp) as last_seen
from function_edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.response) as response
where function_edge_logs.timestamp > timestamp_sub(current_timestamp(), interval 24 hour)
  and response.status_code >= 400
group by m.function_id, response.status_code
order by requests desc
limit 100;

-- Plan metric 4 (95% of complete-lesson requests under 1 s). Run this
-- separately. function_id is the function's UUID: copy it from a row above.
-- select
--   count(*) as requests,
--   approx_quantiles(m.execution_time_ms, 100)[offset(95)] as p95_ms
-- from function_edge_logs
--   cross join unnest(metadata) as m
-- where function_edge_logs.timestamp > timestamp_sub(current_timestamp(), interval 24 hour)
--   and m.function_id = '<complete-lesson function id>';
