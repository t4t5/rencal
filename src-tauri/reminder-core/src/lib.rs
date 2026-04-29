//! Platform-agnostic reminder loop shared by the rencal GUI (macOS/Windows) and the
//! `rencal-notifierd` daemon (Linux). The loop scans caldir for events with VALARMs,
//! computes trigger times, dedupes per event, and hands off notifications to a
//! `Notifier` impl supplied by the host.

use std::path::{Path, PathBuf};
use std::time::Duration as StdDuration;

use caldir_core::caldir::Caldir;
use caldir_core::caldir_config::TimeFormat;
use caldir_core::event::{Event, EventTime};
use chrono::{DateTime, Duration, Local, NaiveDate, TimeZone, Utc};

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

    log::debug!(
        "tick now={now} last_check={last_check:?} window_start={window_start}"
    );

    let calendars = caldir.calendars();
    log::debug!("calendars={}", calendars.len());

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

    log::debug!("fired={fired}");
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
    let start_utc = event_start_instant(&event.start)?;
    Some(start_utc - Duration::minutes(minutes_before))
}

/// Resolve an `EventTime` to the UTC instant it actually fires at *for this host*.
///
/// Diverges from `EventTime::to_utc` (which is documented as an ordering
/// projection) on two cases the user cares about for reminders:
///
/// - `Date` (all-day): local midnight on the host, not UTC midnight. A "today"
///   all-day event scheduled with a "1h before" reminder should fire at 23:00
///   local on the prior day, not at 23:00 UTC.
/// - `DateTimeFloating`: wall-clock interpreted in the host's local zone. RFC
///   5545 floating time means "9am wherever you are." `to_utc` interprets the
///   naive value as UTC instead, so a 09:00 floating event on a BST host would
///   otherwise fire at 10:00 local.
///
/// `DateTimeUtc` and `DateTimeZoned` already have an unambiguous instant —
/// defer to caldir-core for those.
fn event_start_instant(et: &EventTime) -> Option<DateTime<Utc>> {
    event_start_instant_in_zone(et, &Local)
}

