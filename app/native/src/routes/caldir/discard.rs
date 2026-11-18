use super::helpers::for_each_connection;
use super::types::SyncFailure;
use crate::routes::RpcResult;
use crate::state::AppState;
use caldir_core::DateRange;

/// A calendar that fails is returned as a failure; the rest still discard.
pub(super) async fn handler(state: &AppState) -> RpcResult<Vec<SyncFailure>> {
    let range = DateRange::default_sync_window();
    let range = &range;

    let results = for_each_connection(state, |mut connection, slug| async move {
        let failed = |error| SyncFailure::new(Some(&slug), error);

        let diff = connection.diff(range).await.map_err(failed)?;

        // A partial discard has already rewritten local files.
        let discarded = connection.discard_outgoing_diff(&diff);
        state.invalidate_events(&slug);
        discarded.map_err(failed)
    })
    .await;

    Ok(results.into_iter().filter_map(Result::err).collect())
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
