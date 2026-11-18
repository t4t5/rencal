use super::helpers::connection_with_slug;
use super::types::SyncFailure;
use crate::routes::TauResult;
use crate::state::AppState;
use caldir_core::DateRange;

/// A calendar that fails is returned as a failure; the rest still discard.
pub(super) async fn handler(state: &AppState) -> TauResult<Vec<SyncFailure>> {
    let range = DateRange::default_sync_window();
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

        // A partial discard has already rewritten local files.
        let discarded = connection.discard_outgoing_diff(&diff);
        state.invalidate_events(&slug);
        if let Err(error) = discarded {
            failures.push(SyncFailure::new(Some(&slug), error));
        }
    }

    Ok(failures)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::routes::caldir::sync_fixture::SyncFixture;

    #[tokio::test]
    async fn failing_calendars_are_returned_instead_of_aborting() {
        let fixture = SyncFixture::new(&[("fastmail", "broken"), ("work", "ok")]);

        let failures = handler(&fixture.state).await.unwrap();

        let failed: Vec<_> = failures
            .iter()
            .map(|f| f.calendar_slug.as_deref())
            .collect();
        assert_eq!(failed, [Some("fastmail")]);
    }
}
