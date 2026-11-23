use std::path::PathBuf;

use log::Level;
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_dialog::DialogExt;

use super::{CommandError, CommandResult};
use crate::container::AppDirectories;
use crate::features::diagnostics::{self, LogsSummary, SystemInfo};
use crate::features::settings::SettingsStore;
use crate::infra::logger::UI_TARGET;

#[tauri::command]
pub fn diagnostics_logs(directories: State<'_, AppDirectories>) -> LogsSummary {
    diagnostics::logs_summary(&directories)
}

/// Asks where to save the support bundle (Downloads by default) and writes it.
/// Returns the saved path, or `None` when cancelled.
#[tauri::command]
pub async fn diagnostics_export<R: Runtime>(
    app: AppHandle<R>,
    app_version: String,
    title: Option<String>,
) -> CommandResult<Option<String>> {
    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(diagnostics::bundle_file_name())
        .add_filter("Zip", &["zip"]);
    if let Some(title) = title {
        dialog = dialog.set_title(title);
    }
    if let Ok(downloads) = app.path().download_dir() {
        dialog = dialog.set_directory(downloads);
    }

    let worker = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let Some(picked) = dialog.blocking_save_file() else {
            return Ok(None);
        };
        let dest: PathBuf = picked.into_path().map_err(|e| CommandError::new("dialog", e))?;
        let directories = worker.state::<AppDirectories>();
        let settings = worker.state::<SettingsStore>().get();
        let info = SystemInfo {
            app_version,
            package_version: worker.package_info().version.to_string(),
            log_level: format!("{:?}", settings.diagnostics.log_level).to_lowercase(),
        };
        diagnostics::export_bundle(&directories, &info, &dest)
            .inspect(|()| log::info!("diagnostics exported to {}", dest.display()))
            .inspect_err(|e| log::error!("could not export diagnostics to {}: {e}", dest.display()))
            .map_err(|e| CommandError::new("io", e))?;
        Ok(Some(dest.display().to_string()))
    })
    .await
    .map_err(|e| CommandError::new("dialog", e))?
}

/// Writes a record from the UI to the application log (target `ui`).
#[tauri::command]
pub fn diagnostics_log(level: String, message: String) {
    let level = match level.as_str() {
        "error" => Level::Error,
        "warn" => Level::Warn,
        "debug" => Level::Debug,
        _ => Level::Info,
    };
    log::log!(target: UI_TARGET, level, "{message}");
}
