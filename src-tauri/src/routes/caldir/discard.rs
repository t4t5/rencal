use crate::event_cache::EVENT_CACHE;
use crate::routes::TauResult;
use caldir_core::{Caldir, DateRange};

pub(super) async fn handler() -> TauResult<()> {
    let caldir = Caldir::load().map_err(|e| e.to_string())?;
    let range = DateRange::default();

    for connection in caldir.connections() {
        let connection = connection.map_err(|e| e.to_string())?;
        let slug = connection
            .local()
            .slug()
            .ok_or_else(|| "calendar missing slug".to_string())?
            .to_string();

        let diff = connection
            .diff(&range)
            .await
            .map_err(|e| format!("[{}] {}", slug, e))?;

        connection
            .discard_outgoing_diff(&diff)
            .map_err(|e| format!("[{}] {}", slug, e))?;
        EVENT_CACHE.invalidate(&slug);
    }

    Ok(())
}
