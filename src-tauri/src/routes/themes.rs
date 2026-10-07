use crate::routes::TauResult;
use rencal_core::error::{CoreError, CoreErrorKind};
use rencal_core::external_themes::{self, ExternalThemeFonts, ExternalThemesSnapshot};

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
                    CoreErrorKind::InvalidInput
                }
                external_themes::ExternalThemeFontErrorKind::InvalidPackage => {
                    CoreErrorKind::InvalidPackage
                }
                external_themes::ExternalThemeFontErrorKind::Io => CoreErrorKind::Io,
            };
            CoreError::new(kind, error.to_string())
        })
    }
}
