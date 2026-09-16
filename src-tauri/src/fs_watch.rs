//! Debounced filesystem watching shared by every backend watcher.
//!
//! A watcher is "which paths, which events matter" plus a loop; everything
//! else (the `notify` callback, the channel, the coalesce window) lives here.

use std::path::{Path, PathBuf};
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tokio::sync::mpsc;

/// Editor saves and syncs write many files in quick succession; one wakeup
/// per burst is enough.
const COALESCE_WINDOW: Duration = Duration::from_millis(150);

pub struct FsWatch {
    _watcher: RecommendedWatcher,
    rx: mpsc::UnboundedReceiver<Vec<PathBuf>>,
    /// A wakeup whose coalesce window was cut short (the future was dropped
    /// mid-sleep, e.g. by `select!`), with the paths it carried; delivered by
    /// the next call. `Some` even when the event carried no paths, so the
    /// wakeup itself is never lost.
    pending: Option<Vec<PathBuf>>,
}

/// Watches `paths` and yields once per coalesced burst of events accepted by
/// `filter`. Fails if any path cannot be watched.
pub fn watch_debounced(
    paths: &[impl AsRef<Path>],
    mode: RecursiveMode,
    filter: impl Fn(&notify::Event) -> bool + Send + 'static,
) -> notify::Result<FsWatch> {
    let (tx, rx) = mpsc::unbounded_channel();

    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        if let Ok(event) = result
            && filter(&event)
        {
            let _ = tx.send(event.paths);
        }
    })?;

    for path in paths {
        watcher.watch(path.as_ref(), mode)?;
    }

    Ok(FsWatch {
        _watcher: watcher,
        rx,
        pending: None,
    })
}

impl FsWatch {
    /// Resolves after the coalesce window with the deduplicated paths of one
    /// burst; `None` once the underlying watcher is gone. Cancel-safe: a
    /// wakeup is never lost if the future is dropped before it resolves.
    pub async fn changed(&mut self) -> Option<Vec<PathBuf>> {
        if self.pending.is_none() {
            self.pending = Some(self.rx.recv().await?);
        }
        tokio::time::sleep(COALESCE_WINDOW).await;
        let mut paths = self.pending.take().unwrap_or_default();
        while let Ok(more) = self.rx.try_recv() {
            paths.extend(more);
        }
        paths.sort();
        paths.dedup();
        Some(paths)
    }
}

/// Accepts creates, removes and content/rename modifications. Metadata-only
/// changes are skipped: on Linux with `relatime`, our own reads bump atime and
/// would otherwise look like edits.
pub fn is_content_change(event: &notify::Event) -> bool {
    use notify::EventKind;
    use notify::event::ModifyKind;

    matches!(
        event.kind,
        EventKind::Create(_)
            | EventKind::Remove(_)
            | EventKind::Modify(ModifyKind::Data(_))
            | EventKind::Modify(ModifyKind::Name(_))
    )
}

/// Accepts any create, remove or modify event (including metadata).
pub fn is_any_change(event: &notify::Event) -> bool {
    use notify::EventKind;

    matches!(
        event.kind,
        EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(_)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn resolves_on_change_and_ends_when_watcher_is_gone() {
        let dir = tempfile::tempdir().unwrap();
        let mut watch =
            watch_debounced(&[dir.path()], RecursiveMode::NonRecursive, is_any_change).unwrap();

        std::fs::write(dir.path().join("touched.txt"), "x").unwrap();
        let changed = tokio::time::timeout(Duration::from_secs(5), watch.changed()).await;
        assert!(
            matches!(changed, Ok(Some(paths)) if paths.contains(&dir.path().join("touched.txt")))
        );

        let FsWatch {
            _watcher, mut rx, ..
        } = watch;
        drop(_watcher);
        assert_eq!(rx.recv().await, None);
    }

    #[tokio::test]
    async fn a_change_survives_the_future_being_dropped_mid_coalesce() {
        let dir = tempfile::tempdir().unwrap();
        let mut watch =
            watch_debounced(&[dir.path()], RecursiveMode::NonRecursive, is_any_change).unwrap();

        std::fs::write(dir.path().join("touched.txt"), "x").unwrap();
        // Long enough to receive the wakeup, too short for the coalesce window.
        let cut_short = tokio::time::timeout(Duration::from_millis(50), async {
            loop {
                if watch.changed().await.is_none() {
                    return;
                }
            }
        })
        .await;
        assert!(cut_short.is_err());

        let changed = tokio::time::timeout(Duration::from_secs(5), watch.changed()).await;
        assert!(
            matches!(changed, Ok(Some(paths)) if paths.contains(&dir.path().join("touched.txt")))
        );
    }

    #[tokio::test]
    async fn a_wakeup_without_paths_survives_being_cut_short() {
        let (tx, rx) = mpsc::unbounded_channel();
        let mut watch = FsWatch {
            _watcher: notify::recommended_watcher(|_: notify::Result<notify::Event>| {}).unwrap(),
            rx,
            pending: None,
        };

        tx.send(Vec::new()).unwrap();
        let cut_short = tokio::time::timeout(Duration::from_millis(50), watch.changed()).await;
        assert!(cut_short.is_err());

        let changed = tokio::time::timeout(Duration::from_secs(5), watch.changed()).await;
        assert_eq!(changed, Ok(Some(Vec::new())));
    }

    #[tokio::test]
    async fn batches_and_deduplicates_paths_inside_the_window() {
        let dir = tempfile::tempdir().unwrap();
        let mut watch =
            watch_debounced(&[dir.path()], RecursiveMode::NonRecursive, is_any_change).unwrap();
        let first = dir.path().join("first.txt");
        let second = dir.path().join("second.txt");

        std::fs::write(&first, "one").unwrap();
        std::fs::write(&second, "two").unwrap();
        std::fs::write(&first, "three").unwrap();

        let paths = tokio::time::timeout(Duration::from_secs(5), watch.changed())
            .await
            .unwrap()
            .unwrap();
        assert!(paths.contains(&first));
        assert!(paths.contains(&second));
        assert_eq!(paths.iter().filter(|path| *path == &first).count(), 1);
    }
}
