mod conference;
mod event_color;
mod helpers;
mod ics_file;
mod types;

mod check_provider_connection;
mod connect_provider;
mod connect_provider_with_credentials;
mod create_event;
mod create_local_calendar;
mod delete_account;
mod delete_calendar;
mod delete_event;
mod delete_recurring_series;
mod discard;
mod find_event;
mod get_config;
mod get_event;
mod get_provider_connect_info;
mod import_ics;
mod list_calendars;
mod list_contacts;
mod list_events;
mod list_invites;
mod list_providers;
mod preview_ics;
mod rename_calendar;
mod rsvp;
mod search_events;
mod set_calendar_color;
mod set_config;
mod split_recurring_series_at;
mod sync;
#[cfg(all(test, unix))]
mod sync_fixture;
mod sync_preview;
mod update_event;

pub use types::{
    CaldirSettings, Calendar, CalendarEvent, Contact, CreateEventInput, CredentialFieldInput,
    CredentialsConnectResult, IcsImportResult, IcsImportTarget, IcsPreview, ProviderConnectInfo,
    ResponseStatus, SplitRecurringSeriesInput, SyncFailure, SyncPreviewResult, TimeFormat,
    UpdateEventInput,
};

use crate::routes::RpcResult;
use crate::state::{AppState, ProviderInfo};
use std::sync::Arc;
use crate::host::AppHandle;


#[derive(Clone)]
pub struct CaldirApiImpl {
    state: Arc<AppState>,
}

impl CaldirApiImpl {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }
}

/// Handlers take `&AppState`. Most are plain `fn`s: they block on disk I/O
/// and never await. The few that talk to a provider are `async` and must not
/// hold `state.caldir()` across an `.await` (the guard is `!Send`, so that is
/// a compile error rather than a stall).
impl CaldirApiImpl {
    pub async fn list_calendars(self) -> RpcResult<Vec<Calendar>> {
        list_calendars::handler(&self.state)
    }

    pub async fn list_contacts(self) -> RpcResult<Vec<Contact>> {
        list_contacts::handler(&self.state)
    }

    pub async fn list_events(
        self,
        calendar_slugs: Vec<String>,
        start: String,
        end: String,
    ) -> RpcResult<Vec<CalendarEvent>> {
        list_events::handler(&self.state, calendar_slugs, start, end)
    }

    pub async fn get_event(
        self,
        calendar_slug: String,
        event_id: String,
    ) -> RpcResult<Option<CalendarEvent>> {
        get_event::handler(&self.state, calendar_slug, event_id)
    }

    pub async fn find_event(
        self,
        uid: String,
        recurrence_id: Option<String>,
    ) -> RpcResult<Option<CalendarEvent>> {
        find_event::handler(&self.state, uid, recurrence_id)
    }

    pub async fn create_event(self, input: CreateEventInput) -> RpcResult<CalendarEvent> {
        create_event::handler(&self.state, input)
    }

    pub async fn update_event(self, input: UpdateEventInput) -> RpcResult<()> {
        update_event::handler(&self.state, input)
    }

    pub async fn delete_event(self, calendar_slug: String, event_id: String) -> RpcResult<()> {
        delete_event::handler(&self.state, calendar_slug, event_id)
    }

    pub async fn delete_recurring_series(self, calendar_slug: String, uid: String) -> RpcResult<()> {
        delete_recurring_series::handler(&self.state, calendar_slug, uid)
    }

    pub async fn split_recurring_series_at(
        self,
        input: SplitRecurringSeriesInput,
    ) -> RpcResult<CalendarEvent> {
        split_recurring_series_at::handler(&self.state, input)
    }

    pub async fn preview_ics(self, path: String) -> RpcResult<IcsPreview> {
        preview_ics::handler(path)
    }

    pub async fn import_ics(
        self,
        path: String,
        targets: Vec<IcsImportTarget>,
    ) -> RpcResult<IcsImportResult> {
        import_ics::handler(&self.state, path, targets)
    }

