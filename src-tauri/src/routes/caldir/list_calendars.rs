use super::types::Calendar;
use crate::routes::TauResult;
use crate::state::AppState;

pub(super) fn handler(state: &AppState) -> TauResult<Vec<Calendar>> {
    let calendars = state
        .caldir()
        .calendars()
        .into_iter()
        .filter_map(Result::ok)
        .map(|c| Calendar::from(&c))
        .collect();
    Ok(calendars)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::ProviderDirs;

    #[test]
    fn availability_directories_are_not_calendars() {
        let tmp = tempfile::tempdir().unwrap();
        let config_path = tmp.path().join("config.toml");
        std::fs::write(
            &config_path,
            format!("calendar_dir = \"{}\"\n", tmp.path().join("data").display()),
        )
        .unwrap();
        let state = AppState::load_from(config_path, ProviderDirs::default()).unwrap();
        state.caldir().create_calendar("work", None).unwrap();
        state.caldir().create_availability_dir("booking").unwrap();

        let slugs: Vec<String> = handler(&state)
            .unwrap()
            .into_iter()
            .map(|calendar| calendar.slug)
            .collect();

        assert_eq!(slugs, ["work"]);
    }
}
