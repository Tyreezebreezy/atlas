-- vNext Handoff 01: canonical exercise aliases + equipment-aware progression
-- foundations. Same generic (id, deleted_at, data JSON) shape as every
-- other table -- see SqlRepository's doc comment.
CREATE TABLE IF NOT EXISTS exercise_aliases (id TEXT PRIMARY KEY, deleted_at TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS equipment_definitions (id TEXT PRIMARY KEY, deleted_at TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gym_equipment (id TEXT PRIMARY KEY, deleted_at TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS exercise_equipment_context (id TEXT PRIMARY KEY, deleted_at TEXT, data TEXT NOT NULL);
