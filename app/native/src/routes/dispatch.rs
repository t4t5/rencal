//! Every backend procedure, by the `path.method` names `src/rpc/bindings.ts` declares.
//! TSX reaches these through `Backend.call`; arguments arrive positionally as JSON.

use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

use std::collections::BTreeMap;

use crate::control::CommandOutcome;
use crate::host::AppHandle;
use crate::keys::KeyEdit;
use crate::routes::caldir::{
    CreateEventInput, CredentialFieldInput, IcsImportTarget, ResponseStatus,
    SplitRecurringSeriesInput, TimeFormat, UpdateEventInput,
};
use crate::routes::config::{FirstDayOfWeek, ThemeSettings};
use crate::skill_install::Skill;

pub struct Router {
    /// For what isn't a procedure: deep links a later launch hands over.
    pub state: std::sync::Arc<crate::state::AppState>,
    pub agents: super::agents::AgentsApiImpl,
    pub caldir: super::caldir::CaldirApiImpl,
    pub commands: super::commands::CommandsApiImpl,
    pub config: super::config::ConfigApiImpl,
    pub keys: super::keys::KeysApiImpl,
    pub omarchy: super::omarchy::OmarchyApiImpl,
    pub platform: super::platform::PlatformApiImpl,
    pub plugins: super::plugins::PluginsApiImpl,
    pub themes: super::themes::ThemesApiImpl,
    pub views: super::views::ViewsApiImpl,
}

/// Deserializes argument `index`; a missing trailing argument reads as `null`, as `Option` expects.
fn arg<T: DeserializeOwned>(args: &[Value], index: usize) -> Result<T, Value> {
    let value = args.get(index).cloned().unwrap_or(Value::Null);
    serde_json::from_value(value).map_err(|error| {
        json!({ "kind": "invalid_input", "message": format!("argument {index}: {error}") })
    })
}

fn plain<T: Serialize>(value: T) -> Result<Value, Value> {
    serde_json::to_value(value).map_err(|error| json!({ "kind": "internal", "message": error.to_string() }))
}

fn fallible<T: Serialize, E: Serialize>(value: Result<T, E>) -> Result<Value, Value> {
    match value {
        Ok(value) => plain(value),
        Err(error) => Err(serde_json::to_value(error).unwrap_or(Value::Null)),
    }
}

