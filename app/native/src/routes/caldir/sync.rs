use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};
use crate::state::AppState;
use caldir_core::{DateRange, EventChange};

/// Number of pending push deletions that triggers the mass-delete safeguard.
/// Mirrors `caldir-cli`'s `guards::MASS_DELETE_THRESHOLD`.
const MASS_DELETE_THRESHOLD: u32 = 10;

pub(super) async fn handler(state: &AppState, allow_mass_delete: Vec<String>) -> TauResult<()> {
    let range = DateRange::default_sync_window();
    // Owned snapshot: the caldir guard must not live across the awaits below.
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
            .apply_incoming_diff(&diff)
            .map_err(|e| RpcError::from(e).context(format!("[{slug}]")))?;
        state.invalidate_events(&slug);

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

        connection
            .apply_outgoing_diff(&diff)
            .await
            .map_err(|e| RpcError::from(e).context(format!("[{slug}]")))?;
        state.invalidate_events(&slug);
    }

    Ok(())
}
