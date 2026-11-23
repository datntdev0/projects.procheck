//! Application log: one plain-text file per day in `<data dir>\logs\procheck-YYYY-MM-DD.log`.
//!
//! - The level comes from Settings → Diagnostics and can change at runtime (`set_level`).
//! - Procheck's own records (targets `procheck::*` and `ui`, for messages sent by the UI) follow
//!   that level; third-party crates (tauri, wry, …) only log warnings and errors.
//! - Files older than the retention period are deleted at startup (`prune`).
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use chrono::{Local, NaiveDate};
use log::{LevelFilter, Log, Metadata, Record};

const FILE_PREFIX: &str = "procheck-";
const FILE_SUFFIX: &str = ".log";
/// Target used for records sent by the UI.
pub const UI_TARGET: &str = "ui";
const OWN_TARGET_PREFIX: &str = env!("CARGO_CRATE_NAME");

static LOGGER: OnceLock<FileLogger> = OnceLock::new();

struct OpenFile {
    date: NaiveDate,
    file: File,
}

struct FileLogger {
    dir: PathBuf,
    current: Mutex<Option<OpenFile>>,
}

impl FileLogger {
    fn write_line(&self, line: &str) -> io::Result<()> {
        let today = Local::now().date_naive();
        let mut current = self.current.lock().unwrap_or_else(|e| e.into_inner());
        if current.as_ref().is_none_or(|open| open.date != today) {
            fs::create_dir_all(&self.dir)?;
            let file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(self.dir.join(file_name(today)))?;
            *current = Some(OpenFile { date: today, file });
        }
        let open = current.as_mut().expect("log file is open");
        open.file.write_all(line.as_bytes())
    }
}

impl Log for FileLogger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        let own = metadata.target().starts_with(OWN_TARGET_PREFIX) || metadata.target() == UI_TARGET;
        let limit = if own { log::max_level() } else { log::max_level().min(LevelFilter::Warn) };
        metadata.level() <= limit
    }

    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        let line = format!(
            "{} {:<5} [{}] {}\n",
            Local::now().format("%Y-%m-%dT%H:%M:%S%.3f%:z"),
            record.level(),
            record.target(),
            record.args()
        );
        if cfg!(debug_assertions) {
            eprint!("{line}");
        }
        // Logging must never take the app down: a failed write is dropped.
        let _ = self.write_line(&line);
    }

    fn flush(&self) {
        if let Some(open) = self.current.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
            let _ = open.file.flush();
        }
    }
}

/// Installs the file logger (once per process) and a panic hook that records panics.
pub fn init(dir: &Path, level: LevelFilter) {
    let logger = LOGGER.get_or_init(|| FileLogger {
        dir: dir.to_owned(),
        current: Mutex::new(None),
    });
    if log::set_logger(logger).is_ok() {
        let default_hook = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            log::error!(target: OWN_TARGET_PREFIX, "panic: {info}");
            log::logger().flush();
            default_hook(info);
        }));
    }
    set_level(level);
}

/// Changes the level of Procheck's own records at runtime.
pub fn set_level(level: LevelFilter) {
    log::set_max_level(level);
}

/// Name of the log file for `date`.
pub fn file_name(date: NaiveDate) -> String {
    format!("{FILE_PREFIX}{}{FILE_SUFFIX}", date.format("%Y-%m-%d"))
}

/// Date encoded in a log file name, `None` for any other file.
fn file_date(name: &str) -> Option<NaiveDate> {
    let date = name.strip_prefix(FILE_PREFIX)?.strip_suffix(FILE_SUFFIX)?;
    NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()
}

/// Every log file in `dir`, oldest first.
pub fn log_files(dir: &Path) -> Vec<PathBuf> {
    let mut files: Vec<(NaiveDate, PathBuf)> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let date = file_date(entry.file_name().to_str()?)?;
            Some((date, entry.path()))
        })
        .collect();
    files.sort();
    files.into_iter().map(|(_, path)| path).collect()
}

/// Deletes log files older than `retention_days` (today's file always stays). Returns how many were deleted.
pub fn prune(dir: &Path, retention_days: u32, today: NaiveDate) -> usize {
    let Some(oldest_kept) = today.checked_sub_days(chrono::Days::new(u64::from(retention_days.saturating_sub(1))))
    else {
        return 0;
    };
    log_files(dir)
        .into_iter()
        .filter(|path| {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or_default();
            file_date(name).is_some_and(|date| date < oldest_kept)
        })
        .filter(|path| fs::remove_file(path).is_ok())
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn file_names_round_trip() {
        let day = date("2026-11-23");
        assert_eq!(file_name(day), "procheck-2026-11-23.log");
        assert_eq!(file_date(&file_name(day)), Some(day));
        assert_eq!(file_date("procheck-latest.log"), None);
        assert_eq!(file_date("settings.json"), None);
    }

    #[test]
    fn prune_keeps_the_retention_window_and_other_files() {
        let dir = std::env::temp_dir().join(format!("procheck-logs-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        for day in ["2026-11-01", "2026-11-09", "2026-11-10", "2026-11-23"] {
            fs::write(dir.join(file_name(date(day))), "x").unwrap();
        }
        fs::write(dir.join("notes.txt"), "keep").unwrap();

        // 14 days ending today = 2026-11-10 ..= 2026-11-23.
        assert_eq!(prune(&dir, 14, date("2026-11-23")), 2);

        let left: Vec<String> = log_files(&dir)
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert_eq!(left, ["procheck-2026-11-10.log", "procheck-2026-11-23.log"]);
        assert!(dir.join("notes.txt").exists());
        fs::remove_dir_all(dir).unwrap();
    }
}
