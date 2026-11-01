use std::collections::HashSet;
use std::path::PathBuf;

use super::ics_file::IcsFile;
use super::types::{CalendarEvent, IcsImportDestination, IcsImportResult, IcsImportTarget};
use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};
use crate::state::AppState;
use caldir_core::{CalendarConfig, Event};

/// Copy the events of each chosen source calendar into its destination.
/// Events whose UID is already there are skipped; on failure, everything
/// written so far (files and new calendars) is removed again.
pub(super) fn handler(
    state: &AppState,
    path: String,
    targets: Vec<IcsImportTarget>,
) -> TauResult<IcsImportResult> {
    let mut file = IcsFile::read(&path)?;
    let mut written = Written::default();

    let result = import(state, &mut file, targets, &mut written);
    if result.is_err() {
        written.roll_back();
    }

    for slug in &written.slugs {
        state.invalidate_events(slug);
    }
    if !written.new_calendars.is_empty() {
        state.notify_calendars_changed();
    }
    result
}

#[derive(Default)]
struct Written {
    files: Vec<PathBuf>,
    new_calendars: Vec<PathBuf>,
    slugs: HashSet<String>,
}

impl Written {
    fn roll_back(&self) {
        for path in &self.files {
            if let Err(e) = std::fs::remove_file(path) {
                log::warn!("failed to roll back imported event {}: {e}", path.display());
            }
        }
        for path in &self.new_calendars {
            if let Err(e) = std::fs::remove_dir_all(path) {
                log::warn!(
                    "failed to roll back imported calendar {}: {e}",
                    path.display()
                );
            }
        }
    }
}

