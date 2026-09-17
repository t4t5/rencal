use super::types::CaldirSettings;
use crate::routes::TauResult;
use crate::state::AppState;

pub(super) fn get_caldir_settings(state: &AppState) -> TauResult<CaldirSettings> {
    Ok(CaldirSettings::from(state.caldir().config()))
}
