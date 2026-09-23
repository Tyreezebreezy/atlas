-- vNext Handoff 02: test-protocol registry infrastructure. The only
-- genuinely new table this handoff needs -- PersonalRecord/Milestone/
-- Benchmark/WorkoutSession/PerformedSet all grow new JSON fields on their
-- existing rows instead, which needs no migration at all under this same
-- generic (id, deleted_at, data JSON) shape.
CREATE TABLE IF NOT EXISTS test_protocols (id TEXT PRIMARY KEY, deleted_at TEXT, data TEXT NOT NULL);
