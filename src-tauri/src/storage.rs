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
            description: "create oauth_tokens table",
            sql: "CREATE TABLE oauth_tokens (
                access_token TEXT PRIMARY KEY,
                refresh_token TEXT,
                expires_at INTEGER NOT NULL,
                provider TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );",
            kind: MigrationKind::Up,
        },
    ]
}

#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct Calendar {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub selected: bool,
}

#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub enum OAuthProvider {
    Google,
}

#[derive(Clone, serde::Serialize, serde::Deserialize, specta::Type)]
pub struct OAuthToken {
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
