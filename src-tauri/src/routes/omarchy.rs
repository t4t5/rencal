use crate::omarchy::{self, OmarchyColors};
use crate::routes::TauResult;

#[taurpc::procedures(path = "omarchy", export_to = "../src/rpc/bindings.ts")]
pub trait OmarchyApi {
    async fn get_colors() -> TauResult<Option<OmarchyColors>>;
}

#[derive(Clone)]
pub struct OmarchyApiImpl;

#[taurpc::resolvers]
impl OmarchyApi for OmarchyApiImpl {
    async fn get_colors(self) -> TauResult<Option<OmarchyColors>> {
        Ok(omarchy::read_colors())
    }
}
