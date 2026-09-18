use super::types::{
    Calendar, CalendarEvent, ProviderField, ProviderFieldType, RpcEventTime,
    core_recurrence_to_rpc, rpc_time_to_core,
};
use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};
use crate::state::AppState;
use caldir_core::{CalendarConfig, DateRange, Event, Provider, ProviderSlug, Status};
use chrono::{DateTime, Utc};

/// An owned handle to a provider binary (`Provider` is an `Arc` inside), so
/// callers can talk to it without holding the caldir guard across the await.
pub fn provider(state: &AppState, provider_name: &str) -> TauResult<Provider> {
    state
        .caldir()
        .provider(&ProviderSlug::from(provider_name))
        .map_err(RpcError::from)
        .cloned()
}

pub fn is_visible(event: &Event) -> bool {
    event.status != Status::Cancelled
}

/// Convert an event to its RPC form, resolving the master's recurrence from
/// `siblings` when the event is an override or generated occurrence.
pub fn to_calendar_event(event: &Event, calendar_slug: &str, siblings: &[Event]) -> CalendarEvent {
    let master_recurrence = if event.recurrence_id.is_some() {
        siblings
            .iter()
            .find(|e| e.uid.as_str() == event.uid.as_str() && e.recurrence.is_some())
            .and_then(|master| master.recurrence.as_ref().map(core_recurrence_to_rpc))
    } else {
        None
    };
    CalendarEvent::from_event(event, calendar_slug, master_recurrence)
}

/// Sort key that orders RpcEventTime values by their UTC instant.
/// Unparseable values sort to the very end (treated as infinitely far away).
pub fn event_time_sort_key(w: &RpcEventTime) -> DateTime<Utc> {
    rpc_time_to_core(w)
        .map(|et| et.to_utc())
        .unwrap_or_else(|_| DateTime::<Utc>::MAX_UTC)
}

/// Sort calendar events so that events closest to now appear first.
pub fn sort_by_proximity_to_now(events: &mut [CalendarEvent]) {
    let now = Utc::now().timestamp();
    events.sort_by_key(|e| (event_time_sort_key(&e.start).timestamp() - now).unsigned_abs());
}

pub fn tildify(path: &str) -> String {
    let Ok(home) = std::env::var("HOME") else {
        return path.to_string();
    };
    if home.is_empty() {
        return path.to_string();
    }
    if let Some(rest) = path.strip_prefix(&home) {
        if rest.is_empty() {
            return "~".to_string();
        }
        if rest.starts_with('/') {
            return format!("~{rest}");
        }
    }
    path.to_string()
}

pub fn map_fields(fields: Vec<caldir_core::rpc::CredentialField>) -> Vec<ProviderField> {
    use caldir_core::rpc::FieldType;
    fields
        .into_iter()
        .map(|f| ProviderField {
            id: f.id,
            label: f.label,
            field_type: match f.field_type {
                FieldType::Text => ProviderFieldType::Text,
                FieldType::Password => ProviderFieldType::Password,
                FieldType::Url => ProviderFieldType::Url,
            },
            required: f.required,
            help: f.help,
        })
        .collect()
}

pub fn build_connect_options(
    hosted: bool,
    redirect_uri: &str,
) -> serde_json::Map<String, serde_json::Value> {
    let mut options = serde_json::Map::new();
    options.insert(
        "redirect_uri".into(),
        serde_json::Value::String(redirect_uri.to_string()),
    );
    options.insert("hosted".into(), serde_json::Value::Bool(hosted));
    options
}