fn import(
    state: &AppState,
    file: &mut IcsFile,
    targets: Vec<IcsImportTarget>,
    written: &mut Written,
) -> TauResult<IcsImportResult> {
    // Counted like the preview: a series and its overrides are one event.
    let mut imported = HashSet::new();
    let mut duplicates = HashSet::new();
    let mut last_master: Option<CalendarEvent> = None;

    for target in targets {
        let source = file
            .calendars
            .get_mut(target.source as usize)
            .ok_or_else(|| RpcError::new(RpcErrorKind::InvalidInput, "Unknown calendar in file"))?;
        let events = std::mem::take(&mut source.events);

        let calendar = match target.destination {
            IcsImportDestination::Existing { calendar_slug } => {
                state.caldir().calendar(&calendar_slug)?
            }
            IcsImportDestination::New { name, color } => {
                let base_slug = caldir_core::Calendar::base_slug_for(Some(&name));
                let config = CalendarConfig::new(Some(name), color, None, None);
                let calendar = state.caldir().create_calendar(&base_slug, Some(config))?;
                written.new_calendars.push(calendar.path().to_path_buf());
                calendar
            }
        };
        let slug = calendar.slug().unwrap_or_default().to_string();
        if calendar.is_read_only() {
            return Err(RpcError::new(
                RpcErrorKind::InvalidInput,
                format!("{} is read-only", calendar.name().unwrap_or(&slug)),
            ));
        }
        // Pushing an event with guests to a provider emails every guest.
        let keep_guests = !calendar.has_remote();

        let mut existing: HashSet<_> = state
            .events(&slug)?
            .iter()
            .map(Event::event_instance_id)
            .collect();
        written.slugs.insert(slug.clone());

        for mut event in events {
            let key = (slug.clone(), event.uid.as_str().to_string());
            if !existing.insert(event.event_instance_id()) {
                duplicates.insert(key);
                continue;
            }
            if !keep_guests {
                event.organizer = None;
                event.attendees.clear();
            }
            let created = calendar.create_event(event)?;
            written.files.push(created.path().to_path_buf());
            if created.event().recurrence_id.is_none() {
                last_master = Some(CalendarEvent::from_event(created.event(), &slug, None));
            }
            imported.insert(key);
        }
    }

    Ok(IcsImportResult {
        imported_count: imported.len() as u32,
        duplicate_count: duplicates.difference(&imported).count() as u32,
        event: last_master.filter(|_| imported.len() == 1),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::ProviderDirs;

    const FOSSIFY: &str = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n\
        BEGIN:VEVENT\r\nUID:gym@x\r\nDTSTAMP:20260101T000000Z\r\n\
        DTSTART:20260105T090000Z\r\nDTEND:20260105T100000Z\r\nSUMMARY:Gym\r\n\
        CATEGORIES:Private\r\nX-FOSSIFY-CATEGORY-COLOR:-16738680\r\nEND:VEVENT\r\n\
        BEGIN:VEVENT\r\nUID:sync@x\r\nDTSTAMP:20260101T000000Z\r\n\
        DTSTART:20260106T090000Z\r\nDTEND:20260106T100000Z\r\nSUMMARY:Sync\r\n\
        ORGANIZER:mailto:boss@x\r\nATTENDEE:mailto:me@x\r\n\
        CATEGORIES:Work\r\nX-FOSSIFY-CATEGORY-COLOR:-1\r\nEND:VEVENT\r\n\
        END:VCALENDAR\r\n";

    struct Fixture {
        _dir: tempfile::TempDir,
        data: PathBuf,
        ics: String,
        state: AppState,
    }

    fn fixture() -> Fixture {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("data");
        std::fs::create_dir(&data).unwrap();
        let config = dir.path().join("config.toml");
        std::fs::write(&config, format!("calendar_dir = {:?}\n", data)).unwrap();
        let ics = dir.path().join("export.ics");
        std::fs::write(&ics, FOSSIFY).unwrap();
        let state = AppState::load_from(config, ProviderDirs::default()).unwrap();
        Fixture {
            data,
            ics: ics.to_string_lossy().into_owned(),
            state,
            _dir: dir,
        }
    }

    fn new_calendar(source: u32, name: &str) -> IcsImportTarget {
        IcsImportTarget {
            source,
            destination: IcsImportDestination::New {
                name: name.into(),
                color: None,
            },
        }
    }

    fn existing(source: u32, slug: &str) -> IcsImportTarget {
        IcsImportTarget {
            source,
            destination: IcsImportDestination::Existing {
                calendar_slug: slug.into(),
            },
        }
    }

    fn summaries(state: &AppState, slug: &str) -> Vec<String> {
        let mut summaries: Vec<_> = state
            .events(slug)
            .unwrap()
            .iter()
            .map(|event| event.summary.clone().unwrap_or_default())
            .collect();
        summaries.sort();
        summaries
    }

    #[test]
    fn imports_each_source_into_a_new_calendar() {
        let f = fixture();
        let result = handler(
            &f.state,
            f.ics.clone(),
            vec![new_calendar(0, "Private"), new_calendar(1, "Work")],
        )
        .unwrap();

        assert_eq!((result.imported_count, result.duplicate_count), (2, 0));
        assert!(result.event.is_none());
        assert_eq!(summaries(&f.state, "private"), vec!["Gym"]);
        assert_eq!(summaries(&f.state, "work"), vec!["Sync"]);
        // A local calendar keeps the guests: nothing is ever sent from it.
        assert_eq!(f.state.events("work").unwrap()[0].attendees.len(), 1);
    }

    #[test]
    fn skips_events_already_in_the_calendar() {
        let f = fixture();
        handler(&f.state, f.ics.clone(), vec![new_calendar(0, "Mine")]).unwrap();

        let result = handler(
            &f.state,
            f.ics.clone(),
            vec![existing(0, "mine"), existing(1, "mine")],
        )
        .unwrap();

        assert_eq!((result.imported_count, result.duplicate_count), (1, 1));
        assert_eq!(
            result.event.map(|event| event.summary).as_deref(),
            Some("Sync")
        );
        assert_eq!(summaries(&f.state, "mine"), vec!["Gym", "Sync"]);
    }

    #[test]
    fn drops_guests_in_synced_calendars() {
        let f = fixture();
        let calendar = f.state.caldir().create_calendar("synced", None).unwrap();
        std::fs::write(
            calendar.config_path(),
            "name = \"Synced\"\n[remote]\nprovider = \"google\"\ngoogle_account = \"me@x\"\n",
        )
        .unwrap();

        handler(&f.state, f.ics.clone(), vec![existing(1, "synced")]).unwrap();

        let events = f.state.events("synced").unwrap();
        assert!(events[0].organizer.is_none());
        assert!(events[0].attendees.is_empty());
    }

    #[test]
    fn rolls_back_everything_on_failure() {
        let f = fixture();
        handler(&f.state, f.ics.clone(), vec![new_calendar(0, "Kept")]).unwrap();

        let error = handler(
            &f.state,
            f.ics.clone(),
            vec![
                existing(1, "kept"),
                new_calendar(0, "Gone"),
                new_calendar(7, "Bad"),
            ],
        )
        .err()
        .unwrap();

        assert_eq!(error.kind, RpcErrorKind::InvalidInput);
        assert_eq!(summaries(&f.state, "kept"), vec!["Gym"]);
        assert!(!f.data.join("gone").exists());
    }
}
