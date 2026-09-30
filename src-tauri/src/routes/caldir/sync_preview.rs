use super::helpers::connection_with_slug;
use super::types::{SyncFailure, SyncPreview, SyncPreviewResult};
use crate::routes::TauResult;
use crate::state::AppState;
use caldir_core::{DateRange, EventChange};

/// A calendar that fails is reported in `failures`; the rest still preview.
pub(super) async fn handler(state: &AppState) -> TauResult<SyncPreviewResult> {
    let range = DateRange::default_sync_window();
    let mut previews = Vec::new();
    let mut failures = Vec::new();
    let connections = state.caldir().connections();

    for connection in connections {
        let (mut connection, slug) = match connection_with_slug(connection) {
            Ok(opened) => opened,
            Err(error) => {
                failures.push(SyncFailure::new(None, error));
                continue;
            }
        };

        let diff = match connection.diff(&range).await {
            Ok(diff) => diff,
            Err(error) => {
                failures.push(SyncFailure::new(Some(&slug), error));
                continue;
            }
        };

        let to_push_delete_count = diff
            .outgoing()
            .iter()
            .filter(|c| matches!(c, EventChange::Delete(_)))
            .count() as u32;

        previews.push(SyncPreview {
            calendar_slug: slug,
            to_push_count: diff.outgoing().len() as u32,
            to_push_delete_count,
            to_pull_count: diff.incoming().len() as u32,
        });
    }

    Ok(SyncPreviewResult { previews, failures })
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::routes::caldir::sync_fixture::{BROKEN_MESSAGE, SyncFixture};
    use crate::routes::error::RpcErrorKind;

    #[tokio::test]
    async fn failing_calendars_are_reported_alongside_healthy_previews() {
        let fixture =
            SyncFixture::new(&[("fastmail", "broken"), ("gone", "missing"), ("work", "ok")]);

        let SyncPreviewResult { previews, failures } = handler(&fixture.state).await.unwrap();

        let previews: Vec<_> = previews
            .iter()
            .map(|p| (p.calendar_slug.as_str(), p.to_pull_count))
            .collect();
        assert_eq!(previews, [("work", 1)]);

        let mut failures: Vec<_> = failures
            .iter()
            .map(|f| (f.calendar_slug.as_deref(), f.error.kind))
            .collect();
        failures.sort_by_key(|(slug, _)| *slug);
        assert_eq!(
            failures,
            [
                (None, RpcErrorKind::ProviderNotFound),
                (Some("fastmail"), RpcErrorKind::ProviderFailure),
            ]
        );
    }

    #[tokio::test]
    async fn failure_messages_leave_the_slug_to_the_ui() {
        let fixture = SyncFixture::new(&[("fastmail", "broken")]);

        let failures = handler(&fixture.state).await.unwrap().failures;

        assert_eq!(failures.len(), 1);
        assert!(failures[0].error.message.contains(BROKEN_MESSAGE));
        assert!(!failures[0].error.message.contains("fastmail"));
    }
}
