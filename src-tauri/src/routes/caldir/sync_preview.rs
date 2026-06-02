use super::types::SyncPreview;
use crate::routes::TauResult;
use caldir_core::{Caldir, DateRange, EventChange};

pub(super) async fn handler() -> TauResult<Vec<SyncPreview>> {
    let caldir = Caldir::load().map_err(|e| e.to_string())?;
    let range = DateRange::default_sync_window();
    let mut previews = Vec::new();

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

    Ok(previews)
}
