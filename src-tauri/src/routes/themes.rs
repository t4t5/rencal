use crate::external_themes::{self, ExternalTheme};
use crate::routes::TauResult;

// list_external: user-supplied CSS themes discovered in ~/.config/rencal/themes/.
#[taurpc::procedures(path = "themes", export_to = "../src/rpc/bindings.ts")]
pub trait ThemesApi {
    async fn list_external() -> TauResult<Vec<ExternalTheme>>;
}

#[derive(Clone)]
pub struct ThemesApiImpl;

#[taurpc::resolvers]
impl ThemesApi for ThemesApiImpl {
    async fn list_external(self) -> TauResult<Vec<ExternalTheme>> {
        Ok(external_themes::scan())
    }
}
