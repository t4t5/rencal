//! `rencal.plugin-view`: a view plugin's NSH bundle, run in an engine of its
//! own (a nested `AppView`), so the plugin shares no module state, signals or
//! globals with renCal and can only do what [`plugin_capabilities`] grants.
//!
//! The app talks to it through props and events. `source` loads the bundle,
//! and every other prop goes to the plugin as a host event of its name
//! (`host.on("context", ...)`). The plugin's `host.call("rencal.<name>", data)`
//! comes back as an `onRequest` event with `{ name, data }`. `../sdk` is the
//! plugin's side of this, and `../sdk/protocol.ts` what crosses.

use std::rc::Rc;

use nsh_core::JsonValue;
use nsh_core::access::Capabilities;
use nsh_engine::Policy;
use nsh_platform_linux::gtk4 as gtk;
use nsh_platform_linux::{
    AppOptions, AppView, AssetBase, Bundle, ComponentContext, Components, NativeComponent,
};
use serde_json::json;

const COMPONENT: &str = "rencal.plugin-view";

/// What the SDK asks of renCal; anything else is refused by the sandbox.
const REQUESTS: &[&str] = &["goToDate", "openEvent", "holdRange"];

/// A view plugin's sandbox, whatever its bundle declares: renCal's host calls
/// and the clipboard; no network, files, processes or windows.
fn plugin_capabilities() -> Capabilities {
    Capabilities::from_json(&json!({ "host": ["rencal.*"], "clipboard": true }))
        .expect("the plugin capabilities are valid")
}

/// Registers the component; `lib.rs`'s `#[native_components(linux)]` calls it.
pub fn register(components: &Components) {
    components.register(
        COMPONENT,
        Rc::new(|context| Box::new(PluginView::new(context)) as Box<dyn NativeComponent>),
    );
}

struct PluginView {
    view: Rc<AppView>,
    /// The bundle running, to load it once.
    source: Option<JsonValue>,
    /// Each prop's last value: sent as it changes once a bundle runs, and all
    /// at once to a bundle as it loads.
    events: Vec<(String, JsonValue)>,
}

impl PluginView {
    fn new(context: ComponentContext) -> Self {
        let view = AppView::new(AppOptions::default());
        let host = view.host();
        for request in REQUESTS {
            let context = context.clone();
            host.handle(format!("rencal.{request}"), move |call| {
                let data = call.data().clone();
                context.emit("request", json!({ "name": request, "data": data }));
                call.resolve(JsonValue::Null);
            });
        }
        Self {
            view,
            source: None,
            events: Vec::new(),
        }
    }

    fn load(&mut self, source: &JsonValue) {
        if self.source.as_ref() == Some(source) {
            return;
        }
        let (Some(bundle), Some(plugin_id)) = (
            source.get("bundle").and_then(JsonValue::as_str),
            source.get("pluginId").and_then(JsonValue::as_str),
        ) else {
            log::warn!("{COMPONENT}: `source` needs `bundle` and `pluginId`");
            return;
        };
        let path = std::path::Path::new(bundle);
        let code = match std::fs::read_to_string(path) {
            Ok(code) => code,
            Err(err) => {
                log::warn!("{COMPONENT}: could not read {bundle}: {err}");
                return;
            }
        };
        let capabilities = plugin_capabilities();
        let bundle = Bundle::source(code)
            .with_app_id(Some(&format!("org.ren.rencal.plugin.{plugin_id}")))
            .with_policy(Policy {
                declared: Some(capabilities.clone()),
                granted: Some(capabilities),
                ..Policy::default()
            });
        // What `nsh build` wrote next to the bundle: `assets/`.
        let assets = path
            .parent()
            .map(|dir| AssetBase::Directory(dir.join("assets")));
        self.view.set_asset_base(assets);
        self.view.load(bundle.into());
        self.source = Some(source.clone());
        for (name, data) in &self.events {
            self.deliver(name, data.clone());
        }
    }

    fn send(&mut self, name: &str, data: JsonValue) {
        match self.events.iter_mut().find(|(event, _)| event == name) {
            Some((_, last)) => *last = data.clone(),
            None => self.events.push((name.to_owned(), data.clone())),
        }
        if self.source.is_some() {
            self.deliver(name, data);
        }
    }

    fn deliver(&self, name: &str, data: JsonValue) {
        if let Err(err) = self.view.host().send(name, data) {
            log::warn!("{COMPONENT}: could not send `{name}`: {err}");
        }
    }
}

impl NativeComponent for PluginView {
    fn widget(&self) -> gtk::Widget {
        self.view.widget()
    }

    fn set_prop(&mut self, name: &str, value: Option<&JsonValue>) {
        let value = value.cloned().unwrap_or(JsonValue::Null);
        match name {
            "source" => self.load(&value),
            _ => self.send(name, value),
        }
    }
}

impl Drop for PluginView {
    fn drop(&mut self) {
        self.view.stop();
    }
}
