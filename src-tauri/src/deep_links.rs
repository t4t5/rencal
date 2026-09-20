use crate::events::AppEvent;
use crate::plugins::normalize_repository;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::VecDeque;
use tauri::{AppHandle, Runtime};
use url::Url;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct EventDeepLink {
    pub uid: String,
    pub recurrence_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct PluginInstallLink {
    pub repo: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DeepLink {
    Event(EventDeepLink),
    PluginInstall(PluginInstallLink),
}

#[derive(Default)]
struct DeepLinkInboxState {
    events: VecDeque<EventDeepLink>,
    plugin_install: Option<PluginInstallLink>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct AcceptedDeepLinks {
    pub events: usize,
    pub plugin_installs: usize,
}

impl AcceptedDeepLinks {
    fn total(self) -> usize {
        self.events + self.plugin_installs
    }
}

/// Deep links received before the frontend was ready to handle them. Lives in
/// `AppState`; drained through taurpc.
#[derive(Default)]
pub struct DeepLinkInbox {
    state: Mutex<DeepLinkInboxState>,
}

impl DeepLinkInbox {
    /// Validates and stores `urls`, returning how many of each kind were accepted.
    pub fn enqueue(&self, urls: &[String]) -> AcceptedDeepLinks {
        let mut accepted = AcceptedDeepLinks::default();
        let mut state = self.state.lock();
        for raw in urls {
            match parse_deep_link(raw) {
                Ok(DeepLink::Event(link)) => {
                    state.events.push_back(link);
                    accepted.events += 1;
                }
                Ok(DeepLink::PluginInstall(link)) => {
                    state.plugin_install = Some(link);
                    accepted.plugin_installs += 1;
                }
                Err(error) => {
                    log::warn!("ignoring invalid deep link: {error}");
                }
            }
        }
        accepted
    }

    pub fn take(&self) -> Vec<EventDeepLink> {
        self.state.lock().events.drain(..).collect()
    }

    pub fn take_plugin_install(&self) -> Option<PluginInstallLink> {
        self.state.lock().plugin_install.take()
    }

    pub fn has_plugin_install(&self) -> bool {
        self.state.lock().plugin_install.is_some()
    }
}

pub fn parse_deep_link(raw: &str) -> Result<DeepLink, String> {
    let url = Url::parse(raw).map_err(|_| "invalid URL".to_string())?;
    if url.scheme() != "rencal" {
        return Err("expected rencal:// URL".to_string());
    }

    match (url.host_str(), url.path()) {
        (Some("event"), _) => parse_event_deep_link(raw).map(DeepLink::Event),
        (Some("plugin"), "/install") => {
            let repo = url
                .query_pairs()
                .find_map(|(key, value)| (key == "repo").then(|| value.into_owned()))
                .filter(|repo| !repo.is_empty())
                .ok_or_else(|| "a non-empty repo is required".to_string())?;
            let repo = normalize_repository(&repo).map_err(|error| error.to_string())?;
            Ok(DeepLink::PluginInstall(PluginInstallLink { repo }))
        }
        _ => Err("unsupported rencal deep link".to_string()),
    }
}

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
pub fn enqueue_urls<R: Runtime>(
    app: &AppHandle<R>,
    inbox: &DeepLinkInbox,
    urls: &[String],
) -> usize {
    let accepted = inbox.enqueue(urls);
    if accepted.events > 0 {
        let _ = AppEvent::EventDeepLinkAvailable(()).emit(app);
    }
    if accepted.plugin_installs > 0 {
        let _ = AppEvent::PluginDeepLinkAvailable(()).emit(app);
    }
    accepted.total()
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let inbox = DeepLinkInbox::default();
        let accepted = inbox.enqueue(&[
            "rencal://event?uid=first".into(),
            "not-a-url".into(),
            "rencal://event?uid=second".into(),
        ]);
        assert_eq!(
            accepted,
            AcceptedDeepLinks {
                events: 2,
                plugin_installs: 0,
            }
        );

        let drained = inbox.take();
        assert_eq!(
            drained
                .iter()
                .map(|link| link.uid.as_str())
                .collect::<Vec<_>>(),
            vec!["first", "second"]
        );
        assert!(inbox.take().is_empty());
    }

    #[test]
    fn parses_and_normalises_plugin_install_links() {
        for (url, repo) in [
            (
                "rencal://plugin/install?repo=alice/rencal-dusk",
                "alice/rencal-dusk",
            ),
            (
                "rencal://plugin/install?repo=alice%2Frencal-dusk",
                "alice/rencal-dusk",
            ),
            (
                "rencal://plugin/install?repo=https%3A%2F%2Fgithub.com%2Falice%2Frencal-dusk",
                "alice/rencal-dusk",
            ),
        ] {
            assert_eq!(
                parse_deep_link(url).unwrap(),
                DeepLink::PluginInstall(PluginInstallLink { repo: repo.into() })
            );
        }
    }

    #[test]
    fn rejects_invalid_plugin_install_links() {
        for url in [
            "rencal://plugin/install",
            "rencal://plugin/install?repo=",
            "rencal://plugin/uninstall?repo=alice%2Frencal-dusk",
            "rencal://plugin",
            "rencal://plugins/install?repo=alice%2Frencal-dusk",
            "rencal://plugin/install?repo=a%2Fb%2Fc",
            "rencal://plugin/install?repo=..%2Fx",
        ] {
            assert!(parse_deep_link(url).is_err(), "accepted {url}");
        }
    }

    #[test]
    fn inbox_keeps_only_the_latest_plugin_install() {
        let inbox = DeepLinkInbox::default();
        let accepted = inbox.enqueue(&[
            "rencal://plugin/install?repo=alice%2Ffirst".into(),
            "rencal://plugin/install?repo=bob%2Fsecond".into(),
        ]);
        assert_eq!(accepted.plugin_installs, 2);
        assert!(inbox.has_plugin_install());
        assert_eq!(
            inbox.take_plugin_install(),
            Some(PluginInstallLink {
                repo: "bob/second".into(),
            })
        );
        assert_eq!(inbox.take_plugin_install(), None);
        assert!(!inbox.has_plugin_install());
    }
}
