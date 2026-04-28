/// This file is auto-generated. Do not edit directly.
use tauri_plugin_sql::{Migration, MigrationKind};

pub fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "init",
            sql: include_str!("migrations/0000_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "update active to is visible",
            sql: include_str!("migrations/0001_update_active_to_is_visible.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add event details",
            sql: include_str!("migrations/0002_add_event_details.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add recurrence",
            sql: include_str!("migrations/0003_add_recurrence.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add recurring event id",
            sql: include_str!("migrations/0004_add_recurring_event_id.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add original start",
            sql: include_str!("migrations/0005_add_original_start.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "drop old tables",
            sql: include_str!("migrations/0006_drop_old_tables.sql"),
            kind: MigrationKind::Up,
        },
    ]
}
