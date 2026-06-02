use crate::event_cache::EVENT_CACHE;
use crate::routes::TauResult;
use caldir_core::{Caldir, DateRange, EventChange};

/// Number of pending push deletions that triggers the mass-delete safeguard.
/// Mirrors `caldir-cli`'s `guards::MASS_DELETE_THRESHOLD`.
const MASS_DELETE_THRESHOLD: u32 = 10;

pub(super) async fn handler(allow_mass_delete: Vec<String>) -> TauResult<()> {
    let caldir = Caldir::load().map_err(|e| e.to_string())?;
    let range = DateRange::default_sync_window();

    for connection in caldir.connections() {
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
            .apply_incoming_diff(&diff)
            .map_err(|e| format!("[{}] {}", slug, e))?;
        EVENT_CACHE.invalidate(&slug);

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
            .map_err(|e| format!("[{}] {}", slug, e))?;
        EVENT_CACHE.invalidate(&slug);
    }

    Ok(())
}
