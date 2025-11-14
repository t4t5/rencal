use tauri_plugin_sql::{Migration, MigrationKind};

pub fn get_migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create calendars table",
        sql: "CREATE TABLE calendars (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT,
            selected INTEGER NOT NULL DEFAULT 1
        );",
        kind: MigrationKind::Up,
    }]
}

#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct Calendar {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub selected: bool,
}
