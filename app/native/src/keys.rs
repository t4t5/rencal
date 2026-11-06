//! User key bindings from `~/.config/rencal/keys.toml`. Each entry maps a key
//! to a command action (`l = "date.next:day"`) or to `false`, which unbinds
//! the key's default. The frontend owns the defaults and the command list, so
//! it merges these over its defaults and validates the actions. Settings edits
//! the file through [`edit`], keeping the rest of it as written.

use std::path::Path;

use rencal_config::RencalConfig;
use serde::{Deserialize, Serialize};
use specta::Type;
use toml_edit::{Document, Item, Table, Value};

pub const KEYS_FILE: &str = "keys.toml";

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize, Type)]
pub struct KeyBinding {
    pub keys: String,
    /// `None` unbinds the key.
    pub action: Option<String>,
}

/// `error` describes a file that couldn't be read; its bindings are then
/// empty, and the frontend keeps the last good ones.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize, Type)]
pub struct KeysSnapshot {
    pub bindings: Vec<KeyBinding>,
    pub error: Option<String>,
}

/// A change to one key's entry.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize, Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum KeyEdit {
    /// `keys = "action"`
    Bind { keys: String, action: String },
    /// `keys = false`
    Unbind { keys: String },
    /// Removes the entry, so the key's default applies again.
    Clear { keys: String },
}

const NEW_FILE: &str =
    "# renCal key bindings: https://rencal.org/docs/keyboard-shortcuts/#change-keys\n\n[keys]\n";

/// Bindings in file order, so user-added keys list in the order written.
fn parse(source: &str) -> Result<Vec<KeyBinding>, String> {
    let document: Document = source.parse().map_err(|error| format!("{error}"))?;
    let mut bindings = Vec::new();
    for (name, item) in document.iter() {
        if name != "keys" {
            return Err(format!(
                "unknown section `{name}`; bindings go under [keys]"
            ));
        }
        let Some(table) = item.as_table_like() else {
            return Err("`keys` must be a table".into());
        };
        for (keys, item) in table.iter() {
            let action = match item {
                Item::Value(Value::String(action)) => Some(action.value().clone()),
                Item::Value(Value::Boolean(flag)) if !*flag.value() => None,
                _ => {
                    return Err(format!(
                        "`{keys}` must be a command (\"date.next:day\") or false to unbind it"
                    ));
                }
            };
            bindings.push(KeyBinding {
                keys: keys.to_string(),
                action,
            });
        }
    }
    Ok(bindings)
}

/// `source` with `edits` applied. Comments and other entries stay as written;
/// a file that doesn't parse is an error rather than being replaced.
fn apply_edits(source: &str, edits: &[KeyEdit]) -> Result<String, String> {
    parse(source)?;
    let source = if source.trim().is_empty() {
        NEW_FILE
    } else {
        source
    };
    let mut document: Document = source.parse().map_err(|error| format!("{error}"))?;
    if !document.contains_key("keys") {
        document.insert("keys", Item::Table(Table::new()));
    }
    let table = document["keys"]
        .as_table_like_mut()
        .ok_or("`keys` must be a table")?;
    for edit in edits {
        match edit {
            KeyEdit::Bind { keys, action } => {
                table.insert(keys, toml_edit::value(action.as_str()));
            }
            KeyEdit::Unbind { keys } => {
                table.insert(keys, toml_edit::value(false));
            }
            KeyEdit::Clear { keys } => {
                table.remove(keys);
            }
        }
    }
    Ok(document.to_string())
}

fn edit_at(path: &Path, edits: &[KeyEdit]) -> Result<KeysSnapshot, String> {
    let source = match std::fs::read_to_string(path) {
        Ok(source) => source,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(format!("{KEYS_FILE}: {error}")),
    };
    let updated = apply_edits(&source, edits).map_err(|error| {
        format!("{KEYS_FILE} has an error, so it wasn't changed; fix it first. {error}")
    })?;
    crate::atomic_write::write_atomic(path, updated.as_bytes(), KEYS_FILE, true, 0o644)?;
    Ok(load_from(path))
}

/// Applies `edits` to keys.toml (creating it if needed) and returns the
/// bindings it now holds. The keys watcher also reports the change.
pub fn edit(edits: &[KeyEdit]) -> Result<KeysSnapshot, String> {
    let dir = RencalConfig::config_dir().map_err(|error| error.to_string())?;
    edit_at(&dir.join(KEYS_FILE), edits)
}

