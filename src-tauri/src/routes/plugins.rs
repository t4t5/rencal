use crate::plugins::{PluginInspection, PluginInstallError, PluginInstallErrorKind, PluginManager};
use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};

#[taurpc::procedures(path = "plugins", export_to = "../src/rpc/bindings.ts")]
pub trait PluginsApi {
    async fn inspect(repo: String) -> TauResult<PluginInspection>;
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
    async fn inspect(self, repo: String) -> TauResult<PluginInspection> {
        self.manager
            .inspect(&repo)
            .await
            .map_err(|error| RpcError::from(error).context(format!("Plugin [{repo}]")))
    }

    async fn install(self, repo: String) -> TauResult<PluginInspection> {
        self.manager
            .install(&repo)
            .await
            .map_err(|error| RpcError::from(error).context(format!("Plugin [{repo}]")))
    }

    async fn uninstall(self, id: String) -> TauResult<()> {
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