    pub async fn search_events(
        self,
        calendar_slugs: Vec<String>,
        query: String,
    ) -> RpcResult<Vec<CalendarEvent>> {
        search_events::handler(&self.state, calendar_slugs, query)
    }

    pub async fn list_invites(self, calendar_slugs: Vec<String>) -> RpcResult<Vec<CalendarEvent>> {
        list_invites::handler(&self.state, calendar_slugs)
    }

    pub async fn rsvp(
        self,
        calendar_slug: String,
        event_id: String,
        response: ResponseStatus,
    ) -> RpcResult<()> {
        rsvp::handler(&self.state, calendar_slug, event_id, response)
    }

    pub async fn sync_preview(self) -> RpcResult<SyncPreviewResult> {
        sync_preview::handler(&self.state).await
    }

    pub async fn sync(self, allow_mass_delete: Vec<String>) -> RpcResult<Vec<SyncFailure>> {
        sync::handler(&self.state, allow_mass_delete).await
    }

    pub async fn discard(self) -> RpcResult<Vec<SyncFailure>> {
        discard::handler(&self.state).await
    }

    pub async fn list_providers(self) -> RpcResult<Vec<ProviderInfo>> {
        list_providers::handler(&self.state)
    }

    pub async fn get_provider_connect_info(
        self,
        provider_name: String,
    ) -> RpcResult<ProviderConnectInfo> {
        get_provider_connect_info::handler(&self.state, provider_name).await
    }

    pub async fn check_provider_connection(
        self,
        provider_name: String,
        account: String,
    ) -> RpcResult<()> {
        check_provider_connection::handler(&self.state, provider_name, account).await
    }

    pub async fn connect_provider(
        self,
        app: AppHandle,
        provider_name: String,
    ) -> RpcResult<Vec<Calendar>> {
        connect_provider::handler(&self.state, app, provider_name).await
    }

    pub async fn connect_provider_with_credentials(
        self,
        app: AppHandle,
        provider_name: String,
        credentials: Vec<CredentialFieldInput>,
    ) -> RpcResult<CredentialsConnectResult> {
        connect_provider_with_credentials::handler(&self.state, app, provider_name, credentials)
            .await
    }

    pub async fn create_local_calendar(
        self,
        name: String,
        color: Option<String>,
    ) -> RpcResult<Calendar> {
        create_local_calendar::handler(&self.state, name, color)
    }

    pub async fn rename_calendar(self, calendar_slug: String, name: String) -> RpcResult<()> {
        rename_calendar::handler(&self.state, calendar_slug, name)
    }

    pub async fn set_calendar_color(self, calendar_slug: String, color: String) -> RpcResult<()> {
        set_calendar_color::handler(&self.state, calendar_slug, color)
    }

    pub async fn delete_calendar(self, calendar_slug: String) -> RpcResult<()> {
        delete_calendar::handler(&self.state, calendar_slug)
    }

    pub async fn delete_account(self, provider_name: String, account: String) -> RpcResult<()> {
        delete_account::handler(&self.state, provider_name, account)
    }

    pub async fn get_caldir_settings(self) -> RpcResult<CaldirSettings> {
        get_config::get_caldir_settings(&self.state)
    }
    pub async fn set_time_format(self, time_format: TimeFormat) -> RpcResult<()> {
        set_config::set_time_format(&self.state, time_format)
    }

    pub async fn set_default_reminders(self, minutes: Vec<i32>) -> RpcResult<()> {
        set_config::set_default_reminders(&self.state, minutes)
    }

    pub async fn set_default_calendar(self, slug: Option<String>) -> RpcResult<()> {
        set_config::set_default_calendar(&self.state, slug)
    }

    pub async fn set_calendar_dir(self, path: String) -> RpcResult<()> {
        set_config::set_calendar_dir(&self.state, path)
    }
}
