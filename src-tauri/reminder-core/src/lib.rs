//! Platform-agnostic reminder loop shared by the rencal GUI (macOS/Windows) and the
//! `rencal-notifierd` daemon (Linux). The loop scans caldir for events with VALARMs,
//! computes trigger times, dedupes per event, and hands off notifications to a
//! `Notifier` impl supplied by the host.

mod delivered_cache;

use std::path::{Path, PathBuf};
use std::time::Duration as StdDuration;

use caldir_core::{Caldir, Event, EventTime, ParticipationStatus, Status, TimeFormat};
use chrono::{DateTime, Duration, Local, NaiveDate, Utc};
use rencal_config::RencalConfig;
use url::Url;

use delivered_cache::{DeliveredCache, DeliveryKey};

/// Bounded so a long-stale machine doesn't fire dozens of reminders at once
/// for events the user has already moved past.
const CATCHUP_CAP_HOURS: i64 = 4;

/// Largest "before-start" reminder offset we honor (4 weeks, matching Google
/// Calendar's UI cap). Drives both how far ahead `events_in_range` scans and
/// how reminders with absurdly large offsets are filtered out.
const MAX_REMINDER_BEFORE_MINUTES: i64 = 28 * 24 * 60;

/// Largest "after-start" reminder offset we honor. Caldir parses iCal
/// `TRIGGER:PT8H` (Google's default for all-day events: "fire at 08:00 on the
/// day of the event") as a negative `minutes` value. 24h covers same-day
/// after-midnight patterns without dragging the scan window unreasonably far back.
const MAX_REMINDER_AFTER_MINUTES: i64 = 24 * 60;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReminderNotification {
    pub title: String,
    pub body: String,
    pub event_url: String,
}

/// Host-provided notification sink. Implementations should not block — spawn
/// off the tick thread if the underlying call is slow. `event_url` identifies
/// the exact event (including its recurrence ID) to open when clicked.
pub trait Notifier: Send + Sync + 'static {
    fn notify(&self, notification: &ReminderNotification, icon: Option<&Path>);
}

/// Linux notify-send fallback. Used by both the daemon and (when the daemon
/// isn't active) the GUI. Sits on the same D-Bus notification spec as
/// `tauri-plugin-notification` but avoids the zbus/tokio runtime collision —
/// see `docs/notifications.md` for why.
#[cfg(target_os = "linux")]
pub struct NotifySendNotifier;

#[cfg(target_os = "linux")]
impl Notifier for NotifySendNotifier {
    fn notify(&self, notification: &ReminderNotification, icon: Option<&Path>) {
        let notification = notification.clone();
        let icon = icon.map(|p| p.to_string_lossy().into_owned());
        std::thread::spawn(move || {
            match notify_send_command(&notification, icon.as_deref(), true).output() {
                Ok(output) if output.status.success() => {
                    if String::from_utf8_lossy(&output.stdout).trim() == "default" {
                        open_event_url(&notification.event_url);
                    }
                }
                Ok(output) => {
                    // Older notify-send versions do not support actions. Still
                    // deliver the reminder, albeit without click handling.
                    log::warn!(
                        "notify-send action failed {}; retrying without action",
                        output.status
                    );
                    match notify_send_command(&notification, icon.as_deref(), false).status() {
                        Ok(status) if !status.success() => log::warn!("notify-send {status}"),
                        Err(error) => log::warn!("notify-send err: {error}"),
                        _ => {}
                    }
                }
                Err(error) => log::warn!("notify-send err: {error}"),
            }
        });
    }
}

#[cfg(target_os = "linux")]
fn notify_send_command(
    notification: &ReminderNotification,
    icon: Option<&str>,
    with_action: bool,
) -> std::process::Command {
    let mut command = std::process::Command::new("notify-send");
    command.arg("--app-name=rencal");
    // Persist until dismissed — event reminders are easy to miss at the
    // daemon's default 5s timeout (mako/dunst). 0 = never expire.
    command.arg("--expire-time=0");
    if with_action {
        // `default` is the FreeDesktop action invoked by clicking the body.
        // notify-send implies --wait and prints the chosen action to stdout.
        command.arg("--action=default=Open event");
    }
    if let Some(icon) = icon {
        command.arg(format!("--icon={icon}"));
    }
    command.arg(&notification.title).arg(&notification.body);
    command
}

