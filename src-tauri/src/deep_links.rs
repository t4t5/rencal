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
