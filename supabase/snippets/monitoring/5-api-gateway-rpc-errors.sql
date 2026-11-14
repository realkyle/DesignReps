-- Monitoring query 5: failed database calls from the app (RPC), last 24 h.
-- Paste into: Logs Explorer (NOT the SQL Editor).
-- Source: edge_logs (the API gateway in front of the database).
-- The app ignores log_event failures (src/lib/events/UsageEvents.ts), so
-- this and query 3 are the only places they show up.
select
  request.path,
  response.status_code,
  count(*) as requests,
  max(edge_logs.timestamp) as last_seen
from edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.request) as request
  cross join unnest(m.response) as response
where edge_logs.timestamp > timestamp_sub(current_timestamp(), interval 24 hour)
  and request.path like '/rest/v1/rpc/%'
  and response.status_code >= 400
group by request.path, response.status_code
order by requests desc
limit 100;
