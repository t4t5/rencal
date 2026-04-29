//! Platform-agnostic reminder loop shared by the rencal GUI (macOS/Windows) and the
//! `rencal-notifierd` daemon (Linux). The loop scans caldir for events with VALARMs,
//! computes trigger times, dedupes per event, and hands off notifications to a
//! `Notifier` impl supplied by the host.

use std::path::{Path, PathBuf};
use std::time::Duration as StdDuration;

use caldir_core::caldir::Caldir;
use caldir_core::caldir_config::TimeFormat;
use caldir_core::event::{Event, EventTime};
use chrono::{DateTime, Duration, Local, NaiveDate, Utc};

/// Bounded so a long-stale machine doesn't fire dozens of reminders at once
/// for events the user has already moved past.
const CATCHUP_CAP_HOURS: i64 = 4;

/// Host-provided notification sink. Implementations should not block —
/// spawn off the tick thread if the underlying call is slow.
pub trait Notifier: Send + Sync + 'static {
    fn notify(&self, title: &str, body: &str, icon: Option<&Path>);
}

/// Linux notify-send fallback. Used by both the daemon and (when the daemon
/// isn't active) the GUI. Sits on the same D-Bus notification spec as
/// `tauri-plugin-notification` but avoids the zbus/tokio runtime collision —
/// see `docs/notifications.md` for why.
#[cfg(target_os = "linux")]
pub struct NotifySendNotifier;

#[cfg(target_os = "linux")]
impl Notifier for NotifySendNotifier {
    fn notify(&self, title: &str, body: &str, icon: Option<&Path>) {
        let title = title.to_string();
        let body = body.to_string();
        let icon = icon.map(|p| p.to_string_lossy().into_owned());
        std::thread::spawn(move || {
            let mut cmd = std::process::Command::new("notify-send");
            cmd.arg("--app-name=Rencal");
            if let Some(icon) = icon {
                cmd.arg(format!("--icon={icon}"));
            }
            cmd.arg(&title).arg(&body);
            match cmd.status() {
                Ok(s) if !s.success() => log::warn!("notify-send {s}"),
                Err(e) => log::warn!("notify-send err: {e}"),
                _ => {}
            }
        });
    }
}

/// Runs the reminder check loop aligned to minute boundaries.
/// Fires once immediately on entry so a freshly-launched host (GUI or daemon)
/// fires any catch-up reminders right away instead of waiting up to ~60s.
pub async fn run_reminder_loop<N: Notifier>(notifier: N, icon: Option<PathBuf>) {
    if let Err(e) = check_and_notify(&notifier, icon.as_deref()) {
        log::error!("Reminder check error: {e}");
    }

    loop {
        let now = Utc::now();
        let secs_remaining = 60 - now.timestamp() % 60;
        tokio::time::sleep(StdDuration::from_secs(secs_remaining as u64)).await;

        if let Err(e) = check_and_notify(&notifier, icon.as_deref()) {
            log::error!("Reminder check error: {e}");
        }
    }
}

/// Scan all calendars for reminders due since the last check and fire notifications.
///
/// Window is `(last_check, now]`, capped at `CATCHUP_CAP_HOURS`. This lets a
/// reminder fire on the first tick after the host starts up or the laptop wakes,
/// even though the trigger time itself was missed.
pub fn check_and_notify(
    notifier: &dyn Notifier,
    icon: Option<&Path>,
) -> Result<(), Box<dyn std::error::Error>> {
    let caldir = Caldir::load()?;
    let now = Utc::now();
    let time_format = caldir.config().time_format;

    let last_check = read_last_check_time(now);
    let window_start = compute_window_start(now, last_check);

    // 7 days forward covers "1 week before" reminders.
    let range_start = std::cmp::min(window_start, now - Duration::hours(1));
    let range_end = now + Duration::days(7);

    log::info!(
        "tick now={now} last_check={last_check:?} window_start={window_start}"
    );

    let calendars = caldir.calendars();
    log::info!("calendars={}", calendars.len());

    let mut fired = 0;
    for calendar in &calendars {
        let events = match calendar.events_in_range(range_start, range_end) {
            Ok(events) => events,
            Err(e) => {
                log::warn!("[{}] events_in_range err: {e}", calendar.slug);
                continue;
            }
        };

        for event in &events {
            let triggers = event
                .reminders
                .iter()
                .filter_map(|r| Some((r.minutes, compute_trigger_time(event, r.minutes)?)));

            if let Some((minutes, trigger)) = select_best_trigger(triggers, window_start, now) {
                log::info!(
                    "FIRE \"{}\" {minutes}min before (trigger={trigger})",
                    event.summary
                );
                let body = format_body(event, time_format, Local::now());
                notifier.notify(&event.summary, &body, icon);
                fired += 1;
            }
        }
    }

    log::info!("fired={fired}");
    write_last_check_time(now);
    Ok(())
}

