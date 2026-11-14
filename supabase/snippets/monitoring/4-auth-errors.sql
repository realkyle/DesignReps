-- Monitoring query 4: Auth errors, last 24 h.
-- Paste into: Logs Explorer (NOT the SQL Editor).
-- Source: auth_logs.
-- Expected: a few invalid_credentials (typos; one from the trigger script).
-- Red flag: 429 (rate limit, e.g. too many confirmation emails), 5xx, or
-- errors sending email (testers can't confirm their account).
select
  metadata.path,
  metadata.status,
  metadata.level,
  metadata.msg,
  count(*) as events,
  max(auth_logs.timestamp) as last_seen
from auth_logs
  cross join unnest(metadata) as metadata
where auth_logs.timestamp > timestamp_sub(current_timestamp(), interval 24 hour)
  and (metadata.level = 'error' or metadata.status >= 400)
group by metadata.path, metadata.status, metadata.level, metadata.msg
order by events desc
limit 100;
