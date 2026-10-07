use crate::error::CoreResult;
use crate::error::{CoreError, CoreErrorKind};
use crate::state::AppState;

pub fn set_calendar_color(
    state: &AppState,
    calendar_slug: String,
    color: String,
) -> CoreResult<()> {
    if !is_hex_color(&color) {
        return Err(CoreError::new(
            CoreErrorKind::InvalidInput,
            "Calendar color must be a hex color in the form #RRGGBB",
        ));
    }

    let calendar = state.caldir().calendar(&calendar_slug)?;
    let mut config = calendar.config().cloned().unwrap_or_default();
    config.set_color(Some(color));

    config.write(&calendar.config_path())?;

    state.notify_calendars_changed();

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
