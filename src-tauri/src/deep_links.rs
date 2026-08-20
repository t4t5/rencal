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

    // `url::Url` represents an explicitly empty userinfo/port the same as an
    // absent one, so also inspect the raw authority to reject those forms.
    let authority = raw
        .split_once("://")
        .map(|(_, rest)| rest.split(['/', '?', '#']).next().unwrap_or_default())
        .unwrap_or_default();

    if url.scheme() != "rencal" || url.host_str() != Some("event") {
        return Err("expected rencal://event".to_string());
    }
    if authority.contains('@') || !url.username().is_empty() || url.password().is_some() {
        return Err("credentials are not allowed".to_string());
    }
    if authority.contains(':') || url.port().is_some() {
        return Err("ports are not allowed".to_string());
    }
    if url.fragment().is_some() {
        return Err("fragments are not allowed".to_string());
    }
    if !matches!(url.path(), "" | "/") {
        return Err("paths are not allowed".to_string());
    }

    let mut uid = None;
    let mut recurrence_id = None;

    if let Some(query) = url.query() {
        for pair in query.split('&') {
            let (raw_key, raw_value) = pair.split_once('=').unwrap_or((pair, ""));
            let key = decode_query_component(raw_key)?;
            let value = decode_query_component(raw_value)?;

            match key.as_str() {
                "uid" => set_query_value(&mut uid, value, "uid")?,
                "recurrence-id" => set_query_value(&mut recurrence_id, value, "recurrence-id")?,
                _ => {}
            }
        }
    }

    let uid = uid.ok_or_else(|| "exactly one non-empty uid is required".to_string())?;
    Ok(EventDeepLink { uid, recurrence_id })
}

fn set_query_value(slot: &mut Option<String>, value: String, name: &str) -> Result<(), String> {
    if slot.is_some() {
        return Err(format!("duplicate {name} parameter"));
    }
    if value.is_empty() {
        return Err(format!("{name} must not be empty"));
    }
    *slot = Some(value);
    Ok(())
}

/// Decode one application/x-www-form-urlencoded query component, but reject
/// malformed percent escapes and invalid UTF-8 instead of replacing them.
fn decode_query_component(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        match bytes[index] {
            b'%' => {
                if index + 2 >= bytes.len() {
                    return Err("malformed percent encoding".to_string());
                }
                let high = hex_value(bytes[index + 1])
                    .ok_or_else(|| "malformed percent encoding".to_string())?;
                let low = hex_value(bytes[index + 2])
                    .ok_or_else(|| "malformed percent encoding".to_string())?;
                decoded.push((high << 4) | low);
                index += 3;
            }
            b'+' => {
                decoded.push(b' ');
                index += 1;
            }
            byte => {
                decoded.push(byte);
                index += 1;
            }
        }
    }

    String::from_utf8(decoded).map_err(|_| "query value is not valid UTF-8".to_string())
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

/// Validate and enqueue URLs. The emitted event is only a wake-up signal; the
/// inbox remains authoritative and is drained through taurpc.
pub fn enqueue_urls<R, I, S>(app: &AppHandle<R>, urls: I) -> usize
where
    R: Runtime,
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let accepted: Vec<_> = urls
        .into_iter()
        .filter_map(|raw| match parse_event_deep_link(raw.as_ref()) {
            Ok(link) => Some(link),
            Err(error) => {
                log::warn!("ignoring invalid event deep link: {error}");
                None
            }
        })
        .collect();

    let count = accepted.len();
    if count == 0 {
        return 0;
    }

    EVENT_LINK_INBOX.lock().unwrap().extend(accepted);
    let _ = app.emit(EVENT_DEEP_LINK_AVAILABLE, ());
    count
}

pub fn take_pending_event_links() -> Vec<EventDeepLink> {
    EVENT_LINK_INBOX.lock().unwrap().drain(..).collect()
}

#[cfg(test)]
fn enqueue_for_test(urls: &[&str]) {
    let accepted = urls
        .iter()
        .filter_map(|url| parse_event_deep_link(url).ok());
    EVENT_LINK_INBOX.lock().unwrap().extend(accepted);
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
    fn parses_zoned_recurrence_and_trailing_slash() {
        assert_eq!(
            parse_event_deep_link(
                "rencal://event/?future=ok&uid=a%2Fb&recurrence-id=TZID%3DEurope%2FLondon%3A20260826T090000"
            )
            .unwrap(),
            EventDeepLink {
                uid: "a/b".into(),
                recurrence_id: Some("TZID=Europe/London:20260826T090000".into()),
            }
        );
    }

    #[test]
    fn rejects_wrong_location_and_url_features() {
        for url in [
            "other://event?uid=a",
            "rencal://other?uid=a",
            "rencal://event/path?uid=a",
            "rencal://event//?uid=a",
            "rencal://user@event?uid=a",
            "rencal://@event?uid=a",
            "rencal://event:42?uid=a",
            "rencal://event:?uid=a",
            "rencal://event?uid=a#fragment",
        ] {
            assert!(parse_event_deep_link(url).is_err(), "accepted {url}");
        }
    }

    #[test]
    fn rejects_missing_empty_duplicate_and_malformed_parameters() {
        for url in [
            "rencal://event",
            "rencal://event?uid=",
            "rencal://event?uid=a&uid=b",
            "rencal://event?uid=a&recurrence-id=",
            "rencal://event?uid=a&recurrence-id=x&recurrence-id=y",
            "rencal://event?uid=%",
            "rencal://event?uid=%GG",
            "rencal://event?uid=%FF",
            "rencal://event?uid=a&future=%GG",
        ] {
            assert!(parse_event_deep_link(url).is_err(), "accepted {url}");
        }
    }

    #[test]
    fn inbox_is_fifo_and_drain_is_atomic() {
        let _guard = inbox_test_lock();
        enqueue_for_test(&[
            "rencal://event?uid=first",
            "rencal://event?uid=bad&uid=duplicate",
            "rencal://event?uid=second",
        ]);

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
