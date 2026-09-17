//! Watches the caldir data directory and re-points itself when the directory
//! moves (Settings UI, hand-edited config.toml, the caldir CLI).

use std::collections::BTreeSet;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use notify::RecursiveMode;

use crate::fs_watch::{FsWatch, is_content_change, watch_debounced};
use crate::state::AppState;

/// Wait before reopening a watch that could not be opened or that ended.
const REOPEN_DELAY: Duration = Duration::from_secs(5);

fn is_ics_event_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("ics"))
}

fn is_calendar_toml(path: &Path) -> bool {
    path.file_name().is_some_and(|name| name == "calendar.toml")
}

/// A direct, non-hidden child of the data dir: a calendar directory created,
/// renamed or removed as a whole (`mv work archive`). Hidden entries such as
/// `.git` are not calendars.
fn is_calendar_dir(root: &Path, path: &Path) -> bool {
    path.parent() == Some(root)
        && path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| !name.starts_with('.'))
}

fn is_relevant(root: &Path, event: &notify::Event) -> bool {
    is_content_change(event)
        && event.paths.iter().any(|path| {
            is_ics_event_file(path) || is_calendar_toml(path) || is_calendar_dir(root, path)
        })
}

/// What one burst of filesystem events means for the state.
#[derive(Default, Debug, PartialEq)]
struct Changes {
    /// Calendars whose `.ics` files changed.
    slugs: BTreeSet<String>,
    /// A `calendar.toml` or a calendar directory was created, edited, renamed
    /// or removed.
    calendars: bool,
    /// A path could not be attributed to a calendar.
    unattributed: bool,
}

/// The slug is the first path component under `root`.
fn classify(root: &Path, paths: &[PathBuf]) -> Changes {
    let mut changes = Changes::default();

    for path in paths {
        let Ok(relative) = path.strip_prefix(root) else {
            changes.unattributed = true;
            continue;
        };
        let Some(Component::Normal(slug)) = relative.components().next() else {
            changes.unattributed = true;
            continue;
        };

        if is_calendar_toml(path) || is_calendar_dir(root, path) {
            changes.calendars = true;
        } else if is_ics_event_file(path) {
            match slug.to_str() {
                Some(slug) => {
                    changes.slugs.insert(slug.to_owned());
                }
                None => changes.unattributed = true,
            }
        }
    }

    changes
}

/// Classifies external caldir writes and publishes the corresponding
/// state-owned notifications. Runs for the life of the app.
pub async fn run_watcher(state: Arc<AppState>) {
    let mut config = state.subscribe_caldir_config();

    loop {
        let data_dir = config.borrow_and_update().data_dir();
        let mut watch = open_watch(&data_dir);

        loop {
            tokio::select! {
                changed = config.changed() => {
                    if changed.is_err() {
                        return;
                    }
                    if config.borrow().data_dir() != data_dir {
                        break;
                    }
                }
                outcome = wait_changed(&mut watch) => {
                    let paths = match outcome {
                        WatchOutcome::Paths(paths) => paths,
                        WatchOutcome::Ended => {
                            log::warn!(
                                "caldir watcher: watch on {data_dir:?} ended; retrying in {REOPEN_DELAY:?}"
                            );
                            watch = None;
                            continue;
                        }
                        WatchOutcome::Retry => {
                            watch = open_watch(&data_dir);
                            continue;
                        }
                    };
                    let Some(root) = watch.as_ref().map(|watch| watch.root.as_path()) else {
                        continue;
                    };

                    let changes = classify(root, &paths);
                    if changes.unattributed {
                        state.invalidate_all_events();
                    } else {
                        for slug in &changes.slugs {
                            state.invalidate_events(slug);
                        }
                    }
                    if changes.unattributed || !changes.slugs.is_empty() {
                        state.notify_events_changed();
                    }
                    if changes.calendars {
                        state.notify_calendars_changed();
                    }
                }
            }
        }
    }
}

struct DirWatch {
    fs: FsWatch,
    /// The data dir with symlinks resolved. inotify reports paths under the
    /// path it was given and FSEvents reports resolved paths; watching the
    /// resolved path lets both be classified against `root`.
    root: PathBuf,
}

