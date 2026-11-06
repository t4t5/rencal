use crate::omarchy::{self, OmarchyColors};
use crate::routes::TauResult;


#[derive(Clone)]
pub struct OmarchyApiImpl;

impl OmarchyApiImpl {
    pub async fn get_colors(self) -> TauResult<Option<OmarchyColors>> {
        Ok(omarchy::read_colors())
    }
}
