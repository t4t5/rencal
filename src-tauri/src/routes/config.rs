use crate::config::RencalConfig;
use crate::routes::TauResult;

// `get_theme` returns `Some(theme)` if the config file exists, `None` if it
// has never been written. The frontend uses the `None` case to migrate a
// pre-existing `localStorage["theme"]` value up to TOML on first run.
#[taurpc::procedures(path = "config", export_to = "../src/rpc/bindings.ts")]
pub trait ConfigApi {
    async fn get_theme() -> TauResult<Option<String>>;
    async fn set_theme(theme: String) -> TauResult<()>;
}

#[derive(Clone)]
pub struct ConfigApiImpl;

#[taurpc::resolvers]
impl ConfigApi for ConfigApiImpl {
    async fn get_theme(self) -> TauResult<Option<String>> {
        if !RencalConfig::exists() {
            return Ok(None);
        }
        Ok(Some(RencalConfig::load().theme))
    }

    async fn set_theme(self, theme: String) -> TauResult<()> {
        let mut config = RencalConfig::load();
        config.theme = theme;
        config.save()
    }
}
