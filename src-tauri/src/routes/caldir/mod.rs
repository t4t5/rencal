use rencal_core::caldir::{
    self, CaldirSettings, Calendar, CalendarEvent, Contact, CreateEventInput, CredentialFieldInput,
    ProviderConnectInfo, ResponseStatus, SplitRecurringSeriesInput, SyncPreview, TimeFormat,
    UpdateEventInput,
};

use crate::routes::TauResult;
use rencal_core::state::{AppState, ProviderInfo};
use std::sync::Arc;
use tauri::{AppHandle, Runtime};
use tauri_plugin_opener::OpenerExt;

#[taurpc::procedures(path = "caldir", export_to = "../src/rpc/bindings.ts")]
pub trait CaldirApi {
    async fn list_calendars() -> TauResult<Vec<Calendar>>;
    async fn list_contacts() -> TauResult<Vec<Contact>>;
    async fn list_events(
        calendar_slugs: Vec<String>,
        start: String,
        end: String,
    ) -> TauResult<Vec<CalendarEvent>>;
    async fn get_event(calendar_slug: String, event_id: String)
    -> TauResult<Option<CalendarEvent>>;
    async fn find_event(
        uid: String,
        recurrence_id: Option<String>,
    ) -> TauResult<Option<CalendarEvent>>;
    async fn create_event(input: CreateEventInput) -> TauResult<CalendarEvent>;
    async fn update_event(input: UpdateEventInput) -> TauResult<()>;
    async fn delete_event(calendar_slug: String, event_id: String) -> TauResult<()>;
    async fn delete_recurring_series(calendar_slug: String, uid: String) -> TauResult<()>;
    async fn split_recurring_series_at(
        input: SplitRecurringSeriesInput,
    ) -> TauResult<CalendarEvent>;

    async fn search_events(
        calendar_slugs: Vec<String>,
        query: String,
    ) -> TauResult<Vec<CalendarEvent>>;

    async fn list_invites(calendar_slugs: Vec<String>) -> TauResult<Vec<CalendarEvent>>;
    async fn rsvp(
        calendar_slug: String,
        event_id: String,
        response: ResponseStatus,
    ) -> TauResult<()>;

    async fn sync_preview() -> TauResult<Vec<SyncPreview>>;

    async fn sync(allow_mass_delete: Vec<String>) -> TauResult<()>;

    async fn discard() -> TauResult<()>;

    async fn list_providers() -> TauResult<Vec<ProviderInfo>>;

    async fn get_provider_connect_info(provider_name: String) -> TauResult<ProviderConnectInfo>;

    async fn check_provider_connection(provider_name: String, account: String) -> TauResult<()>;

    async fn connect_provider<R: Runtime>(
        app_handle: AppHandle<R>,
        provider_name: String,
    ) -> TauResult<Vec<Calendar>>;

    async fn connect_provider_with_credentials<R: Runtime>(
        app_handle: AppHandle<R>,
        provider_name: String,
        credentials: Vec<CredentialFieldInput>,
    ) -> TauResult<Vec<Calendar>>;

    async fn create_local_calendar(name: String, color: Option<String>) -> TauResult<Calendar>;
    async fn rename_calendar(calendar_slug: String, name: String) -> TauResult<()>;
    async fn set_calendar_color(calendar_slug: String, color: String) -> TauResult<()>;
    async fn delete_calendar(calendar_slug: String) -> TauResult<()>;

    async fn get_caldir_settings() -> TauResult<CaldirSettings>;
    async fn set_time_format(time_format: TimeFormat) -> TauResult<()>;

    async fn set_default_reminders(minutes: Vec<i32>) -> TauResult<()>;

    async fn set_default_calendar(slug: Option<String>) -> TauResult<()>;

    async fn set_calendar_dir(path: String) -> TauResult<()>;
}

#[derive(Clone)]
pub struct CaldirApiImpl {
    state: Arc<AppState>,
}

impl CaldirApiImpl {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }
}

/// Each resolver forwards to the `rencal_core::caldir` operation of the same
/// name.
#[taurpc::resolvers]
impl CaldirApi for CaldirApiImpl {
    async fn list_calendars(self) -> TauResult<Vec<Calendar>> {
        caldir::list_calendars(&self.state)
    }

    async fn list_contacts(self) -> TauResult<Vec<Contact>> {
        caldir::list_contacts(&self.state)
    }

    async fn list_events(
        self,
        calendar_slugs: Vec<String>,
        start: String,
        end: String,
    ) -> TauResult<Vec<CalendarEvent>> {
        caldir::list_events(&self.state, calendar_slugs, start, end)
    }

    async fn get_event(
        self,
        calendar_slug: String,
        event_id: String,
    ) -> TauResult<Option<CalendarEvent>> {
        caldir::get_event(&self.state, calendar_slug, event_id)
    }

