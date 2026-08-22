use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::VecDeque;
use std::sync::{LazyLock, Mutex};
use tauri::{AppHandle, Emitter, Runtime};
use url::Url;

pub const EVENT_DEEP_LINK_AVAILABLE: &str = "event-deep-link-available";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct EventDeepLink {
    pub uid: String,
    pub recurrence_id: Option<String>,
}

static EVENT_LINK_INBOX: LazyLock<Mutex<VecDeque<EventDeepLink>>> =
    LazyLock::new(|| Mutex::new(VecDeque::new()));

pub fn parse_event_deep_link(raw: &str) -> Result<EventDeepLink, String> {
    let url = Url::parse(raw).map_err(|_| "invalid URL".to_string())?;

    if url.scheme() != "rencal" || url.host_str() != Some("event") {
        return Err("expected rencal://event".to_string());
    }

    let query_value = |name: &str| {
        url.query_pairs()
            .find_map(|(key, value)| (key == name).then(|| value.into_owned()))
    };
    let uid = query_value("uid")
        .filter(|uid| !uid.is_empty())
        .ok_or_else(|| "a non-empty uid is required".to_string())?;

    Ok(EventDeepLink {
        uid,
        recurrence_id: query_value("recurrence-id"),
    })
}

/// Validate and enqueue URLs, waking the frontend when any were accepted. The
/// emitted event is only a wake-up signal; the inbox remains authoritative and
/// is drained through taurpc.
pub fn enqueue_urls<R: Runtime>(app: &AppHandle<R>, urls: &[String]) -> usize {
    let count = enqueue(urls);
    if count > 0 {
        let _ = app.emit(EVENT_DEEP_LINK_AVAILABLE, ());
    }
    count
}

fn enqueue(urls: &[String]) -> usize {
    let accepted: Vec<_> = urls
        .iter()
        .filter_map(|raw| match parse_event_deep_link(raw) {
            Ok(link) => Some(link),
            Err(error) => {
                log::warn!("ignoring invalid event deep link: {error}");
                None
            }
        })
        .collect();

    let count = accepted.len();
    EVENT_LINK_INBOX.lock().unwrap().extend(accepted);
    count
}

pub fn take_pending_event_links() -> Vec<EventDeepLink> {
    EVENT_LINK_INBOX.lock().unwrap().drain(..).collect()
}

/// See: https://github.com/tauri-apps/plugins-workspace/pull/3374
#[cfg(all(debug_assertions, target_os = "linux"))]
pub fn unquote_registered_desktop_exec(app: &tauri::App) {
    use tauri::Manager;

    let Ok(exe) = tauri::utils::platform::current_exe() else {
        return;
    };
    let Some(file_name) = exe.file_name() else {
        return;
    };
    let Ok(data_dir) = app.path().data_dir() else {
        return;
    };
    let path = data_dir
        .join("applications")
        .join(format!("{}-handler.desktop", file_name.to_string_lossy()));
    let Ok(contents) = std::fs::read_to_string(&path) else {
        return;
    };
    if let Some(fixed) = unquote_desktop_exec(&contents, &exe.to_string_lossy())
        && let Err(error) = std::fs::write(&path, fixed)
    {
        log::warn!("failed to unquote Exec in {}: {error}", path.display());
    }
}

/// Returns the contents with `Exec="<exe>"` rewritten to `Exec=<exe>`, or
/// None when nothing needs (or is safe) to change. Paths containing spaces or
/// quotes keep the plugin's quoting, since dropping it would break the entry
/// for spec-compliant launchers instead.
#[cfg(all(debug_assertions, target_os = "linux"))]
fn unquote_desktop_exec(contents: &str, exe: &str) -> Option<String> {
    if exe.contains(' ') || exe.contains('"') {
        return None;
    }
    let quoted = format!("Exec=\"{exe}\"");
    contents
        .contains(&quoted)
        .then(|| contents.replace(&quoted, &format!("Exec={exe}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::MutexGuard;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn inbox_test_lock() -> MutexGuard<'static, ()> {
        let guard = TEST_LOCK.lock().unwrap();
        take_pending_event_links();
        guard
    }

    #[test]
    fn parses_uid_only_and_recurrence_links() {
        assert_eq!(
            parse_event_deep_link("rencal://event?uid=one").unwrap(),
            EventDeepLink {
                uid: "one".into(),
                recurrence_id: None,
            }
        );
        assert_eq!(
            parse_event_deep_link(
                "rencal://event?uid=team-sync%40example.com&recurrence-id=20260826T090000Z"
            )
            .unwrap(),
            EventDeepLink {
                uid: "team-sync@example.com".into(),
                recurrence_id: Some("20260826T090000Z".into()),
            }
        );
    }

    #[test]
    fn decodes_form_query_values() {
        assert_eq!(
            parse_event_deep_link(
                "rencal://event?future=ok&uid=a%2Fb+c&recurrence-id=TZID%3DEurope%2FLondon%3A20260826T090000"
            )
            .unwrap(),
            EventDeepLink {
                uid: "a/b c".into(),
                recurrence_id: Some("TZID=Europe/London:20260826T090000".into()),
            }
        );
    }

    #[test]
    fn rejects_wrong_scheme_host_and_missing_uid() {
        for url in [
            "other://event?uid=a",
            "rencal://other?uid=a",
            "rencal://event",
            "rencal://event?uid=",
        ] {
            assert!(parse_event_deep_link(url).is_err(), "accepted {url}");
        }
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn unquotes_exec_line_written_by_deep_link_plugin() {
        let contents = "[Desktop Entry]\nType=Application\nExec=\"/home/me/rencal\" %u\nMimeType=x-scheme-handler/rencal\n";
        assert_eq!(
            unquote_desktop_exec(contents, "/home/me/rencal").unwrap(),
            "[Desktop Entry]\nType=Application\nExec=/home/me/rencal %u\nMimeType=x-scheme-handler/rencal\n"
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn leaves_unquoted_or_unsafe_exec_lines_alone() {
        assert!(unquote_desktop_exec("Exec=/home/me/rencal %u\n", "/home/me/rencal").is_none());
        assert!(
            unquote_desktop_exec(
                "Exec=\"/path with space/rencal\" %u\n",
                "/path with space/rencal"
            )
            .is_none()
        );
    }

    #[test]
    fn inbox_is_fifo_and_drain_is_atomic() {
        let _guard = inbox_test_lock();
        let accepted = enqueue(&[
            "rencal://event?uid=first".into(),
            "not-a-url".into(),
            "rencal://event?uid=second".into(),
        ]);
        assert_eq!(accepted, 2);

        let drained = take_pending_event_links();
        assert_eq!(
            drained
                .iter()
                .map(|link| link.uid.as_str())
                .collect::<Vec<_>>(),
            vec!["first", "second"]
        );
        assert!(take_pending_event_links().is_empty());
    }
}
