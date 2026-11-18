use super::helpers::for_each_connection;
use super::types::SyncFailure;
use crate::routes::RpcResult;
use crate::state::AppState;
use caldir_core::{Connection, DateRange, EventChange};

/// Number of pending push deletions that triggers the mass-delete safeguard.
/// Mirrors `caldir-cli`'s `guards::MASS_DELETE_THRESHOLD`.
const MASS_DELETE_THRESHOLD: u32 = 10;

/// Each calendar syncs on its own: one that fails is returned as a failure and
/// the rest still pull and push.
pub(super) async fn handler(
    state: &AppState,
    allow_mass_delete: Vec<String>,
) -> RpcResult<Vec<SyncFailure>> {
    let range = DateRange::default_sync_window();

    let results = for_each_connection(state, |connection, slug| {
        sync_calendar(state, connection, slug, &range, &allow_mass_delete)
    })
    .await;

    Ok(results.into_iter().filter_map(Result::err).collect())
}

async fn sync_calendar(
    state: &AppState,
    mut connection: Connection,
    slug: String,
    range: &DateRange,
    allow_mass_delete: &[String],
) -> Result<(), SyncFailure> {
    let failed = |error| SyncFailure::new(Some(&slug), error);

    let diff = connection.diff(range).await.map_err(failed)?;

    // Core flushes a partial pull to disk, so invalidate either way.
    let pulled = connection.apply_incoming_diff(&diff);
    state.invalidate_events(&slug);
    pulled.map_err(failed)?;

    if connection.read_only() {
        return Ok(());
    }

    let push_delete_count = diff
        .outgoing()
        .iter()
        .filter(|c| matches!(c, EventChange::Delete(_)))
        .count() as u32;

    let mass_delete_blocked =
        push_delete_count >= MASS_DELETE_THRESHOLD && !allow_mass_delete.contains(&slug);

    if mass_delete_blocked {
        return Ok(());
    }

    // A partial push has already rewritten local files.
    let pushed = connection.apply_outgoing_diff(&diff).await;
    state.invalidate_events(&slug);
    pushed.map_err(failed)
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

    #[tokio::test]
    async fn calendars_sync_alongside_each_other() {
        let fixture = SyncFixture::new(&[("home", "overlap"), ("work", "overlap")]);

        let failures = handler(&fixture.state, vec![]).await.unwrap();

        assert!(failures.is_empty(), "{failures:?}");
        assert_eq!(fixture.event_count("home"), 1);
        assert_eq!(fixture.event_count("work"), 1);
    }
}
