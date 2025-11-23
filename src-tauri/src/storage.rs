use tauri_plugin_sql::{Migration, MigrationKind};

pub fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create calendars table",
            sql: "CREATE TABLE calendars (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT,
                selected INTEGER NOT NULL DEFAULT 1
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create sessions table",
            sql: "CREATE TABLE sessions (
                access_token TEXT PRIMARY KEY,
                refresh_token TEXT,
                expires_at INTEGER NOT NULL,
                provider TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add google_calendar_id and sync columns to calendars",
            sql: "
                -- Create new table with correct structure
                CREATE TABLE calendars_new (
                    id TEXT PRIMARY KEY,
                    google_calendar_id TEXT,
                    name TEXT NOT NULL,
                    color TEXT,
                    selected INTEGER NOT NULL DEFAULT 1,
                    sync_token TEXT,
                    last_synced_at INTEGER
                );

                -- Migrate existing data: use existing id as google_calendar_id, generate new UUID as id
                INSERT INTO calendars_new (id, google_calendar_id, name, color, selected)
                SELECT
                    lower(hex(randomblob(16))),
                    id,
                    name,
                    color,
                    selected
                FROM calendars;

                -- Drop old table
                DROP TABLE calendars;

                -- Rename new table
                ALTER TABLE calendars_new RENAME TO calendars;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create events table",
            sql: "CREATE TABLE events (
                id TEXT PRIMARY KEY,
                google_event_id TEXT,
                calendar_id TEXT NOT NULL,
                summary TEXT,
                start TEXT NOT NULL,
                end TEXT NOT NULL,
                all_day INTEGER NOT NULL,
                updated_at TEXT,
                FOREIGN KEY (calendar_id) REFERENCES calendars(id)
            );

            CREATE INDEX idx_events_calendar_id ON events(calendar_id);
            CREATE INDEX idx_events_google_event_id ON events(google_event_id);
            CREATE INDEX idx_events_start ON events(start);",
            kind: MigrationKind::Up,
        },
    ]
}

#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct Calendar {
    pub id: String,
    pub google_calendar_id: Option<String>,
    pub name: String,
    pub color: Option<String>,
    pub selected: bool,
    pub sync_token: Option<String>,
    pub last_synced_at: Option<String>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct Event {
    pub id: String,
    pub google_event_id: Option<String>,
    pub calendar_id: String,
    pub summary: String,
    pub start: String,
    pub end: String,
    pub all_day: bool,
    pub updated_at: Option<String>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub enum OAuthProvider {
    Google,
}

#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct Session {
    pub access_token: String,
    pub refresh_token: Option<String>,
    #[serde(serialize_with = "serialize_i64_as_string")]
    #[serde(deserialize_with = "deserialize_i64_from_string")]
    #[specta(type = String)]
    pub expires_at: i64,
    pub provider: OAuthProvider,
    #[serde(serialize_with = "serialize_i64_as_string")]
    #[serde(deserialize_with = "deserialize_i64_from_string")]
    #[specta(type = String)]
    pub created_at: i64,
}

fn serialize_i64_as_string<S>(value: &i64, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_str(&value.to_string())
}

fn deserialize_i64_from_string<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let s: String = serde::Deserialize::deserialize(deserializer)?;
    s.parse().map_err(serde::de::Error::custom)
}
