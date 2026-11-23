use serde::Serialize;
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_dialog::DialogExt;

use super::{CommandError, CommandResult};
use crate::features::settings::{AppSettings, SettingsStore};
use crate::infra::logger;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSnapshot {
    /// Absolute path of `settings.json`.
    pub path: String,
    pub settings: AppSettings,
}

#[tauri::command]
pub fn settings_get(store: State<'_, SettingsStore>) -> SettingsSnapshot {
    SettingsSnapshot {
        path: store.path().display().to_string(),
        settings: store.get(),
    }
}

/// Replaces the settings and writes `settings.json`; returns the stored (normalized) settings.
/// The log level applies right away; log retention applies at the next startup.
#[tauri::command]
pub fn settings_save(store: State<'_, SettingsStore>, settings: AppSettings) -> CommandResult<AppSettings> {
    let saved = store.save(settings).map_err(|e| CommandError::new(e.code(), e))?;
    logger::set_level(saved.diagnostics.log_level.into());
    Ok(saved)
}

/// Native folder picker; `None` when cancelled.
#[tauri::command]
pub async fn settings_pick_folder<R: Runtime>(
    app: AppHandle<R>,
    title: Option<String>,
    start: Option<String>,
) -> CommandResult<Option<String>> {
    let mut dialog = app.dialog().file();
    if let Some(title) = title {
        dialog = dialog.set_title(title);
    }
    if let Some(start) = start.filter(|s| std::path::Path::new(s).is_dir()) {
        dialog = dialog.set_directory(start);
    }
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_pick_folder())
        .await
        .map_err(|e| CommandError::new("dialog", e))?;
    picked
        .map(|path| path.into_path().map(|p| p.display().to_string()))
        .transpose()
        .map_err(|e| CommandError::new("dialog", e))
}
