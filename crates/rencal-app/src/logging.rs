//! Logs to stderr and to the file bug reports ask for (`docs/notifications.md`
//! → "Logs for bug reports"), rotating at 1 MB and keeping 5 files like the
//! Tauri app did.
//!
//! renCal's own crates log at debug in debug builds and at info in release.
//! `RENCAL_DEBUG` (`just app '*'`) turns their debug logs on in any build; a
//! comma-separated value other than `*` keeps only debug logs whose target
//! contains one of the names (`RENCAL_DEBUG=theme,watchers`). Other crates log
//! warnings and errors only.

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use log::{Level, LevelFilter, Log, Metadata, Record};
use parking_lot::Mutex;

const FILE_NAME: &str = "renCal";
const MAX_FILE_SIZE: u64 = 1_000_000;
const KEEP_FILES: usize = 5;

pub fn init() {
    let debug = std::env::var("RENCAL_DEBUG")
        .ok()
        .filter(|value| !value.trim().is_empty());
    let namespaces = debug
        .as_deref()
        .filter(|value| value.trim() != "*")
        .map(|value| {
            value
                .split(',')
                .map(|name| name.trim().to_owned())
                .filter(|name| !name.is_empty())
                .collect()
        });
    let own_level = if debug.is_some() || cfg!(debug_assertions) {
        LevelFilter::Debug
    } else {
        LevelFilter::Info
    };
    let file = log_dir().and_then(|dir| match LogFile::open(&dir) {
        Ok(file) => Some(file),
        Err(err) => {
            eprintln!("renCal: cannot open the log file in {dir:?}: {err}");
            None
        }
    });
    let logger = Logger {
        own_level,
        namespaces,
        file: Mutex::new(file),
    };
    if log::set_boxed_logger(Box::new(logger)).is_ok() {
        log::set_max_level(own_level);
    }
}

/// Where the Tauri app's log plugin wrote: the app data dir's `logs/` on
/// Linux, `~/Library/Logs/<identifier>` on macOS.
fn log_dir() -> Option<PathBuf> {
    const IDENTIFIER: &str = "org.ren.rencal";
    if cfg!(target_os = "macos") {
        dirs::home_dir().map(|home| home.join("Library/Logs").join(IDENTIFIER))
    } else {
        dirs::data_dir().map(|data| data.join(IDENTIFIER).join("logs"))
    }
}

struct Logger {
    own_level: LevelFilter,
    namespaces: Option<Vec<String>>,
    file: Mutex<Option<LogFile>>,
}

impl Logger {
    fn is_own(target: &str) -> bool {
        target.starts_with("rencal")
    }
}

impl Log for Logger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        let target = metadata.target();
        if !Self::is_own(target) {
            return metadata.level() <= Level::Warn;
        }
        if metadata.level() > self.own_level {
            return false;
        }
        match (&self.namespaces, metadata.level()) {
            (Some(names), Level::Debug | Level::Trace) => {
                names.iter().any(|name| target.contains(name.as_str()))
            }
            _ => true,
        }
    }

    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        let line = format!(
            "[{}][{}][{}] {}\n",
            chrono::Local::now().format("%Y-%m-%d][%H:%M:%S"),
            record.level(),
            record.target(),
            record.args()
        );
        let _ = std::io::stderr().write_all(line.as_bytes());
        if let Some(file) = self.file.lock().as_mut() {
            file.write(line.as_bytes());
        }
    }

    fn flush(&self) {
        if let Some(file) = self.file.lock().as_mut() {
            let _ = file.file.flush();
        }
    }
}

struct LogFile {
    dir: PathBuf,
    file: File,
    size: u64,
}

impl LogFile {
    fn open(dir: &Path) -> std::io::Result<Self> {
        std::fs::create_dir_all(dir)?;
        let path = path(dir, 0);
        let file = OpenOptions::new().create(true).append(true).open(&path)?;
        let size = file.metadata()?.len();
        let mut log = Self {
            dir: dir.to_owned(),
            file,
            size,
        };
        if log.size >= MAX_FILE_SIZE {
            log.rotate()?;
        }
        Ok(log)
    }

    fn write(&mut self, bytes: &[u8]) {
        if self.size >= MAX_FILE_SIZE
            && let Err(err) = self.rotate()
        {
            eprintln!("renCal: log rotation failed: {err}");
        }
        if self.file.write_all(bytes).is_ok() {
            self.size += bytes.len() as u64;
        }
    }

    /// `renCal.log` → `renCal.1.log` → … → `renCal.4.log`, dropping the oldest.
    fn rotate(&mut self) -> std::io::Result<()> {
        for index in (1..KEEP_FILES).rev() {
            let from = path(&self.dir, index - 1);
            if from.exists() {
                std::fs::rename(&from, path(&self.dir, index))?;
            }
        }
        self.file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path(&self.dir, 0))?;
        self.size = 0;
        Ok(())
    }
}

fn path(dir: &Path, index: usize) -> PathBuf {
    if index == 0 {
        dir.join(format!("{FILE_NAME}.log"))
    } else {
        dir.join(format!("{FILE_NAME}.{index}.log"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotates_and_keeps_five_files() {
        let dir = tempfile::tempdir().unwrap();
        let mut file = LogFile::open(dir.path()).unwrap();
        let line = vec![b'x'; MAX_FILE_SIZE as usize];
        for _ in 0..7 {
            file.write(&line);
        }

        let mut names: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name().into_string().unwrap())
            .collect();
        names.sort();
        assert_eq!(
            names,
            [
                "renCal.1.log",
                "renCal.2.log",
                "renCal.3.log",
                "renCal.4.log",
                "renCal.log"
            ]
        );
    }

    #[test]
    fn namespaces_filter_only_debug_logs() {
        let logger = Logger {
            own_level: LevelFilter::Debug,
            namespaces: Some(vec!["theme".into()]),
            file: Mutex::new(None),
        };
        let enabled = |target: &str, level: Level| {
            logger.enabled(&Metadata::builder().target(target).level(level).build())
        };

        assert!(enabled("rencal_app::theme", Level::Debug));
        assert!(!enabled("rencal_app::watchers", Level::Debug));
        assert!(enabled("rencal_app::watchers", Level::Info));
        assert!(!enabled("wgpu_core::device", Level::Info));
        assert!(enabled("gpui::window", Level::Error));
    }
}
