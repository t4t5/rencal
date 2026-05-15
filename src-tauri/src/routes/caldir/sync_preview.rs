use super::types::SyncPreview;
use crate::routes::TauResult;
use caldir_core::{Caldir, DateRange, EventChange};

pub(super) async fn handler(calendar_slugs: Vec<String>) -> TauResult<Vec<SyncPreview>> {
    let caldir = Caldir::load().map_err(|e| e.to_string())?;
    let range = DateRange::default();
    let mut previews = Vec::with_capacity(calendar_slugs.len());

    for slug in &calendar_slugs {
        let calendar = caldir
            .calendar(slug)
            .map_err(|e| format!("[{}] {}", slug, e))?;

        // Local-only calendars have nothing to sync; report a zero-diff preview.
        if calendar.remote_config().is_none() {
            previews.push(SyncPreview {
                calendar_slug: slug.clone(),
                to_push_count: 0,
                to_push_delete_count: 0,
                to_pull_count: 0,
            });
            continue;
        }

        let connection = caldir
            .connection(slug)
            .map_err(|e| format!("[{}] {}", slug, e))?;
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
            calendar_slug: slug.clone(),
            to_push_count: diff.outgoing().len() as u32,
            to_push_delete_count,
            to_pull_count: diff.incoming().len() as u32,
        });
    }

    Ok(previews)
}
