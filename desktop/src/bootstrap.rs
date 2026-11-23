use tauri::Manager;

use crate::commands;
use crate::container::AppDirectories;
use crate::shared::env;

/// Builds and runs the Tauri application.
pub fn run() {
    // Must happen before WebView2 is created so portable data stays next to the exe.
    env::prepare_portable_webview();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::storage::storage_overview,
            commands::storage::storage_open,
        ])
        .setup(|app| {
            let directories = AppDirectories::resolve(app.handle())?;
            app.manage(directories);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Procheck");
}
