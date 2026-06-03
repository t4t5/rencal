use super::types::{
    Calendar, CalendarEvent, ProviderField, ProviderFieldType, RpcEventTime, rpc_time_to_core,
};
use crate::event_cache::EVENT_CACHE;
use crate::routes::TauResult;
use caldir_core::{Caldir, DateRange, Event, Status};
use chrono::{DateTime, Utc};

/// Load caldir with the bundled providers overlaid on top of any in `PATH`.
pub(super) fn load_caldir() -> TauResult<Caldir> {
    let caldir = Caldir::load().map_err(|e| e.to_string())?;

    Ok(match crate::bundled_providers_dir() {
        Some(dir) => caldir.with_bundled_providers(dir),
        None => caldir,
    })
}

pub fn is_visible(event: &Event) -> bool {
    event.status != Status::Cancelled
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

pub async fn save_connected_calendars(
    provider: &caldir_core::Provider,
    account_identifier: Option<String>,
    prefetched_calendars: Option<Vec<caldir_core::CalendarConfig>>,
) -> TauResult<Vec<Calendar>> {
    let calendar_configs = if let Some(calendars) = prefetched_calendars {
        calendars
    } else {
        let id = account_identifier.ok_or_else(|| {
            "Provider completed without an account identifier or calendars".to_string()
        })?;

        provider
            .provider_account(id)
            .list_calendars()
            .await
            .map_err(|e| format!("Failed to list calendars: {}", e))?
    };

    let mut caldir = load_caldir()?;
    let existing_connections: Vec<_> = caldir
        .connections()
        .into_iter()
        .filter_map(Result::ok)
        .collect();

    let mut calendars = Vec::new();
    let mut created_slugs = Vec::new();
    let mut first_writable_slug = None;

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
        let cal = caldir
            .create_calendar(&base_slug, Some(config))
            .map_err(|e| e.to_string())?;

        if let Some(slug) = cal.slug() {
            let slug = slug.to_string();

            if first_writable_slug.is_none() && !is_read_only {
                first_writable_slug = Some(slug.clone());
            }

            created_slugs.push(slug);
        }

        calendars.push(Calendar::from(&cal));
    }

    if caldir.config().default_calendar_slug().is_none()
        && let Some(slug) = first_writable_slug
    {
        let mut config = caldir.config().clone();
        config.set_default_calendar_slug(Some(slug));
        caldir.save_config(config).map_err(|e| e.to_string())?;
    }

    if let Err(err) = pull_created_calendar_events(&caldir, &created_slugs).await {
        log::warn!("failed to pull events after connecting provider: {err}");
    }

    Ok(calendars)
}

async fn pull_created_calendar_events(caldir: &Caldir, calendar_slugs: &[String]) -> TauResult<()> {
    if calendar_slugs.is_empty() {
        return Ok(());
    }

    let range = DateRange::default_sync_window();

    for connection in caldir.connections() {
        let mut connection = connection.map_err(|e| e.to_string())?;
        let slug = connection
            .local()
            .slug()
            .ok_or_else(|| "calendar missing slug".to_string())?
            .to_string();

        if !calendar_slugs.contains(&slug) {
            continue;
        }

        let diff = connection
            .diff(&range)
            .await
            .map_err(|e| format!("[{}] {}", slug, e))?;

        connection
            .apply_incoming_diff(&diff)
            .map_err(|e| format!("[{}] {}", slug, e))?;

        EVENT_CACHE.invalidate(&slug);
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
