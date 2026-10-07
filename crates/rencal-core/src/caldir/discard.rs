use crate::error::CoreResult;
use crate::error::{CoreError, CoreErrorKind};
use crate::state::AppState;
use caldir_core::DateRange;

pub async fn discard(state: &AppState) -> CoreResult<()> {
    let range = DateRange::default_sync_window();
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

        connection
            .discard_outgoing_diff(&diff)
            .map_err(|e| CoreError::from(e).context(format!("[{slug}]")))?;
        state.invalidate_events(&slug);
    }

    Ok(())
}
