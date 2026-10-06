use tauri_plugin_sql::{Migration, MigrationKind};

/// Runs before any page script on every load: evicts an installed PWA service worker (which cannot update inside this shell and would
/// keep serving an old bundle forever) and stops a new one registering. See the file for the whole story.
const DESKTOP_INIT: &str = include_str!("desktop_init.js");

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
        .setup(|app| {
            // The main window is described in tauri.conf.json (`"create": false`) and built here, so that it can carry the script above.
            let config = app
                .config()
                .app
                .windows
                .first()
                .expect("tauri.conf.json defines the main window");
            tauri::WebviewWindowBuilder::from_config(app.handle(), config)?
                .initialization_script(DESKTOP_INIT)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ATLAS");
}
