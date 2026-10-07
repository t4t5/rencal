//! The `Clock` global (GPUI_PORT_PLAN.md §6.6): the current minute, the
//! viewer's time zone and today's date in it. It replaces `useNow`, `useToday`
//! and the TS viewer-zone store. It ticks on minute boundaries and follows the
//! system zone in `Settings`; observers re-render at most once a minute.

use std::time::Duration;

use chrono::{DateTime, NaiveDate, Timelike, Utc};
use gpui_kit::{App, Global};
use rencal_time::Tz;

use crate::settings::Settings;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Clock {
    /// Truncated to the minute, so it changes once a minute.
    pub now: DateTime<Utc>,
    pub viewer: Tz,
    pub today: NaiveDate,
}

impl Global for Clock {}

impl Clock {
    pub fn global(cx: &App) -> &Self {
        cx.global::<Self>()
    }

    pub fn at(now: DateTime<Utc>, viewer: Tz) -> Self {
        let now = now
            .with_second(0)
            .and_then(|n| n.with_nanosecond(0))
            .unwrap_or(now);
        Self {
            now,
            viewer,
            today: rencal_time::today(now, viewer),
        }
    }

    /// Installs the clock for the configured zone and follows `Settings`.
    /// Ticking starts with `start_ticking` (not in tests).
    pub fn init(cx: &mut App) {
        let viewer = viewer_zone(Settings::global(cx).system_tz.as_deref());
        cx.set_global(Self::at(Utc::now(), viewer));
        cx.observe_global::<Settings>(|cx| {
            let viewer = viewer_zone(Settings::global(cx).system_tz.as_deref());
            if viewer != Self::global(cx).viewer {
                log::info!("viewer zone: {viewer}");
                Self::set(Self::at(Self::global(cx).now, viewer), cx);
            }
        })
        .detach();
    }

    /// Advances the clock at every minute boundary.
    pub fn start_ticking(cx: &mut App) {
        cx.spawn(async move |cx| {
            loop {
                let now = Utc::now();
                let into_minute = Duration::from_millis(
                    u64::from(now.second()) * 1000 + u64::from(now.timestamp_subsec_millis()),
                );
                let wait = Duration::from_secs(60).saturating_sub(into_minute);
                cx.background_executor()
                    .timer(wait + Duration::from_millis(5))
                    .await;
                cx.update(|cx| {
                    let viewer = Self::global(cx).viewer;
                    Self::set(Self::at(Utc::now(), viewer), cx);
                });
            }
        })
        .detach();
    }

    pub fn set(clock: Self, cx: &mut App) {
        if *Self::global(cx) != clock {
            cx.set_global(clock);
        }
    }
}

/// The zone events are shown in: the system zone, or UTC when it is unknown
/// or not an IANA name.
pub fn viewer_zone(system_tz: Option<&str>) -> Tz {
    system_tz
        .and_then(|name| rencal_time::parse_tz(name).ok())
        .unwrap_or(chrono_tz::UTC)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncates_to_the_minute_and_derives_today_in_the_zone() {
        let now = "2026-10-07T22:30:45.5Z".parse::<DateTime<Utc>>().unwrap();
        let clock = Clock::at(now, chrono_tz::Europe::Stockholm);
        assert_eq!(clock.now.to_rfc3339(), "2026-10-07T22:30:00+00:00");
        assert_eq!(clock.today, NaiveDate::from_ymd_opt(2026, 10, 8).unwrap());
    }

    #[test]
    fn unknown_zones_fall_back_to_utc() {
        assert_eq!(
            viewer_zone(Some("Europe/Stockholm")),
            chrono_tz::Europe::Stockholm
        );
        assert_eq!(viewer_zone(Some("Nowhere/Land")), chrono_tz::UTC);
        assert_eq!(viewer_zone(None), chrono_tz::UTC);
    }
}
