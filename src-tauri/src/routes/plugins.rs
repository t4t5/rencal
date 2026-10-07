use crate::routes::TauResult;
use rencal_core::error::CoreError;
use rencal_core::plugins::{InstalledPlugins, PluginCatalog, PluginInspection, PluginManager};

#[taurpc::procedures(path = "plugins", export_to = "../src/rpc/bindings.ts")]
pub trait PluginsApi {
    async fn list() -> TauResult<InstalledPlugins>;
    async fn catalog() -> TauResult<PluginCatalog>;
    async fn install(repo: String) -> TauResult<PluginInspection>;
    async fn uninstall(id: String) -> TauResult<()>;
}

#[derive(Clone)]
pub struct PluginsApiImpl {
    manager: PluginManager,
}

impl PluginsApiImpl {
    pub fn new(manager: PluginManager) -> Self {
        Self { manager }
    }
}

#[taurpc::resolvers]
impl PluginsApi for PluginsApiImpl {
    async fn list(self) -> TauResult<InstalledPlugins> {
        Ok(self.manager.list().await)
    }

    async fn catalog(self) -> TauResult<PluginCatalog> {
        Ok(self.manager.catalog().await)
    }

    async fn install(self, repo: String) -> TauResult<PluginInspection> {
        self.manager
            .install(&repo)
            .await
            .map_err(|error| CoreError::from(error).context(format!("Plugin [{repo}]")))
    }

    async fn uninstall(self, id: String) -> TauResult<()> {
        self.manager
            .uninstall(&id)
            .await
            .map_err(|error| CoreError::from(error).context(format!("Plugin [{id}]")))
    }
}
