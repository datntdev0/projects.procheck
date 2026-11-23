use tauri::Manager;

use crate::commands;
use crate::container::AppDirectories;
use crate::features::settings::SettingsStore;
use crate::shared::env;

/// Builds and runs the Tauri application.
pub fn run() {
    // Must happen before WebView2 is created so portable data stays next to the exe.
    env::prepare_portable_webview();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::settings::settings_get,
            commands::settings::settings_save,
            commands::settings::settings_pick_folder,
            commands::storage::storage_overview,
            commands::storage::storage_open,
        ])
        .setup(|app| {
            let directories = AppDirectories::resolve(app.handle())?;
            let settings = SettingsStore::load(directories.settings_file())?;

            app.manage(directories);
            app.manage(settings);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Procheck");
}
