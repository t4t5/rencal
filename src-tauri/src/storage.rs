use tauri_plugin_sql::{Migration, MigrationKind};

pub fn get_migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "initialize database schema",
        sql: "
                CREATE TABLE accounts (
                    id TEXT PRIMARY KEY,
                    provider TEXT NOT NULL,
                    email TEXT,
                    access_token TEXT,
                    refresh_token TEXT,
                    expires_at INTEGER,
                    created_at INTEGER NOT NULL
                );

                CREATE TABLE calendars (
                    id TEXT PRIMARY KEY,
                    account_id TEXT NOT NULL,
                    provider_calendar_id TEXT,
                    name TEXT NOT NULL,
                    color TEXT,
                    selected INTEGER NOT NULL DEFAULT 1,
                    sync_token TEXT,
                    last_synced_at INTEGER,
                    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
                    UNIQUE(account_id, provider_calendar_id)
                );

                CREATE TABLE events (
                    id TEXT PRIMARY KEY,
                    provider_event_id TEXT,
                    calendar_id TEXT NOT NULL,
                    summary TEXT,
                    start TEXT NOT NULL,
                    end TEXT NOT NULL,
                    all_day INTEGER NOT NULL,
                    updated_at TEXT,
                    FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE
                );

                CREATE INDEX idx_calendars_account_id ON calendars(account_id);
                CREATE INDEX idx_events_calendar_id ON events(calendar_id);
                CREATE INDEX idx_events_provider_event_id ON events(provider_event_id);
                CREATE INDEX idx_events_start ON events(start);
            ",
        kind: MigrationKind::Up,
    }]
}

#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub enum Provider {
    Google,
    // Future: ICloud, CalDAV
}

#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct Account {
    pub id: String,
    pub provider: Provider,
    pub email: Option<String>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    #[serde(serialize_with = "serialize_option_i64_as_string")]
    #[serde(deserialize_with = "deserialize_option_i64_from_string")]
    #[specta(type = Option<String>)]
    pub expires_at: Option<i64>,
    #[serde(serialize_with = "serialize_i64_as_string")]
    #[serde(deserialize_with = "deserialize_i64_from_string")]
    #[specta(type = String)]
    pub created_at: i64,
}

#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct Calendar {
    pub id: String,
    pub account_id: String,
    pub provider_calendar_id: Option<String>,
    pub name: String,
    pub color: Option<String>,
    pub selected: bool,
    pub sync_token: Option<String>,
    pub last_synced_at: Option<String>,
}

#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct Event {
    pub id: String,
    pub provider_event_id: Option<String>,
    pub calendar_id: String,
    pub summary: String,
    pub start: String,
    pub end: String,
    pub all_day: bool,
    pub updated_at: Option<String>,
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

fn serialize_option_i64_as_string<S>(value: &Option<i64>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    match value {
        Some(v) => serializer.serialize_some(&v.to_string()),
        None => serializer.serialize_none(),
    }
}

fn deserialize_option_i64_from_string<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let opt: Option<String> = serde::Deserialize::deserialize(deserializer)?;
    match opt {
        Some(s) => s.parse().map(Some).map_err(serde::de::Error::custom),
        None => Ok(None),
    }
}
