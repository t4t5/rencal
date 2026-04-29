//! Diagnostic: dump the exact info the reminder loop computes for the next tick.
//! Run with: cargo run --example debug_reminders --manifest-path src-tauri/Cargo.toml

use caldir_core::caldir::Caldir;
use chrono::{Duration, Utc};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let caldir = Caldir::load()?;
    let now = Utc::now();
    let cap_start = now - Duration::hours(1);
    let window_start = cap_start;
    let range_start = std::cmp::min(window_start, now - Duration::hours(1));
    let range_end = now + Duration::days(7);

    println!("now             = {now}");
    println!("window_start    = {window_start}  (assuming no cache file)");
    println!("range_start     = {range_start}");
    println!("range_end       = {range_end}");

    let calendars = caldir.calendars();
    println!("\ncalendars: {}", calendars.len());

    let mut total_events = 0;
    let mut total_with_reminders = 0;
    for calendar in &calendars {
        let events: Vec<caldir_core::event::Event> =
            match calendar.events_in_range(range_start, range_end) {
                Ok(e) => e,
                Err(e) => {
                    println!("  [ERR] {:?}: {e}", calendar.slug);
                    continue;
                }
            };
        total_events += events.len();
        for event in &events {
            if event.reminders.is_empty() {
                continue;
            }
            total_with_reminders += 1;
            let start_utc = event.start.to_utc();
            println!(
                "\n  {} [{}]  start_utc={:?}",
                event.summary,
                calendar.slug,
                start_utc
            );
            for r in event.reminders.iter() {
                let trigger = start_utc.map(|s| s - Duration::minutes(r.minutes));
                let in_window = trigger
                    .map(|t| t > window_start && t <= now)
                    .unwrap_or(false);
                println!(
                    "    reminder {}min before  → trigger {:?}  in_window={}",
                    r.minutes, trigger, in_window
                );
            }
        }
    }
    println!(
        "\ntotal events in range: {total_events}, with reminders: {total_with_reminders}"
    );

    Ok(())
}
