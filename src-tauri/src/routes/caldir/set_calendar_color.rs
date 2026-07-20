use super::helpers::load_caldir;
use crate::caldir_watcher::CALDIR_CHANGED;
use crate::routes::TauResult;
use caldir_core::CalendarConfig;
use tauri::{AppHandle, Emitter, Runtime};

pub(super) async fn handler<R: Runtime>(
    app: AppHandle<R>,
    calendar_slug: String,
    color: String,
) -> TauResult<()> {
    if !is_hex_color(&color) {
        return Err("Calendar color must be a hex color in the form #RRGGBB".to_string());
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
        calendar.name().map(String::from),
        Some(color),
        calendar.read_only_setting(),
        calendar.remote_config().cloned(),
    );

    config
        .write(&calendar.config_path())
        .map_err(|e| e.to_string())?;

    let _ = app.emit(CALDIR_CHANGED, ());

    Ok(())
}

fn is_hex_color(color: &str) -> bool {
    color.len() == 7
        && color.starts_with('#')
        && color[1..]
            .chars()
            .all(|character| character.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::is_hex_color;

    #[test]
    fn validates_hex_colors() {
        assert!(is_hex_color("#12aBcF"));
        assert!(!is_hex_color("12aBcF"));
        assert!(!is_hex_color("#fff"));
        assert!(!is_hex_color("#12xyz0"));
    }
}
