use tauri::{AppHandle, Runtime, State};
use tauri_plugin_opener::OpenerExt;

use crate::container::AppDirectories;
use crate::features::storage::{self, StorageEntry, StorageOverview};

/// Application data directory with the size of each known entry.
#[tauri::command]
pub fn storage_overview(directories: State<'_, AppDirectories>) -> StorageOverview {
    storage::overview(&directories)
}

/// Opens the application data directory, or one of its entries, in the OS file manager.
/// Files are revealed (selected in their folder) rather than opened.
#[tauri::command]
pub fn storage_open<R: Runtime>(
    app: AppHandle<R>,
    directories: State<'_, AppDirectories>,
    entry: Option<StorageEntry>,
) -> Result<(), String> {
    let opener = app.opener();
    let result = match entry {
        None => opener.open_path(directories.root.display().to_string(), None::<&str>),
        Some(entry) => {
            let path = entry.path(&directories);
            if entry.is_directory() {
                std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
                opener.open_path(path.display().to_string(), None::<&str>)
            } else if path.exists() {
                opener.reveal_item_in_dir(&path)
            } else {
                opener.open_path(directories.root.display().to_string(), None::<&str>)
            }
        }
    };
    result.map_err(|e| e.to_string())
}
