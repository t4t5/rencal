use std::time::Duration as StdDuration;

use std::path::PathBuf;

use caldir_core::caldir::Caldir;
use caldir_core::event::Event;
use chrono::{DateTime, Duration, Utc};
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

/// Bounded so a long-stale machine doesn't fire dozens of reminders at once
/// for events the user has already moved past.
const CATCHUP_CAP_HOURS: i64 = 1;

/// Runs the reminder check loop aligned to minute boundaries.
pub async fn run_reminder_loop(app: AppHandle) {
    loop {
        // Sleep until the start of the next minute
        let now = Utc::now();
        let secs_remaining = 60 - now.timestamp() % 60;
        tokio::time::sleep(StdDuration::from_secs(secs_remaining as u64)).await;

        if let Err(e) = check_and_notify(&app) {
            eprintln!("Reminder check error: {e}");
        }
    }
}

/// Scan all calendars for reminders due since the last check and fire notifications.
///
/// Window is `(last_check, now]`, capped at `CATCHUP_CAP_HOURS`. This lets a
/// reminder fire on the first tick after rencal starts up or the laptop wakes,
/// even though the trigger time itself was missed.
fn check_and_notify(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let caldir = Caldir::load()?;
    let now = Utc::now();

    // First-run fallback: 60s trailing window, so a reminder that fired just
    // before rencal launched is still caught.
    let last_check = read_last_check_time().unwrap_or_else(|| now - Duration::seconds(60));
    let window_start = std::cmp::max(last_check, now - Duration::hours(CATCHUP_CAP_HOURS));

    // 7 days forward covers "1 week before" reminders.
    let range_start = std::cmp::min(window_start, now - Duration::hours(1));
    let range_end = now + Duration::days(7);

    for calendar in caldir.calendars() {
        let events = match calendar.events_in_range(range_start, range_end) {
            Ok(events) => events,
            Err(_) => continue,
        };

        for event in &events {
            for reminder in event.reminders.iter() {
                if let Some(trigger_time) = compute_trigger_time(event, reminder.minutes) {
                    // Exclusive on the left: the previous tick already covered
                    // anything at exactly `last_check`, so including it here
                    // would double-fire on tick boundaries.
                    if trigger_time > window_start && trigger_time <= now {
                        send_notification(app, event, reminder.minutes)?;
                    }
                }
            }
        }
    }

    write_last_check_time(now);
    Ok(())
}

fn last_check_path() -> Option<PathBuf> {
    Some(dirs::cache_dir()?.join("rencal").join("last-reminder-check"))
}

fn read_last_check_time() -> Option<DateTime<Utc>> {
    let path = last_check_path()?;
    let contents = std::fs::read_to_string(&path).ok()?;
    let parsed = DateTime::parse_from_rfc3339(contents.trim()).ok()?;
    let parsed = parsed.with_timezone(&Utc);
    // Guard against a clock that jumped backwards (NTP correction, manual
    // change). Treat a future last_check as if we had no record.
    if parsed > Utc::now() {
        return None;
    }
    Some(parsed)
}

fn write_last_check_time(now: DateTime<Utc>) {
    let Some(path) = last_check_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        if std::fs::create_dir_all(parent).is_err() {
            return;
        }
    }
    let _ = std::fs::write(&path, now.to_rfc3339());
}

fn compute_trigger_time(event: &Event, minutes_before: i64) -> Option<chrono::DateTime<Utc>> {
    let start_utc = event.start.to_utc()?;
    Some(start_utc - Duration::minutes(minutes_before))
}

fn send_notification(
    app: &AppHandle,
    event: &Event,
    minutes_before: i64,
) -> Result<(), Box<dyn std::error::Error>> {
    let body = format_body(event, minutes_before);

    let mut builder = app
        .notification()
        .builder()
        .title(&event.summary)
        .body(&body)
        .sound("default");

    if let Some(icon) = icon_path(app) {
        builder = builder.icon(icon.to_string_lossy());
    }

    builder.show()?;

    Ok(())
}

fn icon_path(app: &AppHandle) -> Option<PathBuf> {
    if cfg!(debug_assertions) {
        Some(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("icons/128x128.png"))
    } else {
        app.path()
            .resolve("icons/128x128.png", tauri::path::BaseDirectory::Resource)
            .ok()
    }
}

fn format_body(event: &Event, minutes_before: i64) -> String {
    let time_str = if minutes_before == 0 {
        "Now".to_string()
    } else if minutes_before == 1 {
        "In 1 minute".to_string()
    } else if minutes_before < 60 {
        format!("In {} minutes", minutes_before)
    } else if minutes_before == 60 {
        "In 1 hour".to_string()
    } else if minutes_before % 60 == 0 {
        format!("In {} hours", minutes_before / 60)
    } else {
        let hours = minutes_before / 60;
        let mins = minutes_before % 60;
        format!("In {}h {}m", hours, mins)
    };

    match &event.location {
        Some(loc) if !loc.is_empty() => format!("{}\n{}", time_str, loc),
        _ => time_str,
    }
}