fn load_from(path: &Path) -> KeysSnapshot {
    let source = match std::fs::read_to_string(path) {
        Ok(source) => source,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return KeysSnapshot::default();
        }
        Err(error) => {
            return KeysSnapshot {
                bindings: Vec::new(),
                error: Some(format!("{KEYS_FILE}: {error}")),
            };
        }
    };
    match parse(&source) {
        Ok(bindings) => KeysSnapshot {
            bindings,
            error: None,
        },
        Err(error) => KeysSnapshot {
            bindings: Vec::new(),
            error: Some(format!("{KEYS_FILE}: {error}")),
        },
    }
}

pub fn load() -> KeysSnapshot {
    match RencalConfig::config_dir() {
        Ok(dir) => load_from(&dir.join(KEYS_FILE)),
        Err(error) => KeysSnapshot {
            bindings: Vec::new(),
            error: Some(format!("{KEYS_FILE}: {error}")),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn binding(keys: &str, action: Option<&str>) -> KeyBinding {
        KeyBinding {
            keys: keys.into(),
            action: action.map(Into::into),
        }
    }

    #[test]
    fn reads_actions_and_unbinds_in_file_order() {
        let bindings = parse(
            r#"
[keys]
w = "view.switch:week"
"ctrl+b" = false
l = "date.next:day"
"#,
        )
        .unwrap();
        assert_eq!(
            bindings,
            vec![
                binding("w", Some("view.switch:week")),
                binding("ctrl+b", None),
                binding("l", Some("date.next:day")),
            ]
        );
    }

    #[test]
    fn an_empty_file_has_no_bindings() {
        assert_eq!(parse("").unwrap(), vec![]);
    }

    #[test]
    fn rejects_values_that_are_not_actions() {
        assert!(parse("[keys]\nw = true").is_err());
        assert!(parse("[keys]\nw = 1").is_err());
        assert!(parse("[keys]\nw = { a = 1 }").is_err());
    }

    #[test]
    fn rejects_bindings_outside_the_keys_table() {
        assert!(parse("w = \"view.switch:week\"").is_err());
        assert!(parse("[shortcuts]\nw = \"view.switch:week\"").is_err());
    }

    #[test]
    fn reports_syntax_errors_with_the_file_name() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(KEYS_FILE);
        std::fs::write(&path, "[keys\n").unwrap();
        let snapshot = load_from(&path);
        assert!(snapshot.bindings.is_empty());
        assert!(snapshot.error.unwrap().starts_with("keys.toml: "));
    }

    #[test]
    fn edits_keep_comments_and_other_entries() {
        let source = "# mine\n[keys]\nw = \"date.today\" # today\nx = false\n";
        let updated = apply_edits(
            source,
            &[
                KeyEdit::Bind {
                    keys: "ctrl+n".into(),
                    action: "event.new".into(),
                },
                KeyEdit::Unbind { keys: "t".into() },
                KeyEdit::Clear { keys: "x".into() },
            ],
        )
        .unwrap();
        assert!(updated.starts_with("# mine\n[keys]\nw = \"date.today\" # today\n"));
        assert_eq!(
            parse(&updated).unwrap(),
            vec![
                binding("w", Some("date.today")),
                binding("ctrl+n", Some("event.new")),
                binding("t", None),
            ]
        );
    }

    #[test]
    fn a_new_file_gets_a_header_and_a_keys_table() {
        let updated = apply_edits(
            "",
            &[KeyEdit::Bind {
                keys: "w".into(),
                action: "date.today".into(),
            }],
        )
        .unwrap();
        assert!(updated.starts_with("# renCal key bindings"));
        assert_eq!(
            parse(&updated).unwrap(),
            vec![binding("w", Some("date.today"))]
        );
    }

    #[test]
    fn a_broken_file_is_left_alone() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(KEYS_FILE);
        std::fs::write(&path, "[keys\n").unwrap();
        let error = edit_at(&path, &[KeyEdit::Unbind { keys: "w".into() }]).unwrap_err();
        assert!(error.contains("fix it first"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "[keys\n");
    }

    #[test]
    fn editing_creates_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(KEYS_FILE);
        let snapshot = edit_at(&path, &[KeyEdit::Unbind { keys: "w".into() }]).unwrap();
        assert_eq!(snapshot.bindings, vec![binding("w", None)]);
    }

    #[test]
    fn a_missing_file_is_not_an_error() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            load_from(&dir.path().join(KEYS_FILE)),
            KeysSnapshot::default()
        );
    }
}
