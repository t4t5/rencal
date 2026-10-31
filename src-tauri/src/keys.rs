//! User key bindings from `~/.config/rencal/keys.toml`. Each entry maps a key
//! to a command action (`l = "date.next:day"`) or to `false`, which unbinds
//! the key's default. The frontend owns the defaults and the command list, so
//! it merges these over its defaults and validates the actions.

use std::path::Path;

use rencal_config::RencalConfig;
use serde::{Deserialize, Serialize};
use specta::Type;
use toml_edit::{Document, Item, Value};

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
    fn a_missing_file_is_not_an_error() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            load_from(&dir.path().join(KEYS_FILE)),
            KeysSnapshot::default()
        );
    }
}