    async fn find_event(
        self,
        uid: String,
        recurrence_id: Option<String>,
    ) -> TauResult<Option<CalendarEvent>> {
        caldir::find_event(&self.state, uid, recurrence_id)
    }

    async fn create_event(self, input: CreateEventInput) -> TauResult<CalendarEvent> {
        caldir::create_event(&self.state, input)
    }

    async fn update_event(self, input: UpdateEventInput) -> TauResult<()> {
        caldir::update_event(&self.state, input)
    }

    async fn delete_event(self, calendar_slug: String, event_id: String) -> TauResult<()> {
        caldir::delete_event(&self.state, calendar_slug, event_id)
    }

    async fn delete_recurring_series(self, calendar_slug: String, uid: String) -> TauResult<()> {
        caldir::delete_recurring_series(&self.state, calendar_slug, uid)
    }

    async fn split_recurring_series_at(
        self,
        input: SplitRecurringSeriesInput,
    ) -> TauResult<CalendarEvent> {
        caldir::split_recurring_series_at(&self.state, input)
    }

    async fn search_events(
        self,
        calendar_slugs: Vec<String>,
        query: String,
    ) -> TauResult<Vec<CalendarEvent>> {
        caldir::search_events(&self.state, calendar_slugs, query)
    }

    async fn list_invites(self, calendar_slugs: Vec<String>) -> TauResult<Vec<CalendarEvent>> {
        caldir::list_invites(&self.state, calendar_slugs)
    }

    async fn rsvp(
        self,
        calendar_slug: String,
        event_id: String,
        response: ResponseStatus,
    ) -> TauResult<()> {
        caldir::rsvp(&self.state, calendar_slug, event_id, response)
    }

    async fn sync_preview(self) -> TauResult<Vec<SyncPreview>> {
        caldir::sync_preview(&self.state).await
    }

    async fn sync(self, allow_mass_delete: Vec<String>) -> TauResult<()> {
        caldir::sync(&self.state, allow_mass_delete).await
    }

    async fn discard(self) -> TauResult<()> {
        caldir::discard(&self.state).await
    }

    async fn list_providers(self) -> TauResult<Vec<ProviderInfo>> {
        caldir::list_providers(&self.state)
    }

    async fn get_provider_connect_info(
        self,
        provider_name: String,
    ) -> TauResult<ProviderConnectInfo> {
        caldir::get_provider_connect_info(&self.state, provider_name).await
    }

    async fn check_provider_connection(
        self,
        provider_name: String,
        account: String,
    ) -> TauResult<()> {
        caldir::check_provider_connection(&self.state, provider_name, account).await
    }

    async fn connect_provider<R: Runtime>(
        self,
        app: AppHandle<R>,
        provider_name: String,
    ) -> TauResult<Vec<Calendar>> {
        caldir::connect_provider(&self.state, &opener(app), provider_name).await
    }

    async fn connect_provider_with_credentials<R: Runtime>(
        self,
        app: AppHandle<R>,
        provider_name: String,
        credentials: Vec<CredentialFieldInput>,
    ) -> TauResult<Vec<Calendar>> {
        caldir::connect_provider_with_credentials(
            &self.state,
            &opener(app),
            provider_name,
            credentials,
        )
        .await
    }

    async fn create_local_calendar(
        self,
        name: String,
        color: Option<String>,
    ) -> TauResult<Calendar> {
        caldir::create_local_calendar(&self.state, name, color)
    }

    async fn rename_calendar(self, calendar_slug: String, name: String) -> TauResult<()> {
        caldir::rename_calendar(&self.state, calendar_slug, name)
    }

    async fn set_calendar_color(self, calendar_slug: String, color: String) -> TauResult<()> {
        caldir::set_calendar_color(&self.state, calendar_slug, color)
    }

    async fn delete_calendar(self, calendar_slug: String) -> TauResult<()> {
        caldir::delete_calendar(&self.state, calendar_slug)
    }

    async fn get_caldir_settings(self) -> TauResult<CaldirSettings> {
        caldir::get_caldir_settings(&self.state)
    }
    async fn set_time_format(self, time_format: TimeFormat) -> TauResult<()> {
        caldir::set_time_format(&self.state, time_format)
    }

    async fn set_default_reminders(self, minutes: Vec<i32>) -> TauResult<()> {
        caldir::set_default_reminders(&self.state, minutes)
    }

    async fn set_default_calendar(self, slug: Option<String>) -> TauResult<()> {
        caldir::set_default_calendar(&self.state, slug)
    }

    async fn set_calendar_dir(self, path: String) -> TauResult<()> {
        caldir::set_calendar_dir(&self.state, path)
    }
}

/// Opens provider sign-in pages in the user's browser.
fn opener<R: Runtime>(app: AppHandle<R>) -> impl Fn(&str) -> Result<(), String> + Send + Sync {
    move |url| {
        app.opener()
            .open_url(url, None::<&str>)
            .map_err(|error| error.to_string())
    }
}