fn event_start_instant_in_zone<Tz: TimeZone>(et: &EventTime, host_tz: &Tz) -> Option<DateTime<Utc>> {
    match et {
        EventTime::Date(d) => {
            let naive = d.and_hms_opt(0, 0, 0)?;
            host_tz
                .from_local_datetime(&naive)
                .single()
                .map(|l| l.with_timezone(&Utc))
        }
        EventTime::DateTimeFloating(dt) => host_tz
            .from_local_datetime(dt)
            .single()
            .map(|l| l.with_timezone(&Utc)),
        _ => et.to_utc(),
    }
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

    // Use event_start_instant (not to_utc) so a floating "9am" displays as
    // 09:00 on the host instead of being projected through UTC.
    let Some(local) = event_start_instant(et).map(|u| u.with_timezone(&Local)) else {
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

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn t(year: i32, month: u32, day: u32, hour: u32, min: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(year, month, day, hour, min, 0).unwrap()
    }

    // ---- compute_window_start --------------------------------------------

    #[test]
    fn window_start_uses_full_cap_when_no_last_check() {
        let now = t(2026, 4, 29, 12, 0);
        assert_eq!(compute_window_start(now, None), now - Duration::hours(4));
    }

    #[test]
    fn window_start_uses_last_check_when_recent() {
        let now = t(2026, 4, 29, 12, 0);
        let last = t(2026, 4, 29, 11, 0);
        assert_eq!(compute_window_start(now, Some(last)), last);
    }

    #[test]
    fn window_start_clamps_stale_last_check_to_cap() {
        let now = t(2026, 4, 29, 12, 0);
        let last = t(2026, 4, 28, 0, 0); // way more than 4h ago
        assert_eq!(compute_window_start(now, Some(last)), now - Duration::hours(4));
    }

    // ---- select_best_trigger ---------------------------------------------

    #[test]
    fn select_returns_none_when_empty() {
        let now = t(2026, 4, 29, 12, 0);
        let window_start = now - Duration::hours(1);
        let triggers: Vec<(i64, DateTime<Utc>)> = vec![];
        assert_eq!(select_best_trigger(triggers, window_start, now), None);
    }

    #[test]
    fn select_excludes_triggers_before_window() {
        let now = t(2026, 4, 29, 12, 0);
        let window_start = now - Duration::hours(1);
        let triggers = vec![(60, now - Duration::hours(2))];
        assert_eq!(select_best_trigger(triggers, window_start, now), None);
    }

    #[test]
    fn select_excludes_triggers_after_now() {
        let now = t(2026, 4, 29, 12, 0);
        let window_start = now - Duration::hours(1);
        let triggers = vec![(15, now + Duration::minutes(5))];
        assert_eq!(select_best_trigger(triggers, window_start, now), None);
    }

    #[test]
    fn select_window_start_is_exclusive() {
        // A trigger exactly at window_start belongs to the previous tick.
        let now = t(2026, 4, 29, 12, 0);
        let window_start = now - Duration::minutes(60);
        let triggers = vec![(60, window_start)];
        assert_eq!(select_best_trigger(triggers, window_start, now), None);
    }

    #[test]
    fn select_now_is_inclusive() {
        let now = t(2026, 4, 29, 12, 0);
        let window_start = now - Duration::minutes(60);
        let triggers = vec![(0, now)];
        assert_eq!(select_best_trigger(triggers, window_start, now), Some((0, now)));
    }

    #[test]
    fn select_collapses_stacked_reminders_to_latest() {
        // Catch-up: both "1h before" and "30m before" Lunch fired during a
        // missed window. We want one notification (the more recent one).
        let now = t(2026, 4, 29, 12, 0);
        let window_start = now - Duration::hours(2);
        let one_hour_before = now - Duration::hours(1);
        let thirty_min_before = now - Duration::minutes(30);
        let triggers = vec![(60, one_hour_before), (30, thirty_min_before)];
        assert_eq!(
            select_best_trigger(triggers, window_start, now),
            Some((30, thirty_min_before))
        );
    }

    #[test]
    fn select_picks_in_window_trigger_when_others_fall_outside() {
        let now = t(2026, 4, 29, 12, 0);
        let window_start = now - Duration::hours(1);
        let triggers = vec![
            (180, now - Duration::hours(3)),  // before window
            (30, now - Duration::minutes(30)), // in window
            (-30, now + Duration::minutes(30)), // future
        ];
        assert_eq!(
            select_best_trigger(triggers, window_start, now),
            Some((30, now - Duration::minutes(30)))
        );
    }

    // ---- parse_last_check -------------------------------------------------

    #[test]
    fn parse_round_trips_a_recent_timestamp() {
        let now = t(2026, 4, 29, 12, 0);
        let prev = now - Duration::minutes(5);
        let s = prev.to_rfc3339();
        assert_eq!(parse_last_check(&s, now), Some(prev));
    }

    #[test]
    fn parse_trims_whitespace() {
        let now = t(2026, 4, 29, 12, 0);
        let prev = now - Duration::minutes(5);
        let s = format!("  {}\n", prev.to_rfc3339());
        assert_eq!(parse_last_check(&s, now), Some(prev));
    }

    #[test]
    fn parse_rejects_garbage() {
        let now = t(2026, 4, 29, 12, 0);
        assert_eq!(parse_last_check("not a timestamp", now), None);
        assert_eq!(parse_last_check("", now), None);
    }

    #[test]
    fn parse_rejects_future_timestamps() {
        // Clock jumped backwards (NTP correction). Treat as no record so we
        // still catch up, rather than skipping a real window.
        let now = t(2026, 4, 29, 12, 0);
        let future = now + Duration::hours(1);
        let s = future.to_rfc3339();
        assert_eq!(parse_last_check(&s, now), None);
    }

    // ---- event_start_instant_in_zone -------------------------------------

    use chrono::{FixedOffset, NaiveDateTime};

    fn naive(year: i32, month: u32, day: u32, hour: u32, min: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(year, month, day)
            .unwrap()
            .and_hms_opt(hour, min, 0)
            .unwrap()
    }

    #[test]
    fn floating_event_uses_host_zone_not_utc() {
        // The bug we're fixing: "9am floating" on a BST host should fire at
        // 09:00 local = 08:00 UTC, not at 09:00 UTC (= 10:00 local).
        let bst = FixedOffset::east_opt(3600).unwrap();
        let nine_am_floating = EventTime::DateTimeFloating(naive(2026, 7, 15, 9, 0));
        let resolved = event_start_instant_in_zone(&nine_am_floating, &bst).unwrap();
        assert_eq!(resolved, t(2026, 7, 15, 8, 0));
    }

    #[test]
    fn floating_event_in_utc_host_round_trips() {
        let nine_am_floating = EventTime::DateTimeFloating(naive(2026, 7, 15, 9, 0));
        let resolved = event_start_instant_in_zone(&nine_am_floating, &Utc).unwrap();
        assert_eq!(resolved, t(2026, 7, 15, 9, 0));
    }

    #[test]
    fn all_day_event_uses_local_midnight_not_utc_midnight() {
        // "All-day Tuesday" on a CEST host (UTC+2) should resolve to Mon 22:00
        // UTC (= Tue 00:00 local), so a "1h before" reminder fires at Mon
        // 23:00 local — not at Mon 23:00 UTC (= Tue 01:00 local) which is
        // what to_utc would give.
        let cest = FixedOffset::east_opt(2 * 3600).unwrap();
        let tuesday = EventTime::Date(NaiveDate::from_ymd_opt(2026, 7, 14).unwrap());
        let resolved = event_start_instant_in_zone(&tuesday, &cest).unwrap();
        assert_eq!(resolved, t(2026, 7, 13, 22, 0));
    }

    #[test]
    fn utc_event_is_unchanged_by_host_zone() {
        let bst = FixedOffset::east_opt(3600).unwrap();
        let utc_event = EventTime::DateTimeUtc(t(2026, 7, 15, 14, 30));
        assert_eq!(
            event_start_instant_in_zone(&utc_event, &bst),
            Some(t(2026, 7, 15, 14, 30))
        );
    }

    #[test]
    fn zoned_event_uses_its_own_tzid_not_host_zone() {
        // Event explicitly zoned to America/Los_Angeles. Result should be the
        // same UTC instant regardless of which host_tz we resolve from.
        let zoned = EventTime::DateTimeZoned {
            datetime: naive(2026, 7, 15, 9, 0),
            tzid: "America/Los_Angeles".to_string(),
        };
        let from_utc = event_start_instant_in_zone(&zoned, &Utc).unwrap();
        let from_bst = event_start_instant_in_zone(&zoned, &FixedOffset::east_opt(3600).unwrap())
            .unwrap();
        assert_eq!(from_utc, from_bst);
        // 09:00 PDT = 16:00 UTC.
        assert_eq!(from_utc, t(2026, 7, 15, 16, 0));
    }

    #[test]
    fn floating_trigger_offset_is_in_host_zone() {
        // End-to-end: a "30m before" reminder on a 09:00 floating event in
        // BST should fire at 08:30 BST = 07:30 UTC.
        let bst = FixedOffset::east_opt(3600).unwrap();
        let nine_am = EventTime::DateTimeFloating(naive(2026, 7, 15, 9, 0));
        let start = event_start_instant_in_zone(&nine_am, &bst).unwrap();
        let trigger = start - Duration::minutes(30);
        assert_eq!(trigger, t(2026, 7, 15, 7, 30));
    }
}
