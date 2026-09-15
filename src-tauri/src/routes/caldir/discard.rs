use crate::routes::TauResult;
use crate::state::AppState;
use caldir_core::DateRange;

pub(super) async fn handler(state: &AppState) -> TauResult<()> {
    let range = DateRange::default_sync_window();
    let connections = state.caldir().connections();

    for connection in connections {
        let mut connection = connection.map_err(|e| e.to_string())?;
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
        state.events.invalidate(&slug);
    }

    Ok(())
}
