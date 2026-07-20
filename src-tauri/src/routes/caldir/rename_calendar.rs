use super::helpers::load_caldir;
use crate::routes::TauResult;
use caldir_core::CalendarConfig;

pub(super) async fn handler(calendar_slug: String, name: String) -> TauResult<()> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Calendar name cannot be empty".to_string());
    }

    let caldir = load_caldir()?;
    let mut calendar = None;

    for candidate in caldir.calendars() {
        let candidate = candidate.map_err(|e| e.to_string())?;
        if candidate.slug() == Some(calendar_slug.as_str()) {
            calendar = Some(candidate);
            break;
        }
    }

    let calendar = calendar.ok_or_else(|| format!("Calendar not found: {calendar_slug}"))?;
    let config = CalendarConfig::new(
        Some(name.to_string()),
        calendar.color().map(String::from),
        calendar.read_only_setting(),
        calendar.remote_config().cloned(),
    );

    config
        .write(&calendar.config_path())
        .map_err(|e| e.to_string())?;

    Ok(())
}
