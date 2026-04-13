use std::time::Duration as StdDuration;

use std::path::PathBuf;

use caldir_core::caldir::Caldir;
use caldir_core::event::Event;
use chrono::{Duration, Utc};
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

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

/// Scan all calendars for reminders due in the last 60 seconds and fire notifications.
fn check_and_notify(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let caldir = Caldir::load()?;
    let now = Utc::now();
    let window_start = now - Duration::seconds(60);

    // Look at events starting within the next 7 days (covers reminders like "1 week before")
    let range_start = now - Duration::hours(1);
    let range_end = now + Duration::days(7);

    for calendar in caldir.calendars() {
        let events = match calendar.events_in_range(range_start, range_end) {
            Ok(events) => events,
            Err(_) => continue,
        };

        for event in &events {
            for reminder in event.reminders.iter() {
                if let Some(trigger_time) = compute_trigger_time(event, reminder.minutes) {
                    if trigger_time >= window_start && trigger_time <= now {
                        send_notification(app, event, reminder.minutes)?;
                    }
                }
            }
        }
    }

    Ok(())
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
