use sqlx::sqlite::SqlitePoolOptions;

const MIGRATION_SQL: &str = include_str!("../migrations/0001_init.sql");

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
];

#[tokio::test]
async fn migrations_create_expected_tables_and_round_trip() {
    let pool = SqlitePoolOptions::new()
        .connect("sqlite::memory:")
        .await
        .expect("open in-memory sqlite");

    let sql_without_comments: String = MIGRATION_SQL
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
}