fn open_watch(data_dir: &Path) -> Option<DirWatch> {
    // caldir creates the data dir lazily, with the first calendar; the watch
    // needs it now.
    if let Err(err) = std::fs::create_dir_all(data_dir) {
        log::warn!(
            "caldir watcher: cannot create {data_dir:?}: {err}; retrying in {REOPEN_DELAY:?}"
        );
        return None;
    }
    let root = match data_dir.canonicalize() {
        Ok(root) => root,
        Err(err) => {
            log::warn!(
                "caldir watcher: cannot resolve {data_dir:?}: {err}; retrying in {REOPEN_DELAY:?}"
            );
            return None;
        }
    };

    let filter_root = root.clone();
    let filter = move |event: &notify::Event| is_relevant(&filter_root, event);
    match watch_debounced(&[&root], RecursiveMode::Recursive, filter) {
        Ok(fs) => {
            log::debug!("caldir watcher: watching {root:?}");
            Some(DirWatch { fs, root })
        }
        Err(err) => {
            log::warn!(
                "caldir watcher: failed to watch {root:?}: {err}; retrying in {REOPEN_DELAY:?}"
            );
            None
        }
    }
}

enum WatchOutcome {
    Paths(Vec<PathBuf>),
    Ended,
    Retry,
}

async fn wait_changed(watch: &mut Option<DirWatch>) -> WatchOutcome {
    match watch {
        Some(watch) => match watch.fs.changed().await {
            Some(paths) => WatchOutcome::Paths(paths),
            None => WatchOutcome::Ended,
        },
        None => {
            tokio::time::sleep(REOPEN_DELAY).await;
            WatchOutcome::Retry
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::EventKind;
    use notify::event::{CreateKind, ModifyKind, RenameMode};

    #[test]
    fn matches_relevant_files_only() {
        let root = Path::new("/cal");
        assert!(is_ics_event_file(Path::new("/cal/work/event.ics")));
        assert!(is_ics_event_file(Path::new("/cal/work/EVENT.ICS")));
        assert!(is_calendar_toml(Path::new("/cal/work/calendar.toml")));
        assert!(is_calendar_dir(root, Path::new("/cal/work")));
        assert!(!is_calendar_dir(root, Path::new("/cal/.git")));
        assert!(!is_calendar_dir(root, Path::new("/cal/work/nested")));
        assert!(!is_ics_event_file(Path::new(
            "/cal/work/.caldir/state.json"
        )));
        assert!(!is_calendar_toml(Path::new("/cal/work/config.toml")));
    }

    #[test]
    fn a_calendar_directory_rename_is_relevant_but_a_hidden_dir_is_not() {
        let root = Path::new("/cal");

        let rename = notify::Event::new(EventKind::Modify(ModifyKind::Name(RenameMode::Both)))
            .add_path(PathBuf::from("/cal/work"))
            .add_path(PathBuf::from("/cal/archive"));
        assert!(is_relevant(root, &rename));

        let hidden = notify::Event::new(EventKind::Create(CreateKind::Folder))
            .add_path(PathBuf::from("/cal/.git"));
        assert!(!is_relevant(root, &hidden));
    }

    #[test]
    fn classifies_an_event_file_by_calendar_slug() {
        let changes = classify(Path::new("/cal"), &[PathBuf::from("/cal/work/event.ics")]);
        assert_eq!(changes.slugs, BTreeSet::from(["work".to_string()]));
        assert!(!changes.calendars);
        assert!(!changes.unattributed);
    }

    #[test]
    fn classifies_calendar_metadata() {
        let changes = classify(
            Path::new("/cal"),
            &[PathBuf::from("/cal/work/calendar.toml")],
        );
        assert!(changes.slugs.is_empty());
        assert!(changes.calendars);
        assert!(!changes.unattributed);
    }

    #[test]
    fn classifies_a_calendar_directory_as_a_calendar_change() {
        let changes = classify(
            Path::new("/cal"),
            &[PathBuf::from("/cal/work"), PathBuf::from("/cal/archive")],
        );
        assert!(changes.slugs.is_empty());
        assert!(changes.calendars);
        assert!(!changes.unattributed);

        let hidden = classify(Path::new("/cal"), &[PathBuf::from("/cal/.git")]);
        assert_eq!(hidden, Changes::default());
    }

    #[test]
    fn classifies_paths_outside_the_data_dir_as_unattributed() {
        let changes = classify(
            Path::new("/cal"),
            &[PathBuf::from("/elsewhere/work/event.ics")],
        );
        assert!(changes.unattributed);
    }

    #[test]
    fn classifies_mixed_bursts() {
        let changes = classify(
            Path::new("/cal"),
            &[
                PathBuf::from("/cal/work/event.ics"),
                PathBuf::from("/cal/home/calendar.toml"),
                PathBuf::from("/elsewhere/event.ics"),
            ],
        );
        assert_eq!(changes.slugs, BTreeSet::from(["work".to_string()]));
        assert!(changes.calendars);
        assert!(changes.unattributed);
    }
}
