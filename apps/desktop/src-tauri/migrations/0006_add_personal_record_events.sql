-- vNext Handoff 04A.1: the PR event history (one row per headline PR event --
-- an exercise, in one completed session, in one equipment context, that beat
-- an earlier record). The one new table this handoff needs; it sits next to
-- personal_records (the CURRENT best, unchanged) and no existing table or row
-- is touched. Same generic (id, deleted_at, data JSON) shape as every other
-- table -- see SqlRepository's doc comment. An install that already holds
-- history simply starts with this table empty; the app's startup reconcile
-- fills it from that history.
CREATE TABLE IF NOT EXISTS personal_record_events (id TEXT PRIMARY KEY, deleted_at TEXT, data TEXT NOT NULL);
