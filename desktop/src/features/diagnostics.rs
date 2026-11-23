//! Diagnostics: log folder summary and the support bundle (.zip with logs, settings and versions).
//! Project contents are never included.
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::Path;

use serde::Serialize;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::container::AppDirectories;
use crate::infra::logger;
use crate::infra::storage::disk;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogsSummary {
    pub dir: String,
    pub bytes: u64,
    pub files: usize,
}

pub fn logs_summary(directories: &AppDirectories) -> LogsSummary {
    let dir = directories.logs_dir();
    LogsSummary {
        bytes: disk::size_of(&dir).unwrap_or(0),
        files: logger::log_files(&dir).len(),
        dir: dir.display().to_string(),
    }
}

/// Versions and environment written to `system.txt` in the bundle.
pub struct SystemInfo {
    pub app_version: String,
    pub package_version: String,
    pub log_level: String,
}

/// Writes the support bundle to `dest`: `system.txt`, `settings.json` and every `logs/*.log`.
pub fn export_bundle(directories: &AppDirectories, info: &SystemInfo, dest: &Path) -> io::Result<()> {
    log::logger().flush();
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let mut zip = ZipWriter::new(File::create(dest)?);

    zip.start_file("system.txt", options).map_err(io::Error::other)?;
    zip.write_all(system_report(directories, info).as_bytes())?;

    let settings = directories.settings_file();
    if settings.is_file() {
        zip.start_file("settings.json", options).map_err(io::Error::other)?;
        zip.write_all(&fs::read(settings)?)?;
    }

    for path in logger::log_files(&directories.logs_dir()) {
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
        // A log file that cannot be read (e.g. locked) is skipped rather than failing the bundle.
        let Ok(bytes) = fs::read(&path) else { continue };
        zip.start_file(format!("logs/{name}"), options).map_err(io::Error::other)?;
        zip.write_all(&bytes)?;
    }

    zip.finish().map_err(io::Error::other)?.sync_all()
}

fn system_report(directories: &AppDirectories, info: &SystemInfo) -> String {
    [
        "Procheck diagnostics".to_owned(),
        format!("Generated: {}", chrono::Local::now().to_rfc3339()),
        format!("App version: {}", info.app_version),
        format!("Package version: {}", info.package_version),
        format!("Tauri: {}", tauri::VERSION),
        format!("OS: {} ({})", std::env::consts::OS, std::env::consts::ARCH),
        format!("Data directory: {}", directories.root.display()),
        format!("Log level: {}", info.log_level),
        String::new(),
    ]
    .join("\n")
}

/// Default file name of the bundle, e.g. `procheck-diagnostics-20261123-204103.zip`.
pub fn bundle_file_name() -> String {
    format!("procheck-diagnostics-{}.zip", chrono::Local::now().format("%Y%m%d-%H%M%S"))
}

#[cfg(test)]
mod tests {
    use std::io::Read;

    use super::*;

    #[test]
    fn bundle_holds_system_report_settings_and_logs_only() {
        let root = std::env::temp_dir().join(format!("procheck-diag-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let directories = AppDirectories::at(root.clone()).unwrap();
        fs::write(directories.settings_file(), "{}").unwrap();
        fs::write(directories.logs_dir().join("procheck-2026-11-23.log"), "hello").unwrap();
        fs::write(directories.logs_dir().join("other.txt"), "skip").unwrap();
        fs::write(directories.cache_dir().join("index.bin"), "skip").unwrap();
        let info = SystemInfo {
            app_version: "1.2.3".into(),
            package_version: "1.2.3".into(),
            log_level: "info".into(),
        };

        let dest = root.join("bundle.zip");
        export_bundle(&directories, &info, &dest).unwrap();

        let mut archive = zip::ZipArchive::new(File::open(&dest).unwrap()).unwrap();
        let mut names: Vec<String> = archive.file_names().map(|name| name.unwrap().into_owned()).collect();
        names.sort();
        assert_eq!(names, ["logs/procheck-2026-11-23.log", "settings.json", "system.txt"]);

        let mut report = String::new();
        archive.by_name("system.txt").unwrap().read_to_string(&mut report).unwrap();
        assert!(report.contains("App version: 1.2.3"));
        drop(archive);
        fs::remove_dir_all(root).unwrap();
    }
}