/// Create local calendars for a freshly connected account, pick a default
/// calendar if none is set, pull their events, and tell the webview.
pub async fn save_connected_calendars(
    state: &AppState,
    provider: &caldir_core::Provider,
    account_identifier: Option<String>,
    prefetched_calendars: Option<Vec<caldir_core::CalendarConfig>>,
) -> TauResult<Vec<Calendar>> {
    let calendar_configs = if let Some(calendars) = prefetched_calendars {
        calendars
    } else {
        let id = account_identifier.ok_or_else(|| {
            RpcError::new(
                RpcErrorKind::ProviderFailure,
                "Provider completed without an account identifier or calendars",
            )
        })?;

        provider
            .provider_account(id)
            .list_calendars()
            .await
            .map_err(|e| RpcError::from(e).context("Failed to list calendars"))?
    };

    let created = create_connected_calendars(state, calendar_configs)?;

    let needs_default = state.caldir().config().default_calendar_slug().is_none();
    if needs_default && let Some(slug) = created.first_writable_slug {
        let mut config = state.caldir().config().clone();
        config.set_default_calendar_slug(Some(slug));
        state.save_caldir_config(config)?;
    }

    if let Err(err) = pull_created_calendar_events(state, &created.slugs).await {
        log::warn!("failed to pull events after connecting provider: {err}");
    }

    state.notify_calendars_changed();

    Ok(created.calendars)
}

struct CreatedCalendars {
    calendars: Vec<Calendar>,
    slugs: Vec<String>,
    first_writable_slug: Option<String>,
}

/// Synchronous part of connecting: skips calendars that are already
/// connected and creates the rest under the current data dir.
fn create_connected_calendars(
    state: &AppState,
    calendar_configs: Vec<CalendarConfig>,
) -> TauResult<CreatedCalendars> {
    let caldir = state.caldir();
    let existing_connections: Vec<_> = caldir
        .connections()
        .into_iter()
        .filter_map(Result::ok)
        .collect();

    let mut created = CreatedCalendars {
        calendars: Vec::new(),
        slugs: Vec::new(),
        first_writable_slug: None,
    };

    for config in calendar_configs {
        let already_connected = config.remote_config().is_some_and(|remote_cfg| {
            existing_connections
                .iter()
                .any(|conn| conn.local().remote_config() == Some(remote_cfg))
        });

        if already_connected {
            continue;
        }

        let is_read_only = config.read_only() == Some(true);
        let base_slug = caldir_core::Calendar::base_slug_for(config.name());
        let cal = caldir.create_calendar(&base_slug, Some(config))?;

        if let Some(slug) = cal.slug() {
            let slug = slug.to_string();

            if created.first_writable_slug.is_none() && !is_read_only {
                created.first_writable_slug = Some(slug.clone());
            }

            created.slugs.push(slug);
        }

        created.calendars.push(Calendar::from(&cal));
    }

    Ok(created)
}

async fn pull_created_calendar_events(
    state: &AppState,
    calendar_slugs: &[String],
) -> TauResult<()> {
    if calendar_slugs.is_empty() {
        return Ok(());
    }

    let range = DateRange::default_sync_window();
    let connections = state.caldir().connections();

    for connection in connections {
        let mut connection = connection?;
        let slug = connection
            .local()
            .slug()
            .ok_or_else(|| RpcError::new(RpcErrorKind::Internal, "calendar missing slug"))?
            .to_string();

        if !calendar_slugs.contains(&slug) {
            continue;
        }

        let diff = connection
            .diff(&range)
            .await
            .map_err(|e| RpcError::from(e).context(format!("[{slug}]")))?;

        connection
            .apply_incoming_diff(&diff)
            .map_err(|e| RpcError::from(e).context(format!("[{slug}]")))?;

        state.invalidate_events(&slug);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use caldir_core::EventTime;
    use chrono::NaiveDate;

    #[test]
    fn confirmed_events_are_visible_cancelled_are_not() {
        let start = EventTime::Date(NaiveDate::from_ymd_opt(2026, 5, 27).unwrap());
        let confirmed = Event::new("Standup", start.clone());
        let mut cancelled = Event::new("yolo", start);
        cancelled.status = Status::Cancelled;

        assert!(is_visible(&confirmed));
        assert!(!is_visible(&cancelled));
    }
}
