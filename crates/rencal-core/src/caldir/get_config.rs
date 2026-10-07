use super::types::CaldirSettings;
use crate::error::CoreResult;
use crate::state::AppState;

pub fn get_caldir_settings(state: &AppState) -> CoreResult<CaldirSettings> {
    Ok(CaldirSettings::from(state.caldir().config()))
}
