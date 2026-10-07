use super::types::SyncPreview;
use crate::error::CoreResult;
use crate::error::{CoreError, CoreErrorKind};
use crate::state::AppState;
use caldir_core::{DateRange, EventChange};

pub async fn sync_preview(state: &AppState) -> CoreResult<Vec<SyncPreview>> {
    let range = DateRange::default_sync_window();
    let mut previews = Vec::new();
    let connections = state.caldir().connections();

    for connection in connections {
        let mut connection = connection?;
        let slug = connection
            .local()
            .slug()
            .ok_or_else(|| CoreError::new(CoreErrorKind::Internal, "calendar missing slug"))?
            .to_string();

        let diff = connection
            .diff(&range)
            .await
            .map_err(|e| CoreError::from(e).context(format!("[{slug}]")))?;

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
