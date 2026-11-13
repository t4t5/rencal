use super::types::CaldirSettings;
use crate::routes::RpcResult;
use crate::state::AppState;

pub(super) fn get_caldir_settings(state: &AppState) -> RpcResult<CaldirSettings> {
    Ok(CaldirSettings::from(state.caldir().config()))
}
