use crate::omarchy::{self, OmarchyColors};
use crate::routes::RpcResult;


#[derive(Clone)]
pub struct OmarchyApiImpl;

impl OmarchyApiImpl {
    pub async fn get_colors(self) -> RpcResult<Option<OmarchyColors>> {
        Ok(omarchy::read_colors())
    }
}
