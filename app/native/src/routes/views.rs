use crate::external_views::{self, ExternalViewsSnapshot};
use crate::routes::TauResult;

// list_external: views contributed by installed plugins.

#[derive(Clone)]
pub struct ViewsApiImpl;

impl ViewsApiImpl {
    pub async fn list_external(self) -> TauResult<ExternalViewsSnapshot> {
        Ok(external_views::scan())
    }
}
