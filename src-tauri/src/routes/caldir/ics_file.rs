//! Reading .ics files for import: a single invite or a whole exported
//! calendar. Exports may hold several calendars, either as one `VCALENDAR`
//! block each (which `Event::from_ics_str` would cut to the first) or, from
//! Fossify Calendar, as one block whose events name their calendar in
//! `CATEGORIES`.

use std::collections::HashSet;
use std::path::Path;

use caldir_core::Event;
use icalendar::Component;

use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};

/// Set on events Fossify exports; their `CATEGORIES` is the calendar title.
const FOSSIFY_CALENDAR_COLOR: [&str; 2] = ["X-FOSSIFY-CATEGORY-COLOR", "X-SMT-CATEGORY-COLOR"];
const APPLE_CALENDAR_COLOR: &str = "X-APPLE-CALENDAR-COLOR";

/// One calendar's worth of events found in a file.
#[derive(Debug)]
pub(super) struct SourceCalendar {
    pub name: String,
    pub color: Option<String>,
    pub events: Vec<Event>,
}

impl SourceCalendar {
    /// Distinct series and single events; a series' overrides share its UID.
    pub fn event_count(&self) -> usize {
        self.events
            .iter()
            .map(|event| event.uid.as_str())
            .collect::<HashSet<_>>()
            .len()
    }
}

#[derive(Debug)]
pub(super) struct IcsFile {
    pub file_name: String,
    pub calendars: Vec<SourceCalendar>,
    /// Events that failed to parse.
    pub skipped: u32,
}

