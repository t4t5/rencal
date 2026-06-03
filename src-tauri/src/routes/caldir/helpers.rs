use super::types::{
    Calendar, CalendarEvent, ProviderField, ProviderFieldType, RpcEventTime, rpc_time_to_core,
};
use crate::routes::TauResult;
use caldir_core::{Caldir, Event, Status};
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

/// Submit credentials to provider, list calendars, and save configs locally.
pub async fn save_provider_calendars(
    provider: &caldir_core::Provider,
    options: serde_json::Map<String, serde_json::Value>,
    credentials: serde_json::Map<String, serde_json::Value>,
) -> TauResult<Vec<Calendar>> {
    use caldir_core::rpc::ConnectResponse;

    let connect_response = provider
        .connect(options, credentials)
        .await
        .map_err(|e| format!("Connect failed: {}", e))?;

    let account_identifier = match connect_response {
        ConnectResponse::Done {
            account_identifier, ..
        } => account_identifier.ok_or_else(|| {
            "Provider completed without returning an account identifier".to_string()
        })?,
        _ => return Err("Provider did not complete authentication".to_string()),
    };

    let provider_account = provider.provider_account(account_identifier);

    let calendar_configs = provider_account
        .list_calendars()
        .await
        .map_err(|e| format!("Failed to list calendars: {}", e))?;

    let caldir = load_caldir()?;
    let mut calendars = Vec::new();
    for config in calendar_configs {
        let base_slug = caldir_core::Calendar::base_slug_for(config.name());
        let cal = caldir
            .create_calendar(&base_slug, Some(config))
            .map_err(|e| e.to_string())?;
        calendars.push(Calendar::from(&cal));
    }

    Ok(calendars)
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
