use crate::external_themes::{self, ExternalThemesSnapshot};
use crate::routes::TauResult;

// list_external: loose CSS themes and installed plugin theme contributions.
#[taurpc::procedures(path = "themes", export_to = "../src/rpc/bindings.ts")]
pub trait ThemesApi {
    async fn list_external() -> TauResult<ExternalThemesSnapshot>;
}

#[derive(Clone)]
pub struct ThemesApiImpl;

#[taurpc::resolvers]
impl ThemesApi for ThemesApiImpl {
    async fn list_external(self) -> TauResult<ExternalThemesSnapshot> {
        Ok(external_themes::scan())
    }
}
