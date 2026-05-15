use crate::routes::TauResult;
use caldir_core::{Caldir, DateRange};

pub(super) async fn handler(calendar_slugs: Vec<String>) -> TauResult<()> {
    let caldir = Caldir::load().map_err(|e| e.to_string())?;
    let range = DateRange::default();

    for slug in &calendar_slugs {
        let calendar = caldir
            .calendar(slug)
            .map_err(|e| format!("[{}] {}", slug, e))?;

        if calendar.remote_config().is_none() {
            continue;
        }

        let connection = caldir
            .connection(slug)
            .map_err(|e| format!("[{}] {}", slug, e))?;
        let diff = connection
            .diff(&range)
            .await
            .map_err(|e| format!("[{}] {}", slug, e))?;

        connection
            .discard_outgoing_diff(&diff)
            .map_err(|e| format!("[{}] {}", slug, e))?;
    }

    Ok(())
}