#[cfg(target_os = "linux")]
fn open_event_url(event_url: &str) {
    for (opener, args) in [("gio", &["open"][..]), ("xdg-open", &[][..])] {
        match std::process::Command::new(opener)
            .args(args)
            .arg(event_url)
            .status()
        {
            Ok(status) if status.success() => return,
            Ok(status) => log::warn!("{opener} failed to open reminder event: {status}"),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => log::warn!("{opener} failed to open reminder event: {error}"),
        }
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

/// Scan all calendars for reminders due in the catch-up window and fire
/// notifications for any not yet delivered.
///
/// Window is `(now - CATCHUP_CAP_HOURS, now]`. The per-reminder cache
/// (`DeliveredCache`) is the only thing that prevents re-firing — that
/// closes the race where an event lands in caldir *after* a tick has
/// already passed its trigger time (sync, manual create, file-watcher
/// pickup). The 4h cap bounds how loud a freshly-launched host gets.
pub fn check_and_notify(
    notifier: &dyn Notifier,
    icon: Option<&Path>,
) -> Result<(), Box<dyn std::error::Error>> {
    let now = Utc::now();
    let notifications_enabled = RencalConfig::load().notifications_enabled;

    let cache_path = delivered_cache_path();
    let mut cache = cache_path
        .as_deref()
        .map(DeliveredCache::load)
        .unwrap_or_default();

    let cutoff = now - Duration::hours(CATCHUP_CAP_HOURS);
    cache.evict_older_than(cutoff);

    let caldir = Caldir::load()?;
    let time_format = caldir.config().time_format();
    let default_reminders: Vec<i64> = caldir
        .config()
        .default_reminders()
        .unwrap_or_default()
        .into_iter()
        .map(|r| r.minutes_before_start)
        .collect();

    // Scan range is over event *start* times, but reminders fire at
    // `start - minutes_before`. To cover every trigger that could land in
    // `(cutoff, now]`, widen the start-time scan by the supported
    // before/after offsets:
    //   - A "max-before" reminder fires now when start = now + max_before.
    //   - A "max-after" alarm fires at cutoff when start = cutoff - max_after.
    let range_start = cutoff - Duration::minutes(MAX_REMINDER_AFTER_MINUTES);
    let range_end = now + Duration::minutes(MAX_REMINDER_BEFORE_MINUTES);

    let calendar_results = caldir.calendars();
    log::debug!(
        "tick now={now} cutoff={cutoff} calendars={}",
        calendar_results.len()
    );

    let mut events = Vec::new();
    for cal_result in calendar_results {
        let calendar = match cal_result {
            Ok(c) => c,
            Err(e) => {
                log::warn!("calendar load err: {e}");
                continue;
            }
        };
        let account_email = calendar.remote_email().map(str::to_owned);
        match calendar.expanded_events_in_range(range_start, range_end) {
            Ok(es) => events.extend(
                es.into_iter()
                    .filter(|event| should_remind(event, account_email.as_deref())),
            ),
            Err(e) => {
                let slug = calendar.slug().unwrap_or("?");
                log::warn!("[{slug}] expanded_events_in_range err: {e}");
            }
        }
    }

    let fired = process_reminders(
        now,
        cutoff,
        &events,
        &default_reminders,
        &mut cache,
        notifier,
        notifications_enabled,
        icon,
        time_format,
    );

    log::debug!("fired={fired}");
    if let Some(path) = cache_path {
        cache.save(&path);
    }
    Ok(())
}

/// Pure decision logic — no I/O, no `Utc::now()`, no caldir loading.
/// Walks `events`, picks the latest trigger in `(cutoff, now]` per event,
/// fires it through `notifier` if not already in `cache`, and records the
/// fire in `cache` (whether or not we actually called `notify`, so that
/// disabling notifications doesn't queue up a 4h replay on re-enable).
///
/// Events carrying their own VALARMs use those. Timed events with *no*
/// VALARM fall back to `default_reminders` (caldir's "Default reminders"
/// setting, in minutes before start) — see `reminder_offsets`.
///
/// Returns the number of `notifier.notify` calls made.
#[allow(clippy::too_many_arguments)]
fn process_reminders(
    now: DateTime<Utc>,
    cutoff: DateTime<Utc>,
    events: &[Event],
    default_reminders: &[i64],
    cache: &mut DeliveredCache,
    notifier: &dyn Notifier,
    notifications_enabled: bool,
    icon: Option<&Path>,
    time_format: TimeFormat,
) -> usize {
    let mut fired = 0;

    for event in events {
        let summary_str = event.summary.as_deref().unwrap_or("");
        let triggers = reminder_offsets(event, default_reminders)
            .into_iter()
            .filter_map(|minutes| {
                if !is_supported_offset(minutes) {
                    log::debug!(
                        "skipping out-of-range reminder ({minutes}min) on \"{}\"",
                        summary_str
                    );
                    return None;
                }
                Some((minutes, compute_trigger_time(event, minutes)?))
            });

        let Some((minutes, trigger)) = select_best_trigger(triggers, cutoff, now) else {
            continue;
        };

        let key = DeliveryKey {
            event_id: event.event_instance_id().to_string(),
            trigger,
        };
        if !cache.insert(key) {
            // Already delivered (or already marked delivered while disabled).
            continue;
        }

        if !notifications_enabled {
            log::debug!(
                "notifications disabled — recorded \"{}\" {minutes}min trigger without firing",
                summary_str
            );
            continue;
        }

        log::info!(
            "FIRE \"{}\" {minutes}min before (trigger={trigger})",
            summary_str
        );
        let notification = ReminderNotification {
            title: summary_str.to_string(),
            body: format_body(event, time_format, Local::now()),
            event_url: event_deep_link(event),
        };
        notifier.notify(&notification, icon);
        fired += 1;
    }

    fired
}

fn event_deep_link(event: &Event) -> String {
    let mut url = Url::parse("rencal://event").expect("static event deep-link URL must be valid");
    let instance_id = event.event_instance_id();
    let uid = instance_id.uid().as_str();

    {
        let mut query = url.query_pairs_mut();
        query.append_pair("uid", uid);
        if instance_id.recurrence_id().is_some() {
            let instance = instance_id.to_string();
            let recurrence_id = instance
                .strip_prefix(uid)
                .and_then(|suffix| suffix.strip_prefix("__"))
                .expect("recurring event instance IDs contain a recurrence suffix");
            query.append_pair("recurrence-id", recurrence_id);
        }
    }

    url.into()
}

/// Pick the latest reminder trigger in `(window_start, now]` for one event.
///
/// Window is exclusive on the left (anything at exactly the catch-up cutoff is
/// intentionally too old) and inclusive on the right (`now` itself is part of
/// this tick).
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

/// The reminder offsets (minutes before start) to consider for `event`.
///
/// An event's own VALARMs always win. When it has none, timed events fall
/// back to the user's default reminders — this is what makes meetings synced
/// from providers that don't materialize their calendar-level default
/// reminder into the event (e.g. Google) still notify. All-day events are
/// left alone: "10 minutes before midnight" is never what anyone wants for a
/// birthday or holiday, and the default-reminder setting is expressed in
/// minutes-before-start, which only makes sense for a real start time.
fn reminder_offsets(event: &Event, default_reminders: &[i64]) -> Vec<i64> {
    if !event.reminders.is_empty() {
        return event
            .reminders
            .iter()
            .map(|r| r.minutes_before_start)
            .collect();
    }
    if matches!(event.start, EventTime::Date(_)) {
        return Vec::new();
    }
    default_reminders.to_vec()
}

fn should_remind(event: &Event, account_email: Option<&str>) -> bool {
    if event.status == Status::Cancelled {
        return false;
    }

    // If user has no email address, always remind:
    let Some(account_email) = account_email else {
        return true;
    };

    // If they have email address,
    // find their attendance status:
    let user_attendee = event
        .attendees
        .iter()
        .find(|attendee| attendee.email.eq_ignore_ascii_case(account_email));

    // If user is not in attendee list -> remind (they might use different email)
    // If user is in list -> remind (unless they've explicitly declined)
    user_attendee.is_none_or(|attendee| attendee.status != Some(ParticipationStatus::Declined))
}

fn delivered_cache_path() -> Option<PathBuf> {
    Some(
        dirs::cache_dir()?
            .join("rencal")
            .join("delivered-reminders.json"),
    )
}

fn compute_trigger_time(event: &Event, minutes_before: i64) -> Option<DateTime<Utc>> {
    let start_utc = event.start.to_local_tz(&Local).with_timezone(&Utc);
    Some(start_utc - Duration::minutes(minutes_before))
}

/// Whether a reminder's `minutes` offset (positive = before start,
/// negative = after start) is within the range the loop scans for.
/// Anything outside is dropped so we don't fire reminders the scan
/// window can't reliably cover.
fn is_supported_offset(minutes: i64) -> bool {
    (-MAX_REMINDER_AFTER_MINUTES..=MAX_REMINDER_BEFORE_MINUTES).contains(&minutes)
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

    // Use to_local_tz (not to_utc) so a floating "9am" displays as
    // 09:00 on the host instead of being projected through UTC.
    let local = et.to_local_tz(&Local);

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
        Utc.with_ymd_and_hms(year, month, day, hour, min, 0)
            .unwrap()
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
        assert_eq!(
            select_best_trigger(triggers, window_start, now),
            Some((0, now))
        );
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
            (180, now - Duration::hours(3)),    // before window
            (30, now - Duration::minutes(30)),  // in window
            (-30, now + Duration::minutes(30)), // future
        ];
        assert_eq!(
            select_best_trigger(triggers, window_start, now),
            Some((30, now - Duration::minutes(30)))
        );
    }

    // ---- is_supported_offset / scan range --------------------------------

    #[test]
    fn supported_offset_accepts_in_range_values() {
        assert!(is_supported_offset(0));
        assert!(is_supported_offset(60)); // 1h before
        assert!(is_supported_offset(MAX_REMINDER_BEFORE_MINUTES));
        assert!(is_supported_offset(-MAX_REMINDER_AFTER_MINUTES));
        assert!(is_supported_offset(-480)); // Google's 8h-after default
    }

    #[test]
    fn supported_offset_rejects_out_of_range_values() {
        // 60 days before — beyond the 4-week scan-ahead bound, so the event
        // wouldn't be loaded anyway. Filtering here makes the contract explicit.
        assert!(!is_supported_offset(60 * 24 * 60));
        // 48h after-start — beyond the scan-back bound for after-start alarms.
        assert!(!is_supported_offset(-48 * 60));
    }

    #[test]
    fn scan_range_covers_max_before_reminder() {
        // A 4-week-before reminder firing now corresponds to an event starting
        // 4 weeks from now. range_end must include that start time.
        let now = t(2026, 4, 29, 12, 0);
        let cutoff = now - Duration::hours(CATCHUP_CAP_HOURS);
        let range_end = now + Duration::minutes(MAX_REMINDER_BEFORE_MINUTES);
        let event_start = now + Duration::minutes(MAX_REMINDER_BEFORE_MINUTES);
        assert!(event_start <= range_end);
        // Sanity: the trigger derived from that start lands in the tick window.
        let trigger = event_start - Duration::minutes(MAX_REMINDER_BEFORE_MINUTES);
        assert!(trigger > cutoff && trigger <= now);
    }

    #[test]
    fn scan_range_covers_after_start_alarm() {
        // Google's TRIGGER:PT8H on an all-day event parses to minutes = -480.
        // The event started 8h ago; the alarm fires now. Scan range must still
        // include that 8h-old start.
        let now = t(2026, 4, 29, 12, 0);
        let cutoff = now - Duration::hours(CATCHUP_CAP_HOURS);
        let range_start = cutoff - Duration::minutes(MAX_REMINDER_AFTER_MINUTES);
        let event_start = now - Duration::hours(8);
        assert!(event_start >= range_start);
        let trigger = event_start - Duration::minutes(-480);
        assert!(trigger > cutoff && trigger <= now);
    }

    // ---- process_reminders -----------------------------------------------

    use caldir_core::{Attendee, EventUid, RecurrenceId, Reminder};
    use std::sync::Mutex;

    #[derive(Default)]
    struct TestNotifier {
        calls: Mutex<Vec<ReminderNotification>>,
    }

    impl TestNotifier {
        fn count(&self) -> usize {
            self.calls.lock().unwrap().len()
        }
    }

    impl Notifier for TestNotifier {
        fn notify(&self, notification: &ReminderNotification, _icon: Option<&Path>) {
            self.calls.lock().unwrap().push(notification.clone());
        }
    }

    fn make_event(uid: &str, start_utc: DateTime<Utc>, reminder_minutes: i64) -> Event {
        let mut event = Event::new(format!("Test {uid}"), EventTime::DateTimeUtc(start_utc));
        event.end = Some(EventTime::DateTimeUtc(start_utc + Duration::minutes(30)));
        event.reminders = vec![Reminder {
            minutes_before_start: reminder_minutes,
        }];
        event.uid = EventUid::new(uid);
        event
    }

    #[test]
    fn event_deep_link_encodes_recurring_instance_identity() {
        let mut event = make_event("team/a+b@example.com", t(2026, 8, 26, 9, 0), 10);
        event.recurrence_id = Some(RecurrenceId::from_event_time(EventTime::DateTimeZoned {
            datetime: NaiveDate::from_ymd_opt(2026, 8, 26)
                .unwrap()
                .and_hms_opt(9, 0, 0)
                .unwrap(),
            tzid: "Europe/London".to_string(),
        }));

        assert_eq!(
            event_deep_link(&event),
            "rencal://event?uid=team%2Fa%2Bb%40example.com&recurrence-id=TZID%3DEurope%2FLondon%3A20260826T090000"
        );
    }

    fn attendee(email: &str, status: ParticipationStatus) -> Attendee {
        Attendee {
            email: email.to_string(),
            name: None,
            status: Some(status),
        }
    }

    fn run(
        now: DateTime<Utc>,
        events: &[Event],
        cache: &mut DeliveredCache,
        notifier: &TestNotifier,
        notifications_enabled: bool,
    ) -> usize {
        run_with_defaults(now, events, &[], cache, notifier, notifications_enabled)
    }

    fn run_with_defaults(
        now: DateTime<Utc>,
        events: &[Event],
        default_reminders: &[i64],
        cache: &mut DeliveredCache,
        notifier: &TestNotifier,
        notifications_enabled: bool,
    ) -> usize {
        let cutoff = now - Duration::hours(CATCHUP_CAP_HOURS);
        process_reminders(
            now,
            cutoff,
            events,
            default_reminders,
            cache,
            notifier,
            notifications_enabled,
            None,
            TimeFormat::H24,
        )
    }

    #[test]
    fn should_remind_skips_cancelled_events() {
        let mut event = make_event("evt-cancelled", t(2026, 4, 29, 12, 30), 60);
        event.status = Status::Cancelled;

        assert!(!should_remind(&event, Some("me@example.com")));
    }

    #[test]
    fn should_remind_skips_declined_events_for_account() {
        let mut event = make_event("evt-declined", t(2026, 4, 29, 12, 30), 60);
        event.attendees = vec![attendee("ME@example.com", ParticipationStatus::Declined)];

        assert!(!should_remind(&event, Some("me@example.com")));
    }

    #[test]
    fn should_remind_allows_declines_for_other_attendees() {
        let mut event = make_event("evt-other-declined", t(2026, 4, 29, 12, 30), 60);
        event.attendees = vec![attendee(
            "someone@example.com",
            ParticipationStatus::Declined,
        )];

        assert!(should_remind(&event, Some("me@example.com")));
    }

    #[test]
    fn should_remind_allows_non_declined_account_statuses() {
        for status in [
            ParticipationStatus::Accepted,
            ParticipationStatus::Tentative,
            ParticipationStatus::NeedsAction,
        ] {
            let mut event = make_event("evt-ok", t(2026, 4, 29, 12, 30), 60);
            event.attendees = vec![attendee("me@example.com", status)];

            assert!(should_remind(&event, Some("me@example.com")));
        }
    }

    #[test]
    fn should_remind_allows_declined_events_when_account_is_unknown() {
        let mut event = make_event("evt-local", t(2026, 4, 29, 12, 30), 60);
        event.attendees = vec![attendee("me@example.com", ParticipationStatus::Declined)];

        assert!(should_remind(&event, None));
    }

    /// A tick runs at 12:00 with no events present,
    /// then sync introduces an event with a 60-min reminder for a 12:30
    /// start (trigger = 11:30). The next tick at 12:01 must still fire it.
    #[test]
    fn newly_synced_event_with_passed_trigger_still_fires() {
        let mut cache = DeliveredCache::new();
        let notifier = TestNotifier::default();

        run(t(2026, 4, 29, 12, 0), &[], &mut cache, &notifier, true);
        assert_eq!(notifier.count(), 0);

        let event = make_event("evt-sync", t(2026, 4, 29, 12, 30), 60);
        run(t(2026, 4, 29, 12, 1), &[event], &mut cache, &notifier, true);

        assert_eq!(notifier.count(), 1);
        assert_eq!(
            notifier.calls.lock().unwrap()[0].event_url,
            "rencal://event?uid=evt-sync"
        );
    }

    // ---- default reminders fallback ---------------------------------------

    fn make_event_without_alarm(uid: &str, start_utc: DateTime<Utc>) -> Event {
        let mut event = make_event(uid, start_utc, 0);
        event.reminders.clear();
        event
    }

    #[test]
    fn reminder_offsets_prefers_event_alarms_over_defaults() {
        let event = make_event("evt-own", t(2026, 4, 29, 12, 30), 5);
        assert_eq!(reminder_offsets(&event, &[10, 30]), vec![5]);
    }

    #[test]
    fn reminder_offsets_falls_back_to_defaults_when_event_has_none() {
        let event = make_event_without_alarm("evt-none", t(2026, 4, 29, 12, 30));
        assert_eq!(reminder_offsets(&event, &[10, 30]), vec![10, 30]);
        assert!(reminder_offsets(&event, &[]).is_empty());
    }

    #[test]
    fn reminder_offsets_skips_defaults_for_all_day_events() {
        let mut event = make_event_without_alarm("evt-allday", t(2026, 4, 29, 0, 0));
        event.start = EventTime::Date(NaiveDate::from_ymd_opt(2026, 4, 29).unwrap());
        event.end = None;
        assert!(reminder_offsets(&event, &[10]).is_empty());
    }

    /// A Google meeting synced without any VALARM (Google keeps its
    /// calendar-level default reminder out of the event) must still fire
    /// using the user's default reminders.
    #[test]
    fn event_without_alarm_fires_via_default_reminders() {
        let mut cache = DeliveredCache::new();
        let notifier = TestNotifier::default();
        let event = make_event_without_alarm("evt-google", t(2026, 4, 29, 12, 30));

        // No defaults configured → silent, as before.
        run_with_defaults(
            t(2026, 4, 29, 12, 20),
            &[event.clone()],
            &[],
            &mut cache,
            &notifier,
            true,
        );
        assert_eq!(notifier.count(), 0);

        // 10-minute default → fires at 12:20.
        run_with_defaults(
            t(2026, 4, 29, 12, 20),
            &[event.clone()],
            &[10],
            &mut cache,
            &notifier,
            true,
        );
        assert_eq!(notifier.count(), 1);

        // Same tick again → deduped.
        run_with_defaults(
            t(2026, 4, 29, 12, 21),
            &[event],
            &[10],
            &mut cache,
            &notifier,
            true,
        );
        assert_eq!(notifier.count(), 1);
    }

    #[test]
    fn event_with_own_alarm_ignores_default_reminders() {
        let mut cache = DeliveredCache::new();
        let notifier = TestNotifier::default();
        // Event alarm is 5 min before (12:25); default is 30 min (12:00).
        let event = make_event("evt-own-alarm", t(2026, 4, 29, 12, 30), 5);

        run_with_defaults(
            t(2026, 4, 29, 12, 0),
            &[event.clone()],
            &[30],
            &mut cache,
            &notifier,
            true,
        );
        assert_eq!(
            notifier.count(),
            0,
            "default must not fire when event has its own alarm"
        );

        run_with_defaults(
            t(2026, 4, 29, 12, 25),
            &[event],
            &[30],
            &mut cache,
            &notifier,
            true,
        );
        assert_eq!(notifier.count(), 1);
    }

    #[test]
    fn repeat_tick_does_not_refire() {
        let event = make_event("evt-1", t(2026, 4, 29, 12, 30), 60);
        let mut cache = DeliveredCache::new();
        let notifier = TestNotifier::default();

        // First tick at 12:01 — fires.
        run(
            t(2026, 4, 29, 12, 1),
            std::slice::from_ref(&event),
            &mut cache,
            &notifier,
            true,
        );
        // Second tick a minute later — same event, still in window, but cached.
        run(t(2026, 4, 29, 12, 2), &[event], &mut cache, &notifier, true);

        assert_eq!(notifier.count(), 1);
    }

    #[test]
    fn moved_event_fires_again_at_new_time() {
        // User's event was at 12:30 with a 60-min reminder; trigger 11:30 fires
        // and is cached. Then they move it to 13:30 — new trigger 12:30. The
        // new trigger has a different cache key and must fire.
        let mut cache = DeliveredCache::new();
        let notifier = TestNotifier::default();

        let original = make_event("evt-1", t(2026, 4, 29, 12, 30), 60);
        run(
            t(2026, 4, 29, 11, 31),
            &[original],
            &mut cache,
            &notifier,
            true,
        );
        assert_eq!(notifier.count(), 1);

        let moved = make_event("evt-1", t(2026, 4, 29, 13, 30), 60);
        run(
            t(2026, 4, 29, 12, 31),
            &[moved],
            &mut cache,
            &notifier,
            true,
        );
        assert_eq!(notifier.count(), 2);
    }

    #[test]
    fn disabled_notifications_records_without_firing() {
        // Disabling notifications still walks the cache so re-enabling later
        // doesn't dump the catch-up window of stale reminders.
        let event = make_event("evt-1", t(2026, 4, 29, 12, 30), 60);
        let mut cache = DeliveredCache::new();
        let notifier = TestNotifier::default();

        let fired = run(
            t(2026, 4, 29, 12, 1),
            std::slice::from_ref(&event),
            &mut cache,
            &notifier,
            false,
        );

        assert_eq!(fired, 0);
        assert_eq!(notifier.count(), 0);

        // Now flip notifications on and tick again — the trigger is still in
        // the catch-up window but already in the cache, so no fire.
        run(t(2026, 4, 29, 12, 2), &[event], &mut cache, &notifier, true);
        assert_eq!(notifier.count(), 0);
    }

    #[test]
    fn collapses_multiple_reminders_to_one_notification() {
        // An event with both "1h before" and "30m before" reminders, both
        // triggers in the catch-up window: only one notification should fire.
        let mut event = make_event("evt-1", t(2026, 4, 29, 13, 0), 60);
        event.reminders = vec![
            Reminder {
                minutes_before_start: 60,
            }, // trigger 12:00
            Reminder {
                minutes_before_start: 30,
            }, // trigger 12:30
        ];

        let mut cache = DeliveredCache::new();
        let notifier = TestNotifier::default();

        let fired = run(
            t(2026, 4, 29, 12, 31),
            &[event],
            &mut cache,
            &notifier,
            true,
        );

        assert_eq!(fired, 1);
    }

    #[test]
    fn ignores_events_with_only_future_triggers() {
        let event = make_event("evt-future", t(2026, 4, 29, 14, 0), 60); // trigger 13:00
        let mut cache = DeliveredCache::new();
        let notifier = TestNotifier::default();

        let fired = run(t(2026, 4, 29, 12, 0), &[event], &mut cache, &notifier, true);

        assert_eq!(fired, 0);
    }

    // ---- EventTime::to_local_tz (host-zone projection) -------------------

    use chrono::{FixedOffset, NaiveDateTime};

    fn naive(year: i32, month: u32, day: u32, hour: u32, min: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(year, month, day)
            .unwrap()
            .and_hms_opt(hour, min, 0)
            .unwrap()
    }

    fn project_to_utc<Tz: chrono::TimeZone>(et: &EventTime, host: &Tz) -> DateTime<Utc> {
        et.to_local_tz(host).with_timezone(&Utc)
    }

    #[test]
    fn floating_event_uses_host_zone_not_utc() {
        // The bug we're fixing: "9am floating" on a BST host should fire at
        // 09:00 local = 08:00 UTC, not at 09:00 UTC (= 10:00 local).
        let bst = FixedOffset::east_opt(3600).unwrap();
        let nine_am_floating = EventTime::DateTimeFloating(naive(2026, 7, 15, 9, 0));
        assert_eq!(
            project_to_utc(&nine_am_floating, &bst),
            t(2026, 7, 15, 8, 0)
        );
    }

    #[test]
    fn floating_event_in_utc_host_round_trips() {
        let nine_am_floating = EventTime::DateTimeFloating(naive(2026, 7, 15, 9, 0));
        assert_eq!(
            project_to_utc(&nine_am_floating, &Utc),
            t(2026, 7, 15, 9, 0)
        );
    }

    #[test]
    fn all_day_event_uses_local_midnight_not_utc_midnight() {
        // "All-day Tuesday" on a CEST host (UTC+2) should resolve to Mon 22:00
        // UTC (= Tue 00:00 local), so a "1h before" reminder fires at Mon
        // 23:00 local — not at Mon 23:00 UTC (= Tue 01:00 local) which is
        // what to_utc would give.
        let cest = FixedOffset::east_opt(2 * 3600).unwrap();
        let tuesday = EventTime::Date(NaiveDate::from_ymd_opt(2026, 7, 14).unwrap());
        assert_eq!(project_to_utc(&tuesday, &cest), t(2026, 7, 13, 22, 0));
    }

    #[test]
    fn utc_event_is_unchanged_by_host_zone() {
        let bst = FixedOffset::east_opt(3600).unwrap();
        let utc_event = EventTime::DateTimeUtc(t(2026, 7, 15, 14, 30));
        assert_eq!(project_to_utc(&utc_event, &bst), t(2026, 7, 15, 14, 30));
    }

    #[test]
    fn zoned_event_uses_its_own_tzid_not_host_zone() {
        // Event explicitly zoned to America/Los_Angeles. Result should be the
        // same UTC instant regardless of which host_tz we project from.
        let zoned = EventTime::DateTimeZoned {
            datetime: naive(2026, 7, 15, 9, 0),
            tzid: "America/Los_Angeles".to_string(),
        };
        let from_utc = project_to_utc(&zoned, &Utc);
        let from_bst = project_to_utc(&zoned, &FixedOffset::east_opt(3600).unwrap());
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
        let start = project_to_utc(&nine_am, &bst);
        let trigger = start - Duration::minutes(30);
        assert_eq!(trigger, t(2026, 7, 15, 7, 30));
    }
}
