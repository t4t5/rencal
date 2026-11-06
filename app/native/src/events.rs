//! The notification contract shared with the frontend. State changes still flow
//! through AppState's watch channels and state_bridge; other producers keep
//! ownership of their notifications. The enum envelope is for typing only:
//! native Tauri delivery sends its payload on its name.

use serde::Serialize;
use specta::Type;

use crate::external_themes::ExternalThemesSnapshot;
use crate::external_views::ExternalViewsSnapshot;
use crate::keys::KeysSnapshot;
use crate::omarchy::OmarchyColors;
use crate::routes::caldir::CaldirSettings;
use crate::routes::config::ThemeSettings;

#[derive(Clone, Serialize, Type)]
#[serde(tag = "name", content = "payload", rename_all = "kebab-case")]
pub enum AppEvent {
    CaldirConfigChanged(CaldirSettings),
    CalendarsChanged(()),
    EventsChanged(()),
    ProvidersChanged(()),
    EventDeepLinkAvailable(()),
    PluginDeepLinkAvailable(()),
    IcsFileAvailable(()),
    RencalConfigChanged(()),
    SystemTzChanged(String),
    OmarchyThemeChanged(OmarchyColors),
    ExternalThemesChanged(ExternalThemesSnapshot),
    ExternalViewsChanged(ExternalViewsSnapshot),
    KeysChanged(KeysSnapshot),
    /// `rencal do` queued a command; drain it with `commands.take_pending`.
    #[cfg_attr(not(unix), allow(dead_code))]
    CommandRequested(()),
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    MenuAction(String),
    #[allow(dead_code)] // Emitted by the frontend only; still part of the contract.
    ThemeChanged(ThemeSettings),
}

impl AppEvent {
    /// Derive both transport arguments from serde, never a second dispatch table.
    pub fn emit(&self, app: &crate::host::AppHandle) -> serde_json::Result<()> {
        let envelope = serde_json::to_value(self)?;
        let name = envelope["name"]
            .as_str()
            .expect("AppEvent has a string tag");
        app.emit(name, envelope["payload"].clone());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::omarchy::OmarchyMode;
    use crate::routes::caldir::TimeFormat;
    use crate::routes::config::ThemeMode;
    use serde_json::{Value, json};

    #[test]
    fn notification_names_and_payloads_preserve_the_native_contract() {
        let settings = CaldirSettings {
            time_format: TimeFormat::H24,
            default_reminders: vec![5],
            default_calendar: Some("work".into()),
            calendar_dir: "~/caldir".into(),
        };
        let colors = OmarchyColors {
            mode: OmarchyMode::Dark,
            name: None,
            background: "#000000".into(),
            foreground: "#ffffff".into(),
            bright_foreground: "#ffffff".into(),
            accent: "#ff0000".into(),
            red: "#ff0000".into(),
            green: "#00ff00".into(),
            yellow: "#ffff00".into(),
            blue: "#0000ff".into(),
        };
        let themes = ExternalThemesSnapshot::default();
        let views = ExternalViewsSnapshot::default();
        let cases: Vec<(AppEvent, &str, Value)> = vec![
            (
                AppEvent::CaldirConfigChanged(settings.clone()),
                "caldir-config-changed",
                serde_json::to_value(settings).unwrap(),
            ),
            (
                AppEvent::CalendarsChanged(()),
                "calendars-changed",
                Value::Null,
            ),
            (AppEvent::EventsChanged(()), "events-changed", Value::Null),
            (
                AppEvent::ProvidersChanged(()),
                "providers-changed",
                Value::Null,
            ),
            (
                AppEvent::EventDeepLinkAvailable(()),
                "event-deep-link-available",
                Value::Null,
            ),
            (
                AppEvent::PluginDeepLinkAvailable(()),
                "plugin-deep-link-available",
                Value::Null,
            ),
            (
                AppEvent::IcsFileAvailable(()),
                "ics-file-available",
                Value::Null,
            ),
            (
                AppEvent::RencalConfigChanged(()),
                "rencal-config-changed",
                Value::Null,
            ),
            (
                AppEvent::SystemTzChanged("Europe/London".into()),
                "system-tz-changed",
                json!("Europe/London"),
            ),
            (
                AppEvent::OmarchyThemeChanged(colors.clone()),
                "omarchy-theme-changed",
                serde_json::to_value(colors).unwrap(),
            ),
            (
                AppEvent::ExternalThemesChanged(themes.clone()),
                "external-themes-changed",
                serde_json::to_value(themes).unwrap(),
            ),
            (
                AppEvent::ExternalViewsChanged(views.clone()),
                "external-views-changed",
                serde_json::to_value(views).unwrap(),
            ),
            (
                AppEvent::KeysChanged(KeysSnapshot::default()),
                "keys-changed",
                json!({ "bindings": [], "error": null }),
            ),
            (
                AppEvent::CommandRequested(()),
                "command-requested",
                Value::Null,
            ),
            (
                AppEvent::MenuAction("event.new".into()),
                "menu-action",
                json!("event.new"),
            ),
            (
                AppEvent::ThemeChanged(ThemeSettings {
                    mode: ThemeMode::System,
                    single: "ren".into(),
                    light: "ren-light".into(),
                    dark: "user:test".into(),
                }),
                "theme-changed",
                json!({ "mode": "system", "single": "ren", "light": "ren-light", "dark": "user:test" }),
            ),
        ];
        for (event, name, payload) in cases {
            assert_eq!(
                serde_json::to_value(event).unwrap(),
                json!({ "name": name, "payload": payload })
            );
        }
    }
}
