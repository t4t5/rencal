use crate::plugins::{
    InstalledPlugins, PluginCatalog, PluginInspection, PluginInstallError, PluginInstallErrorKind,
    PluginManager,
};
use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};


#[derive(Clone)]
pub struct PluginsApiImpl {
    manager: PluginManager,
}

impl PluginsApiImpl {
    pub fn new(manager: PluginManager) -> Self {
        Self { manager }
    }
}

impl PluginsApiImpl {
    pub async fn list(self) -> TauResult<InstalledPlugins> {
        Ok(self.manager.list().await)
    }

    pub async fn catalog(self) -> TauResult<PluginCatalog> {
        Ok(self.manager.catalog().await)
    }

    pub async fn install(self, repo: String) -> TauResult<PluginInspection> {
        self.manager
            .install(&repo)
            .await
            .map_err(|error| RpcError::from(error).context(format!("Plugin [{repo}]")))
    }

    pub async fn uninstall(self, id: String) -> TauResult<()> {
        self.manager
            .uninstall(&id)
            .await
            .map_err(|error| RpcError::from(error).context(format!("Plugin [{id}]")))
    }
}

impl From<PluginInstallError> for RpcError {
    fn from(error: PluginInstallError) -> Self {
        let kind = match error.kind {
            PluginInstallErrorKind::InvalidInput => RpcErrorKind::InvalidInput,
            PluginInstallErrorKind::Network => RpcErrorKind::Network,
            PluginInstallErrorKind::RateLimited => RpcErrorKind::RateLimited,
            PluginInstallErrorKind::MissingRelease => RpcErrorKind::MissingRelease,
            PluginInstallErrorKind::Incompatible => RpcErrorKind::Incompatible,
            PluginInstallErrorKind::InvalidPackage => RpcErrorKind::InvalidPackage,
            PluginInstallErrorKind::Configuration => RpcErrorKind::Configuration,
            PluginInstallErrorKind::Io => RpcErrorKind::Io,
        };
        Self::new(kind, error.to_string())
    }
}
