use crate::external_themes::{self, ExternalTheme};
use crate::routes::TauResult;

// list_external: user-supplied CSS themes discovered in ~/.config/rencal/themes/.
// themes_dir: absolute path to that directory (for an "open folder" action).
#[taurpc::procedures(path = "themes", export_to = "../src/rpc/bindings.ts")]
pub trait ThemesApi {
    async fn list_external() -> TauResult<Vec<ExternalTheme>>;
    async fn themes_dir() -> TauResult<String>;
}

#[derive(Clone)]
pub struct ThemesApiImpl;

#[taurpc::resolvers]
impl ThemesApi for ThemesApiImpl {
    async fn list_external(self) -> TauResult<Vec<ExternalTheme>> {
        Ok(external_themes::scan())
    }

    async fn themes_dir(self) -> TauResult<String> {
        external_themes::themes_dir_string()
            .ok_or_else(|| "Could not resolve themes directory".to_string())
    }
}
