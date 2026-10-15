use crate::external_views::{self, ExternalViewsSnapshot};
use crate::routes::TauResult;

// list_external: views contributed by installed plugins.
#[taurpc::procedures(path = "views", export_to = "../src/rpc/bindings.ts")]
pub trait ViewsApi {
    async fn list_external() -> TauResult<ExternalViewsSnapshot>;
}

#[derive(Clone)]
pub struct ViewsApiImpl;

#[taurpc::resolvers]
impl ViewsApi for ViewsApiImpl {
    async fn list_external(self) -> TauResult<ExternalViewsSnapshot> {
        Ok(external_views::scan())
    }
}
