use std::sync::Mutex;

use tauri::Manager;

use crate::container::AppDirectories;
use crate::infra::storage::database::Database;
use crate::infra::storage::migrator::Migrator;
use crate::shared::env;

/// Builds and runs the Tauri application.
pub fn run() {
    // Must happen before WebView2 is created so portable data stays next to the exe.
    env::prepare_portable_webview();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![])
        .setup(|app| {
            let directories = AppDirectories::resolve(app.handle())?;
            let mut database = Database::open(&directories.database_path())?;
            Migrator::new().migrate(&mut database)?;

            app.manage(directories);
            app.manage(Mutex::new(database));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Procheck");
}
