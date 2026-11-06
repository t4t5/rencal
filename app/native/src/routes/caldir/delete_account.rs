use crate::routes::TauResult;
use crate::state::AppState;

/// Removes every calendar synced from `account`, leaving the remote untouched.
pub(super) fn handler(state: &AppState, provider_name: String, account: String) -> TauResult<()> {
    let calendars: Vec<_> = state
        .caldir()
        .calendars()
        .into_iter()
        .filter_map(Result::ok)
        .filter(|c| {
            c.remote_config().is_some_and(|r| {
                r.provider_slug().to_string() == provider_name
                    && r.account_identifier() == Some(account.as_str())
            })
        })
        .collect();

    for calendar in &calendars {
        std::fs::remove_dir_all(calendar.path())?;
        if let Some(slug) = calendar.slug() {
            state.invalidate_events(slug);
        }
    }

    state.notify_calendars_changed();

    Ok(())
}