impl IcsFile {
    pub fn read(path: &str) -> TauResult<Self> {
        let path = Path::new(path);
        let contents = std::fs::read_to_string(path).map_err(|e| {
            RpcError::new(
                RpcErrorKind::Io,
                format!("Could not read {}: {e}", path.display()),
            )
        })?;
        let file_name = path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        let fallback_name = path
            .file_stem()
            .map(|stem| stem.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Imported".into());
        let mut file = Self::parse(&contents, &fallback_name)?;
        file.file_name = file_name;
        Ok(file)
    }

    /// `fallback_name` names events whose calendar has no name.
    pub fn parse(contents: &str, fallback_name: &str) -> TauResult<Self> {
        let mut calendars: Vec<SourceCalendar> = Vec::new();
        let mut skipped = 0;

        for block in vcalendar_blocks(contents) {
            let ical: icalendar::Calendar = block.parse().map_err(|e| {
                RpcError::new(
                    RpcErrorKind::InvalidInput,
                    format!("This isn't a valid .ics file: {e}"),
                )
            })?;
            let block_name = ical.get_name().map(str::trim).filter(|n| !n.is_empty());
            let block_color = ical
                .property_value(APPLE_CALENDAR_COLOR)
                .and_then(hex_color);

            for ical_event in ical.events() {
                let event = match Event::try_from(ical_event) {
                    Ok(event) => event,
                    Err(e) => {
                        log::warn!("skipping unparseable event in .ics import: {e}");
                        skipped += 1;
                        continue;
                    }
                };
                let (name, color) = match fossify_calendar(ical_event) {
                    Some((name, color)) => (Some(name), color),
                    None => (block_name.map(String::from), block_color.clone()),
                };
                let name = name.unwrap_or_else(|| fallback_name.to_string());

                match calendars.iter_mut().find(|cal| cal.name == name) {
                    Some(calendar) => {
                        calendar.color = calendar.color.take().or(color);
                        calendar.events.push(event);
                    }
                    None => calendars.push(SourceCalendar {
                        name,
                        color,
                        events: vec![event],
                    }),
                }
            }
        }

        if calendars.is_empty() {
            return Err(RpcError::new(
                RpcErrorKind::InvalidInput,
                "There are no events in this file",
            ));
        }

        Ok(Self {
            file_name: String::new(),
            calendars,
            skipped,
        })
    }

    /// The file's only event (a series counts as one), e.g. an invite.
    pub fn single_event(&self) -> Option<&Event> {
        let [calendar] = self.calendars.as_slice() else {
            return None;
        };
        if calendar.event_count() != 1 {
            return None;
        }
        calendar
            .events
            .iter()
            .find(|event| event.recurrence_id.is_none())
            .or(calendar.events.first())
    }
}

/// Each `BEGIN:VCALENDAR` … `END:VCALENDAR` block, or the whole input when
/// there are none (bare `VEVENT`s).
fn vcalendar_blocks(contents: &str) -> Vec<&str> {
    let mut blocks = Vec::new();
    let mut start = None;
    let mut offset = 0;

    for line in contents.split_inclusive('\n') {
        let trimmed = line.trim_end();
        if trimmed.eq_ignore_ascii_case("BEGIN:VCALENDAR") {
            start = Some(offset);
        } else if trimmed.eq_ignore_ascii_case("END:VCALENDAR")
            && let Some(begin) = start.take()
        {
            blocks.push(&contents[begin..offset + line.len()]);
        }
        offset += line.len();
    }

    if blocks.is_empty() {
        blocks.push(contents);
    }
    blocks
}

fn fossify_calendar(event: &icalendar::Event) -> Option<(String, Option<String>)> {
    let color = FOSSIFY_CALENDAR_COLOR
        .iter()
        .find_map(|key| event.property_value(key))?;
    let name = event
        .multi_properties()
        .get("CATEGORIES")?
        .first()?
        .value()
        .trim();
    if name.is_empty() {
        return None;
    }
    // Android colour ints, e.g. -16738680; the low 24 bits are RGB.
    let color = match color.trim().parse::<i64>() {
        Ok(argb) => Some(format!("#{:06x}", argb as u32 & 0xff_ffff)),
        Err(_) => hex_color(color),
    };
    Some((name.to_string(), color))
}

/// `#rrggbb` from `#rrggbb` or `#rrggbbaa`.
fn hex_color(value: &str) -> Option<String> {
    let hex = value.trim().strip_prefix('#')?;
    let valid = matches!(hex.len(), 6 | 8) && hex.bytes().all(|b| b.is_ascii_hexdigit());
    valid.then(|| format!("#{}", hex[..6].to_ascii_lowercase()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vevent(uid: &str, summary: &str, extra: &str) -> String {
        format!(
            "BEGIN:VEVENT\r\nUID:{uid}\r\nDTSTAMP:20260101T000000Z\r\n\
             DTSTART:20260105T090000Z\r\nDTEND:20260105T100000Z\r\n\
             SUMMARY:{summary}\r\n{extra}END:VEVENT\r\n"
        )
    }

    fn vcalendar(props: &str, events: &[String]) -> String {
        format!(
            "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n{props}{}END:VCALENDAR\r\n",
            events.concat()
        )
    }

    fn names(file: &IcsFile) -> Vec<(&str, usize)> {
        file.calendars
            .iter()
            .map(|cal| (cal.name.as_str(), cal.events.len()))
            .collect()
    }

    #[test]
    fn a_single_invite_is_one_unnamed_calendar() {
        let ics = vcalendar("METHOD:REQUEST\r\n", &[vevent("a@x", "Lunch", "")]);
        let file = IcsFile::parse(&ics, "invite").unwrap();
        assert_eq!(names(&file), vec![("invite", 1)]);
        assert_eq!(
            file.single_event().unwrap().summary.as_deref(),
            Some("Lunch")
        );
    }

    #[test]
    fn keeps_every_vcalendar_block() {
        let ics = [
            vcalendar(
                "X-WR-CALNAME:Work\r\nX-APPLE-CALENDAR-COLOR:#FF0000FF\r\n",
                &[vevent("a@x", "Standup", ""), vevent("b@x", "Review", "")],
            ),
            vcalendar("X-WR-CALNAME:Home\r\n", &[vevent("c@x", "Dinner", "")]),
            vcalendar("X-WR-CALNAME:Work\r\n", &[vevent("d@x", "Retro", "")]),
        ]
        .concat();
        let file = IcsFile::parse(&ics, "export").unwrap();
        assert_eq!(names(&file), vec![("Work", 3), ("Home", 1)]);
        assert_eq!(file.calendars[0].color.as_deref(), Some("#ff0000"));
        assert!(file.single_event().is_none());
    }

    #[test]
    fn splits_fossify_exports_by_calendar() {
        let ics = vcalendar(
            "",
            &[
                vevent(
                    "a@x",
                    "Gym",
                    "CATEGORIES:Private\r\nX-FOSSIFY-CATEGORY-COLOR:-16738680\r\n",
                ),
                vevent(
                    "b@x",
                    "Standup",
                    "CATEGORIES:Work\r\nX-FOSSIFY-CATEGORY-COLOR:-1\r\n",
                ),
                vevent("c@x", "Tagged", "CATEGORIES:Business\r\n"),
            ],
        );
        let file = IcsFile::parse(&ics, "fossify").unwrap();
        assert_eq!(
            names(&file),
            vec![("Private", 1), ("Work", 1), ("fossify", 1)]
        );
        assert_eq!(file.calendars[0].color.as_deref(), Some("#009688"));
        assert_eq!(file.calendars[1].color.as_deref(), Some("#ffffff"));
    }

    #[test]
    fn a_series_with_overrides_counts_as_one_event() {
        let ics = vcalendar(
            "",
            &[
                vevent("s@x", "Weekly", "RRULE:FREQ=WEEKLY;COUNT=3\r\n"),
                vevent("s@x", "Moved", "RECURRENCE-ID:20260112T090000Z\r\n"),
            ],
        );
        let file = IcsFile::parse(&ics, "series").unwrap();
        assert_eq!(file.calendars[0].event_count(), 1);
        assert_eq!(
            file.single_event().unwrap().summary.as_deref(),
            Some("Weekly")
        );
    }

    #[test]
    fn counts_unparseable_events_and_rejects_empty_files() {
        let ics = vcalendar(
            "",
            &[
                vevent("a@x", "Fine", ""),
                "BEGIN:VEVENT\r\nUID:b@x\r\nSUMMARY:No start\r\nEND:VEVENT\r\n".into(),
            ],
        );
        let file = IcsFile::parse(&ics, "x").unwrap();
        assert_eq!((file.calendars[0].events.len(), file.skipped), (1, 1));

        assert!(IcsFile::parse(&vcalendar("", &[]), "x").is_err());
    }
}
