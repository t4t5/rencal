use crate::external_themes::{self, ExternalThemeFonts, ExternalThemesSnapshot};
use crate::routes::{TauResult, error::RpcErrorKind};

// list_external: loose CSS themes and installed plugin theme contributions.
#[taurpc::procedures(path = "themes", export_to = "../src/rpc/bindings.ts")]
pub trait ThemesApi {
    async fn list_external() -> TauResult<ExternalThemesSnapshot>;
    async fn load_fonts(theme_id: String) -> TauResult<ExternalThemeFonts>;
}

#[derive(Clone)]
pub struct ThemesApiImpl;

#[taurpc::resolvers]
impl ThemesApi for ThemesApiImpl {
    async fn list_external(self) -> TauResult<ExternalThemesSnapshot> {
        Ok(external_themes::scan())
    }

    async fn load_fonts(self, theme_id: String) -> TauResult<ExternalThemeFonts> {
        external_themes::load_fonts(&theme_id).map_err(|error| {
            let kind = match error.kind {
                external_themes::ExternalThemeFontErrorKind::InvalidInput => {
                    RpcErrorKind::InvalidInput
                }
                external_themes::ExternalThemeFontErrorKind::InvalidPackage => {
                    RpcErrorKind::InvalidPackage
                }
                external_themes::ExternalThemeFontErrorKind::Io => RpcErrorKind::Io,
            };
            crate::routes::error::RpcError::new(kind, error.to_string())
        })
    }
}
