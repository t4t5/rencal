use super::helpers::connection_with_slug;
use super::types::SyncFailure;
use crate::routes::TauResult;
use crate::state::AppState;
use caldir_core::{DateRange, EventChange};

/// Number of pending push deletions that triggers the mass-delete safeguard.
/// Mirrors `caldir-cli`'s `guards::MASS_DELETE_THRESHOLD`.
const MASS_DELETE_THRESHOLD: u32 = 10;

/// Each calendar syncs on its own: one that fails is returned as a failure and
/// the rest still pull and push.
pub(super) async fn handler(
    state: &AppState,
    allow_mass_delete: Vec<String>,
) -> TauResult<Vec<SyncFailure>> {
    let range = DateRange::default_sync_window();
    let mut failures = Vec::new();
    // Owned snapshot: the caldir guard must not live across the awaits below.
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

        // Core flushes a partial pull to disk, so invalidate either way.
        let pulled = connection.apply_incoming_diff(&diff);
        state.invalidate_events(&slug);
        if let Err(error) = pulled {
            failures.push(SyncFailure::new(Some(&slug), error));
            continue;
        }

        if connection.read_only() {
            continue;
        }

        let push_delete_count = diff
            .outgoing()
            .iter()
            .filter(|c| matches!(c, EventChange::Delete(_)))
            .count() as u32;

        let mass_delete_blocked =
            push_delete_count >= MASS_DELETE_THRESHOLD && !allow_mass_delete.contains(&slug);

        if mass_delete_blocked {
            continue;
        }

        // A partial push has already rewritten local files.
        let pushed = connection.apply_outgoing_diff(&diff).await;
        state.invalidate_events(&slug);
        if let Err(error) = pushed {
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
    async fn healthy_calendars_pull_past_failing_ones() {
        let fixture =
            SyncFixture::new(&[("fastmail", "broken"), ("gone", "missing"), ("work", "ok")]);

        let failures = handler(&fixture.state, vec![]).await.unwrap();

        let mut failed: Vec<_> = failures
            .iter()
            .map(|f| f.calendar_slug.as_deref())
            .collect();
        failed.sort();
        assert_eq!(failed, [None, Some("fastmail")]);
        assert_eq!(fixture.event_count("work"), 1);
        assert_eq!(fixture.event_count("fastmail"), 0);
    }
}