impl Router {
    pub async fn call(&self, path: &str, args: Vec<Value>) -> Result<Value, Value> {
        match path {
            "agents.skills" => {
                fallible(self.agents.clone().skills().await)
            }
            "agents.install_skill" => {
                let skill: Skill = arg(&args, 0)?;
                fallible(self.agents.clone().install_skill(skill).await)
            }
            "agents.uninstall_skill" => {
                let skill: Skill = arg(&args, 0)?;
                fallible(self.agents.clone().uninstall_skill(skill).await)
            }
            "caldir.list_calendars" => {
                fallible(self.caldir.clone().list_calendars().await)
            }
            "caldir.list_contacts" => {
                fallible(self.caldir.clone().list_contacts().await)
            }
            "caldir.list_events" => {
                let calendar_slugs: Vec<String> = arg(&args, 0)?;
                let start: String = arg(&args, 1)?;
                let end: String = arg(&args, 2)?;
                fallible(self.caldir.clone().list_events(calendar_slugs, start, end).await)
            }
            "caldir.get_event" => {
                let calendar_slug: String = arg(&args, 0)?;
                let event_id: String = arg(&args, 1)?;
                fallible(self.caldir.clone().get_event(calendar_slug, event_id).await)
            }
            "caldir.find_event" => {
                let uid: String = arg(&args, 0)?;
                let recurrence_id: Option<String> = arg(&args, 1)?;
                fallible(self.caldir.clone().find_event(uid, recurrence_id).await)
            }
            "caldir.create_event" => {
                let input: CreateEventInput = arg(&args, 0)?;
                fallible(self.caldir.clone().create_event(input).await)
            }
            "caldir.update_event" => {
                let input: UpdateEventInput = arg(&args, 0)?;
                fallible(self.caldir.clone().update_event(input).await)
            }
            "caldir.delete_event" => {
                let calendar_slug: String = arg(&args, 0)?;
                let event_id: String = arg(&args, 1)?;
                fallible(self.caldir.clone().delete_event(calendar_slug, event_id).await)
            }
            "caldir.delete_recurring_series" => {
                let calendar_slug: String = arg(&args, 0)?;
                let uid: String = arg(&args, 1)?;
                fallible(self.caldir.clone().delete_recurring_series(calendar_slug, uid).await)
            }
            "caldir.split_recurring_series_at" => {
                let input: SplitRecurringSeriesInput = arg(&args, 0)?;
                fallible(self.caldir.clone().split_recurring_series_at(input).await)
            }
            "caldir.preview_ics" => {
                let path: String = arg(&args, 0)?;
                fallible(self.caldir.clone().preview_ics(path).await)
            }
            "caldir.import_ics" => {
                let path: String = arg(&args, 0)?;
                let targets: Vec<IcsImportTarget> = arg(&args, 1)?;
                fallible(self.caldir.clone().import_ics(path, targets).await)
            }
            "caldir.search_events" => {
                let calendar_slugs: Vec<String> = arg(&args, 0)?;
                let query: String = arg(&args, 1)?;
                fallible(self.caldir.clone().search_events(calendar_slugs, query).await)
            }
            "caldir.list_invites" => {
                let calendar_slugs: Vec<String> = arg(&args, 0)?;
                fallible(self.caldir.clone().list_invites(calendar_slugs).await)
            }
            "caldir.rsvp" => {
                let calendar_slug: String = arg(&args, 0)?;
                let event_id: String = arg(&args, 1)?;
                let response: ResponseStatus = arg(&args, 2)?;
                fallible(self.caldir.clone().rsvp(calendar_slug, event_id, response).await)
            }
            "caldir.sync_preview" => {
                fallible(self.caldir.clone().sync_preview().await)
            }
            "caldir.sync" => {
                let allow_mass_delete: Vec<String> = arg(&args, 0)?;
                fallible(self.caldir.clone().sync(allow_mass_delete).await)
            }
            "caldir.discard" => {
                fallible(self.caldir.clone().discard().await)
            }
            "caldir.list_providers" => {
                fallible(self.caldir.clone().list_providers().await)
            }
            "caldir.get_provider_connect_info" => {
                let provider_name: String = arg(&args, 0)?;
                fallible(self.caldir.clone().get_provider_connect_info(provider_name).await)
            }
            "caldir.check_provider_connection" => {
                let provider_name: String = arg(&args, 0)?;
                let account: String = arg(&args, 1)?;
                fallible(self.caldir.clone().check_provider_connection(provider_name, account).await)
            }
            "caldir.connect_provider" => {
                let provider_name: String = arg(&args, 0)?;
                fallible(self.caldir.clone().connect_provider(AppHandle, provider_name).await)
            }
            "caldir.connect_provider_with_credentials" => {
                let provider_name: String = arg(&args, 0)?;
                let credentials: Vec<CredentialFieldInput> = arg(&args, 1)?;
                fallible(self.caldir.clone().connect_provider_with_credentials(AppHandle, provider_name, credentials).await)
            }
            "caldir.create_local_calendar" => {
                let name: String = arg(&args, 0)?;
                let color: Option<String> = arg(&args, 1)?;
                fallible(self.caldir.clone().create_local_calendar(name, color).await)
            }
            "caldir.rename_calendar" => {
                let calendar_slug: String = arg(&args, 0)?;
                let name: String = arg(&args, 1)?;
                fallible(self.caldir.clone().rename_calendar(calendar_slug, name).await)
            }
            "caldir.set_calendar_color" => {
                let calendar_slug: String = arg(&args, 0)?;
                let color: String = arg(&args, 1)?;
                fallible(self.caldir.clone().set_calendar_color(calendar_slug, color).await)
            }
            "caldir.delete_calendar" => {
                let calendar_slug: String = arg(&args, 0)?;
                fallible(self.caldir.clone().delete_calendar(calendar_slug).await)
            }
            "caldir.delete_account" => {
                let provider_name: String = arg(&args, 0)?;
                let account: String = arg(&args, 1)?;
                fallible(self.caldir.clone().delete_account(provider_name, account).await)
            }
            "caldir.get_caldir_settings" => {
                fallible(self.caldir.clone().get_caldir_settings().await)
            }
            "caldir.set_time_format" => {
                let time_format: TimeFormat = arg(&args, 0)?;
                fallible(self.caldir.clone().set_time_format(time_format).await)
            }
            "caldir.set_default_reminders" => {
                let minutes: Vec<i32> = arg(&args, 0)?;
                fallible(self.caldir.clone().set_default_reminders(minutes).await)
            }
            "caldir.set_default_calendar" => {
                let slug: Option<String> = arg(&args, 0)?;
                fallible(self.caldir.clone().set_default_calendar(slug).await)
            }
            "caldir.set_calendar_dir" => {
                let path: String = arg(&args, 0)?;
                fallible(self.caldir.clone().set_calendar_dir(path).await)
            }
            "commands.take_pending" => {
                plain(self.commands.clone().take_pending().await)
            }
            "commands.respond" => {
                let id: u32 = arg(&args, 0)?;
                let outcome: CommandOutcome = arg(&args, 1)?;
                plain(self.commands.clone().respond(id, outcome).await)
            }
            "config.get_theme" => {
                fallible(self.config.clone().get_theme().await)
            }
            "config.set_theme" => {
                let settings: ThemeSettings = arg(&args, 0)?;
                fallible(self.config.clone().set_theme(settings).await)
            }
            "config.get_notifications_enabled" => {
                fallible(self.config.clone().get_notifications_enabled().await)
            }
            "config.set_notifications_enabled" => {
                let enabled: bool = arg(&args, 0)?;
                fallible(self.config.clone().set_notifications_enabled(enabled).await)
            }
            "config.get_auto_sync_enabled" => {
                fallible(self.config.clone().get_auto_sync_enabled().await)
            }
            "config.set_auto_sync_enabled" => {
                let enabled: bool = arg(&args, 0)?;
                fallible(self.config.clone().set_auto_sync_enabled(enabled).await)
            }
            "config.get_first_day_of_week" => {
                fallible(self.config.clone().get_first_day_of_week().await)
            }
            "config.set_first_day_of_week" => {
                let day: FirstDayOfWeek = arg(&args, 0)?;
                fallible(self.config.clone().set_first_day_of_week(day).await)
            }
            "config.get_show_week_numbers" => {
                fallible(self.config.clone().get_show_week_numbers().await)
            }
            "config.set_show_week_numbers" => {
                let show: bool = arg(&args, 0)?;
                fallible(self.config.clone().set_show_week_numbers(show).await)
            }
            "config.get_groups" => {
                fallible(self.config.clone().get_groups().await)
            }
            "config.set_groups" => {
                let groups: BTreeMap<String, Vec<String>> = arg(&args, 0)?;
                fallible(self.config.clone().set_groups(groups).await)
            }
            "keys.get" => {
                plain(self.keys.clone().get().await)
            }
            "keys.edit" => {
                let edits: Vec<KeyEdit> = arg(&args, 0)?;
                fallible(self.keys.clone().edit(edits).await)
            }
            "omarchy.get_colors" => {
                fallible(self.omarchy.clone().get_colors().await)
            }
            "platform.needs_native_decorations" => {
                plain(self.platform.clone().needs_native_decorations().await)
            }
            "platform.take_pending_event_links" => {
                plain(self.platform.clone().take_pending_event_links().await)
            }
            "platform.take_pending_plugin_install" => {
                plain(self.platform.clone().take_pending_plugin_install().await)
            }
            "platform.take_pending_ics_file" => {
                plain(self.platform.clone().take_pending_ics_file().await)
            }
            "plugins.list" => {
                fallible(self.plugins.clone().list().await)
            }
            "plugins.catalog" => {
                fallible(self.plugins.clone().catalog().await)
            }
            "plugins.install" => {
                let repo: String = arg(&args, 0)?;
                fallible(self.plugins.clone().install(repo).await)
            }
            "plugins.uninstall" => {
                let id: String = arg(&args, 0)?;
                fallible(self.plugins.clone().uninstall(id).await)
            }
            "themes.list_external" => {
                fallible(self.themes.clone().list_external().await)
            }
            "themes.load_fonts" => {
                let theme_id: String = arg(&args, 0)?;
                fallible(self.themes.clone().load_fonts(theme_id).await)
            }
            "views.list_external" => {
                fallible(self.views.clone().list_external().await)
            }
            _ => Err(json!({ "kind": "internal", "message": format!("no procedure {path}") })),
        }
    }
}
