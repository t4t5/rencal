mod helpers;
mod types;

mod check_provider_connection;
mod connect_provider;
mod connect_provider_with_credentials;
mod create_event;
mod create_local_calendar;
mod delete_calendar;
mod delete_event;
mod delete_recurring_series;
mod discard;
mod get_config;
mod get_event;
mod get_provider_connect_info;
mod list_calendars;
mod list_contacts;
mod list_events;
mod list_invites;
mod list_providers;
mod rename_calendar;
mod rsvp;
mod search_events;
mod set_config;
mod split_recurring_series_at;
mod sync;
mod sync_preview;
mod update_event;

pub use types::{
    Calendar, CalendarEvent, Contact, CreateEventInput, CredentialFieldInput, ProviderConnectInfo,
    SplitRecurringSeriesInput, SyncPreview, TimeFormat, UpdateEventInput,
};

use crate::routes::TauResult;
use tauri::{AppHandle, Runtime};

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
    async fn rsvp(calendar_slug: String, event_id: String, response: String) -> TauResult<()>;

    async fn sync_preview() -> TauResult<Vec<SyncPreview>>;

    async fn sync(allow_mass_delete: Vec<String>) -> TauResult<()>;

    async fn discard() -> TauResult<()>;

    async fn list_providers() -> TauResult<Vec<String>>;

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
    async fn delete_calendar<R: Runtime>(
        app_handle: AppHandle<R>,
        calendar_slug: String,
    ) -> TauResult<()>;

    async fn get_time_format() -> TauResult<TimeFormat>;
    async fn set_time_format(time_format: TimeFormat) -> TauResult<()>;

    async fn get_default_reminders() -> TauResult<Vec<i32>>;
    async fn set_default_reminders(minutes: Vec<i32>) -> TauResult<()>;

    async fn get_default_calendar() -> TauResult<Option<String>>;
    async fn set_default_calendar(slug: Option<String>) -> TauResult<()>;

    async fn get_calendar_dir() -> TauResult<String>;
    async fn set_calendar_dir(path: String) -> TauResult<()>;
}

#[derive(Clone)]
pub struct CaldirApiImpl;

#[taurpc::resolvers]
impl CaldirApi for CaldirApiImpl {
    async fn list_calendars(self) -> TauResult<Vec<Calendar>> {
        list_calendars::handler().await
    }

    async fn list_contacts(self) -> TauResult<Vec<Contact>> {
        list_contacts::handler().await
    }

    async fn list_events(
        self,
        calendar_slugs: Vec<String>,
        start: String,
        end: String,
    ) -> TauResult<Vec<CalendarEvent>> {
        list_events::handler(calendar_slugs, start, end).await
    }

    async fn get_event(
        self,
        calendar_slug: String,
        event_id: String,
    ) -> TauResult<Option<CalendarEvent>> {
        get_event::handler(calendar_slug, event_id).await
    }

    async fn create_event(self, input: CreateEventInput) -> TauResult<CalendarEvent> {
        create_event::handler(input).await
    }

    async fn update_event(self, input: UpdateEventInput) -> TauResult<()> {
        update_event::handler(input).await
    }

    async fn delete_event(self, calendar_slug: String, event_id: String) -> TauResult<()> {
        delete_event::handler(calendar_slug, event_id).await
    }

    async fn delete_recurring_series(self, calendar_slug: String, uid: String) -> TauResult<()> {
        delete_recurring_series::handler(calendar_slug, uid).await
    }

    async fn split_recurring_series_at(
        self,
        input: SplitRecurringSeriesInput,
    ) -> TauResult<CalendarEvent> {
        split_recurring_series_at::handler(input).await
    }

    async fn search_events(
        self,
        calendar_slugs: Vec<String>,
        query: String,
    ) -> TauResult<Vec<CalendarEvent>> {
        search_events::handler(calendar_slugs, query).await
    }

    async fn list_invites(self, calendar_slugs: Vec<String>) -> TauResult<Vec<CalendarEvent>> {
        list_invites::handler(calendar_slugs).await
    }

    async fn rsvp(
        self,
        calendar_slug: String,
        event_id: String,
        response: String,
    ) -> TauResult<()> {
        rsvp::handler(calendar_slug, event_id, response).await
    }

    async fn sync_preview(self) -> TauResult<Vec<SyncPreview>> {
        sync_preview::handler().await
    }

    async fn sync(self, allow_mass_delete: Vec<String>) -> TauResult<()> {
        sync::handler(allow_mass_delete).await
    }

    async fn discard(self) -> TauResult<()> {
        discard::handler().await
    }

    async fn list_providers(self) -> TauResult<Vec<String>> {
        list_providers::handler().await
    }

    async fn get_provider_connect_info(
        self,
        provider_name: String,
    ) -> TauResult<ProviderConnectInfo> {
        get_provider_connect_info::handler(provider_name).await
    }

    async fn check_provider_connection(
        self,
        provider_name: String,
        account: String,
    ) -> TauResult<()> {
        check_provider_connection::handler(provider_name, account).await
    }

    async fn connect_provider<R: Runtime>(
        self,
        app: AppHandle<R>,
        provider_name: String,
    ) -> TauResult<Vec<Calendar>> {
        connect_provider::handler(app, provider_name).await
    }

    async fn connect_provider_with_credentials<R: Runtime>(
        self,
        app: AppHandle<R>,
        provider_name: String,
        credentials: Vec<CredentialFieldInput>,
    ) -> TauResult<Vec<Calendar>> {
        connect_provider_with_credentials::handler(app, provider_name, credentials).await
    }

    async fn create_local_calendar(
        self,
        name: String,
        color: Option<String>,
    ) -> TauResult<Calendar> {
        create_local_calendar::handler(name, color).await
    }

    async fn rename_calendar(self, calendar_slug: String, name: String) -> TauResult<()> {
        rename_calendar::handler(calendar_slug, name).await
    }

    async fn delete_calendar<R: Runtime>(
        self,
        app: AppHandle<R>,
        calendar_slug: String,
    ) -> TauResult<()> {
        delete_calendar::handler(app, calendar_slug).await
    }

    async fn get_time_format(self) -> TauResult<TimeFormat> {
        get_config::get_time_format().await
    }
    async fn set_time_format(self, time_format: TimeFormat) -> TauResult<()> {
        set_config::set_time_format(time_format).await
    }

    async fn get_default_reminders(self) -> TauResult<Vec<i32>> {
        get_config::get_default_reminders().await
    }
    async fn set_default_reminders(self, minutes: Vec<i32>) -> TauResult<()> {
        set_config::set_default_reminders(minutes).await
    }

    async fn get_default_calendar(self) -> TauResult<Option<String>> {
        get_config::get_default_calendar().await
    }
    async fn set_default_calendar(self, slug: Option<String>) -> TauResult<()> {
        set_config::set_default_calendar(slug).await
    }

    async fn get_calendar_dir(self) -> TauResult<String> {
        get_config::get_calendar_dir().await
    }
    async fn set_calendar_dir(self, path: String) -> TauResult<()> {
        set_config::set_calendar_dir(path).await
    }
}
