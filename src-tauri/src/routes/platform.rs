use rencal_core::deep_links::{EventDeepLink, PluginInstallLink};
pub use rencal_core::platform::needs_native_decorations;
use rencal_core::state::AppState;
use std::sync::Arc;

#[taurpc::procedures(path = "platform", export_to = "../src/rpc/bindings.ts")]
pub trait PlatformApi {
    async fn needs_native_decorations() -> bool;
    async fn take_pending_event_links() -> Vec<EventDeepLink>;
    async fn take_pending_plugin_install() -> Option<PluginInstallLink>;
}

#[derive(Clone)]
pub struct PlatformApiImpl {
    state: Arc<AppState>,
}

impl PlatformApiImpl {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }
}

#[taurpc::resolvers]
impl PlatformApi for PlatformApiImpl {
    async fn needs_native_decorations(self) -> bool {
        needs_native_decorations()
    }

    async fn take_pending_event_links(self) -> Vec<EventDeepLink> {
        self.state.deep_links.take()
    }

    async fn take_pending_plugin_install(self) -> Option<PluginInstallLink> {
        self.state.deep_links.take_plugin_install()
    }
}
