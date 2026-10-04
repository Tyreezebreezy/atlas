use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "init",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_workout_occurrences",
            sql: include_str!("../migrations/0002_add_workout_occurrences.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_training_locations",
            sql: include_str!("../migrations/0003_add_training_locations.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_vnext_foundations",
            sql: include_str!("../migrations/0004_add_vnext_foundations.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_test_protocols",
            sql: include_str!("../migrations/0005_add_test_protocols.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_personal_record_events",
            sql: include_str!("../migrations/0006_add_personal_record_events.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:atlas.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running ATLAS");
}
