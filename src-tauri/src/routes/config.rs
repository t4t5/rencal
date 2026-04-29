use rencal_config::RencalConfig;

use crate::routes::TauResult;

// `get_theme` returns `Some(theme)` if the config file exists, `None` if it
// has never been written. The frontend uses the `None` case to migrate a
// pre-existing `localStorage["theme"]` value up to TOML on first run.
#[taurpc::procedures(path = "config", export_to = "../src/rpc/bindings.ts")]
pub trait ConfigApi {
    async fn get_theme() -> TauResult<Option<String>>;
    async fn set_theme(theme: String) -> TauResult<()>;
    async fn get_notifications_enabled() -> TauResult<bool>;
    async fn set_notifications_enabled(enabled: bool) -> TauResult<()>;
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

    async fn get_notifications_enabled(self) -> TauResult<bool> {
        Ok(RencalConfig::load().notifications_enabled)
    }

    async fn set_notifications_enabled(self, enabled: bool) -> TauResult<()> {
        let mut config = RencalConfig::load();
        config.notifications_enabled = enabled;
        config.save()
    }
}
