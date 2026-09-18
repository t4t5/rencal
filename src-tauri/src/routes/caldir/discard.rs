use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};
use crate::state::AppState;
use caldir_core::DateRange;

pub(super) async fn handler(state: &AppState) -> TauResult<()> {
    let range = DateRange::default_sync_window();
    let connections = state.caldir().connections();

    for connection in connections {
        let mut connection = connection?;
        let slug = connection
            .local()
            .slug()
            .ok_or_else(|| RpcError::new(RpcErrorKind::Internal, "calendar missing slug"))?
            .to_string();

        let diff = connection
            .diff(&range)
            .await
            .map_err(|e| RpcError::from(e).context(format!("[{slug}]")))?;

        connection
            .discard_outgoing_diff(&diff)
            .map_err(|e| RpcError::from(e).context(format!("[{slug}]")))?;
        state.invalidate_events(&slug);
    }

    Ok(())
}
