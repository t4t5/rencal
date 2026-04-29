use std::time::Duration as StdDuration;

use std::path::PathBuf;

use caldir_core::caldir::Caldir;
use caldir_core::event::Event;
use chrono::{DateTime, Duration, Utc};
use tauri::{AppHandle, Manager};
#[cfg(not(target_os = "linux"))]
use tauri_plugin_notification::NotificationExt;

/// Bounded so a long-stale machine doesn't fire dozens of reminders at once
/// for events the user has already moved past.
const CATCHUP_CAP_HOURS: i64 = 4;

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

    // First run / cache wipe: optimistically use the full catch-up window so
    // a freshly-launched rencal still fires recently-missed reminders. The cap
    // itself bounds the spam.
    let cap_start = now - Duration::hours(CATCHUP_CAP_HOURS);
    let last_check = read_last_check_time().unwrap_or(cap_start);
    let window_start = std::cmp::max(last_check, cap_start);

    // 7 days forward covers "1 week before" reminders.
    let range_start = std::cmp::min(window_start, now - Duration::hours(1));
    let range_end = now + Duration::days(7);

    eprintln!(
        "[reminder] tick now={now} last_check={last_check} window_start={window_start}"
    );

    let calendars = caldir.calendars();
    eprintln!("[reminder]   calendars={}", calendars.len());

    let mut fired = 0;
    for calendar in &calendars {
        let events = match calendar.events_in_range(range_start, range_end) {
            Ok(events) => events,
            Err(e) => {
                eprintln!("[reminder]   [{}] events_in_range err: {e}", calendar.slug);
                continue;
            }
        };

        for event in &events {
            // If multiple reminders for the same event fall in this tick's
            // window (typical on catch-up: e.g. both "1h before" and "30m
            // before" Lunch when rencal launched after both fired), collapse
            // to the most recent trigger so the user sees one notification
            // per event, not a stack of stale ones.
            // Exclusive `> window_start` so we don't double-fire at tick
            // boundaries — the previous tick already covered last_check.
            let best = event
                .reminders
                .iter()
                .filter_map(|r| {
                    let trigger = compute_trigger_time(event, r.minutes)?;
                    (trigger > window_start && trigger <= now).then_some((r.minutes, trigger))
                })
                .max_by_key(|(_, t)| *t);

            if let Some((minutes, trigger)) = best {
                eprintln!(
                    "[reminder]   FIRE \"{}\" {minutes}min before (trigger={trigger})",
                    event.summary
                );
                match send_notification(app, event, minutes) {
                    Ok(()) => fired += 1,
                    Err(e) => eprintln!("[reminder]   send err: {e}"),
                }
            }
        }
    }

    eprintln!("[reminder]   fired={fired}");
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
    let title = event.summary.clone();
    let icon = icon_path(app).map(|p| p.to_string_lossy().into_owned());

    // On Linux, tauri-plugin-notification → notify-rust uses zbus with the
    // async-io runtime, which panics ("Cannot start a runtime from within a
    // runtime") when invoked from any tokio context — and the plugin always
    // re-spawns the call onto Tauri's tokio runtime, so we can't escape it
    // from the call site. Shell out to notify-send instead; it goes to the
    // same D-Bus notification daemon (mako, dunst, etc.) and has no runtime.
    #[cfg(target_os = "linux")]
    {
        let _ = app;
        std::thread::spawn(move || {
            let mut cmd = std::process::Command::new("notify-send");
            cmd.arg("--app-name=Rencal");
            if let Some(icon) = icon {
                cmd.arg(format!("--icon={icon}"));
            }
            cmd.arg(&title).arg(&body);
            match cmd.status() {
                Ok(s) if !s.success() => eprintln!("[reminder] notify-send {s}"),
                Err(e) => eprintln!("[reminder] notify-send err: {e}"),
                _ => {}
            }
        });
    }

    #[cfg(not(target_os = "linux"))]
    {
        let app = app.clone();
        std::thread::spawn(move || {
            let mut builder = app
                .notification()
                .builder()
                .title(&title)
                .body(&body)
                .sound("default");
            if let Some(icon) = icon {
                builder = builder.icon(icon);
            }
            if let Err(e) = builder.show() {
                eprintln!("[reminder] show err: {e}");
            }
        });
    }

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
