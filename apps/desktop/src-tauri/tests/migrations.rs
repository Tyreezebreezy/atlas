use sqlx::sqlite::SqlitePoolOptions;

const MIGRATIONS: &[&str] = &[
    include_str!("../migrations/0001_init.sql"),
    include_str!("../migrations/0002_add_workout_occurrences.sql"),
    include_str!("../migrations/0003_add_training_locations.sql"),
    include_str!("../migrations/0004_add_vnext_foundations.sql"),
];

const EXPECTED_TABLES: &[&str] = &[
    "exercises",
    "programs",
    "workout_templates",
    "workout_sessions",
    "exercise_notes",
    "program_notes",
    "personal_records",
    "milestones",
    "benchmarks",
    "body_measurements",
    "workout_occurrences",
    "training_locations",
    "exercise_aliases",
    "equipment_definitions",
    "gym_equipment",
    "exercise_equipment_context",
];

#[tokio::test]
async fn migrations_create_expected_tables_and_round_trip() {
    let pool = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .expect("open in-memory sqlite");

    // Applied in order, exactly as lib.rs registers them with
    // tauri-plugin-sql -- a real upgrade runs 0001 then 0002 against a
    // fresh install, or 0002 alone against an already-v0.1.x database. The
    // v0.1.x-then-0002 path is proven separately by
    // ensureExercisesSeeded/Dexie's own upgrade test on the TypeScript
    // side (IndexedDbAdapter.test.ts); this test is the SQLite-side
    // schema-creation half.
    for migration_sql in MIGRATIONS {
        let sql_without_comments: String = migration_sql
            .lines()
            .filter(|line| !line.trim_start().starts_with("--"))
            .collect::<Vec<_>>()
            .join("\n");

        for statement in sql_without_comments.split(';') {
            let trimmed = statement.trim();
            if trimmed.is_empty() {
                continue;
            }
            sqlx::query(trimmed)
                .execute(&pool)
                .await
                .unwrap_or_else(|e| panic!("migration statement failed: {trimmed}\n{e}"));
        }
    }

    for table in EXPECTED_TABLES {
        let row: (i64,) = sqlx::query_as(&format!("SELECT COUNT(*) FROM {table}"))
            .fetch_one(&pool)
            .await
            .unwrap_or_else(|e| panic!("table {table} missing or unqueryable: {e}"));
        assert_eq!(row.0, 0);
    }

    sqlx::query("INSERT INTO exercises (id, deleted_at, data) VALUES ($1, NULL, $2)")
        .bind("test-id")
        .bind("{\"name\":\"Bench Press\"}")
        .execute(&pool)
        .await
        .expect("insert should succeed");

    let row: (String,) = sqlx::query_as("SELECT data FROM exercises WHERE id = $1")
        .bind("test-id")
        .fetch_one(&pool)
        .await
        .expect("select should succeed");

    assert_eq!(row.0, "{\"name\":\"Bench Press\"}");

    // v0.2.0: the new table from migration 0002, same JSON-blob-row shape
    // as every other table -- round-tripped the same way to prove the
    // second migration file actually works, not just that it parses.
    sqlx::query("INSERT INTO workout_occurrences (id, deleted_at, data) VALUES ($1, NULL, $2)")
        .bind("occ-1")
        .bind("{\"status\":\"moved\"}")
        .execute(&pool)
        .await
        .expect("insert should succeed");

    let row: (String,) = sqlx::query_as("SELECT data FROM workout_occurrences WHERE id = $1")
        .bind("occ-1")
        .fetch_one(&pool)
        .await
        .expect("select should succeed");

    assert_eq!(row.0, "{\"status\":\"moved\"}");

    // v1.0.0: the new table from migration 0003 (training locations), same
    // JSON-blob-row shape, round-tripped to prove the third migration works.
    sqlx::query("INSERT INTO training_locations (id, deleted_at, data) VALUES ($1, NULL, $2)")
        .bind("loc-1")
        .bind("{\"name\":\"Home Gym\"}")
        .execute(&pool)
        .await
        .expect("insert should succeed");

    let row: (String,) = sqlx::query_as("SELECT data FROM training_locations WHERE id = $1")
        .bind("loc-1")
        .fetch_one(&pool)
        .await
        .expect("select should succeed");

    assert_eq!(row.0, "{\"name\":\"Home Gym\"}");

    // vNext Handoff 01: the four new tables from migration 0004, same
    // JSON-blob-row shape, round-tripped to prove the fourth migration
    // actually works. One representative table (exercise_aliases) is
    // enough to prove the pattern; EXPECTED_TABLES above already confirms
    // all four exist and are queryable.
    sqlx::query("INSERT INTO exercise_aliases (id, deleted_at, data) VALUES ($1, NULL, $2)")
        .bind("alias-1")
        .bind("{\"display_alias\":\"DB Incline Bench\"}")
        .execute(&pool)
        .await
        .expect("insert should succeed");

    let row: (String,) = sqlx::query_as("SELECT data FROM exercise_aliases WHERE id = $1")
        .bind("alias-1")
        .fetch_one(&pool)
        .await
        .expect("select should succeed");

    assert_eq!(row.0, "{\"display_alias\":\"DB Incline Bench\"}");
}
