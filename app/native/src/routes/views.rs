use crate::external_views::{self, ExternalViewsSnapshot};
use crate::routes::RpcResult;

// list_external: views contributed by installed plugins.

#[derive(Clone)]
pub struct ViewsApiImpl;

impl ViewsApiImpl {
    pub async fn list_external(self) -> RpcResult<ExternalViewsSnapshot> {
        Ok(external_views::scan())
    }
}