/// Lower bound of the catch-up window. Optimistically uses the full
/// `CATCHUP_CAP_HOURS` when there's no `last_check` (first run / cache wipe)
/// so a freshly-launched host still fires recently-missed reminders; the cap
/// bounds the spam. When `last_check` is set, clamp it to no earlier than
/// `now - cap` so a long-stale machine doesn't fire dozens of stale reminders.
fn compute_window_start(
    now: DateTime<Utc>,
    last_check: Option<DateTime<Utc>>,
) -> DateTime<Utc> {
    let cap_start = now - Duration::hours(CATCHUP_CAP_HOURS);
    let last_check = last_check.unwrap_or(cap_start);
    std::cmp::max(last_check, cap_start)
}

/// Pick the latest reminder trigger in `(window_start, now]` for one event.
///
/// Window is exclusive on the left (the previous tick already covered
/// anything at exactly `last_check`) and inclusive on the right (`now` itself
/// is part of this tick).
///
/// When multiple reminders for the same event fall in the same tick's window
/// (typical on catch-up: e.g. both "1h before" and "30m before" Lunch when
/// the host launched after both fired), collapse to the most recent trigger
/// so the user sees one notification per event, not a stack of stale ones.
fn select_best_trigger(
    triggers: impl IntoIterator<Item = (i64, DateTime<Utc>)>,
    window_start: DateTime<Utc>,
    now: DateTime<Utc>,
) -> Option<(i64, DateTime<Utc>)> {
    triggers
        .into_iter()
        .filter(|(_, t)| *t > window_start && *t <= now)
        .max_by_key(|(_, t)| *t)
}

fn last_check_path() -> Option<PathBuf> {
    Some(dirs::cache_dir()?.join("rencal").join("last-reminder-check"))
}

fn read_last_check_time(now: DateTime<Utc>) -> Option<DateTime<Utc>> {
    let path = last_check_path()?;
    let contents = std::fs::read_to_string(&path).ok()?;
    parse_last_check(&contents, now)
}

/// Parse a persisted `last_check` timestamp. Returns `None` for malformed
/// input or for any value that's after `now` — guards against a clock that
/// jumped backwards (NTP correction, manual change), in which case we'd
/// rather act as if there's no record than skip a real reminder window.
fn parse_last_check(contents: &str, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
    let parsed = DateTime::parse_from_rfc3339(contents.trim())
        .ok()?
        .with_timezone(&Utc);
    (parsed <= now).then_some(parsed)
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

fn compute_trigger_time(event: &Event, minutes_before: i64) -> Option<DateTime<Utc>> {
    let start_utc = event.start.to_utc()?;
    Some(start_utc - Duration::minutes(minutes_before))
}

/// Build the notification body. Shows the event's absolute start time
/// (in the host's local zone) rather than the static "in N minutes"
/// reminder offset — a delayed catch-up notification for a past event
/// would otherwise lie about how soon it starts.
fn format_body(event: &Event, time_format: TimeFormat, now: DateTime<Local>) -> String {
    let time_str = format_event_time(&event.start, time_format, now);

    match &event.location {
        Some(loc) if !loc.is_empty() => format!("{}\n{}", time_str, loc),
        _ => time_str,
    }
}

fn format_event_time(et: &EventTime, time_format: TimeFormat, now: DateTime<Local>) -> String {
    let today = now.date_naive();

    if let EventTime::Date(d) = et {
        return format_relative_date(*d, today);
    }

    let Some(local) = et.to_utc().map(|u| u.with_timezone(&Local)) else {
        return String::new();
    };

    let time_part = match time_format {
        TimeFormat::H24 => local.format("%H:%M").to_string(),
        TimeFormat::H12 => local.format("%-I:%M %p").to_string(),
    };

    let event_day = local.date_naive();
    if event_day == today {
        time_part
    } else if Some(event_day) == today.succ_opt() {
        format!("Tomorrow at {time_part}")
    } else if Some(event_day) == today.pred_opt() {
        format!("Yesterday at {time_part}")
    } else {
        format!("{} at {time_part}", local.format("%a, %b %-d"))
    }
}

fn format_relative_date(date: NaiveDate, today: NaiveDate) -> String {
    if date == today {
        "Today".to_string()
    } else if Some(date) == today.succ_opt() {
        "Tomorrow".to_string()
    } else if Some(date) == today.pred_opt() {
        "Yesterday".to_string()
    } else {
        date.format("%a, %b %-d").to_string()
    }
}
