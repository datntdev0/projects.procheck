use log::LevelFilter;
use tauri::Manager;

use crate::commands;
use crate::container::AppDirectories;
use crate::features::settings::SettingsStore;
use crate::infra::logger;
use crate::shared::env;

/// Builds and runs the Tauri application.
pub fn run() {
    // Must happen before WebView2 is created so portable data stays next to the exe.
    env::prepare_portable_webview();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::diagnostics::diagnostics_logs,
            commands::diagnostics::diagnostics_export,
            commands::diagnostics::diagnostics_log,
            commands::settings::settings_get,
            commands::settings::settings_save,
            commands::settings::settings_pick_folder,
            commands::storage::storage_overview,
            commands::storage::storage_open,
        ])
        .setup(|app| {
            let directories = AppDirectories::resolve(app.handle())?;
            // Info until settings.json is read, so problems loading it are recorded.
            logger::init(&directories.logs_dir(), LevelFilter::Info);
            let package = app.package_info();
            log::info!("{} {} starting, data directory {}", package.name, package.version, directories.root.display());

            let settings = SettingsStore::load(directories.settings_file())
                .inspect_err(|e| log::error!("could not load settings: {e}"))?;
            let diagnostics = settings.get().diagnostics;
            logger::set_level(diagnostics.log_level.into());
            let pruned = logger::prune(
                &directories.logs_dir(),
                diagnostics.log_retention_days,
                chrono::Local::now().date_naive(),
            );
            if pruned > 0 {
                log::info!("deleted {pruned} log file(s) older than {} days", diagnostics.log_retention_days);
            }

            app.manage(directories);
            app.manage(settings);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Procheck");
}
