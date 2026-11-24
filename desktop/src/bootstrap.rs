use log::LevelFilter;
use tauri::Manager;

use crate::commands;
use crate::container::AppDirectories;
use crate::features::chats::runner::ChatRuns;
use crate::features::chats::store::ChatStore;
use crate::features::projects::registry::ProjectRegistry;
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
            commands::agents::agents_status,
            commands::agents::agents_test,
            commands::agents::agents_sign_in,
            commands::agents::agents_sign_out,
            commands::agents::agents_pick_binary,
            commands::chats::chats_overview,
            commands::chats::chats_create,
            commands::chats::chats_set_model,
            commands::chats::chats_messages,
            commands::chats::chats_rename,
            commands::chats::chats_pin,
            commands::chats::chats_delete,
            commands::chats::chats_stop,
            commands::chats::chats_send,
            commands::diagnostics::diagnostics_logs,
            commands::diagnostics::diagnostics_export,
            commands::diagnostics::diagnostics_log,
            commands::projects::projects_list,
            commands::projects::projects_open,
            commands::projects::projects_default_dir,
            commands::projects::projects_check_dir,
            commands::projects::projects_pick_sources,
            commands::projects::projects_describe_sources,
            commands::projects::projects_inspect_repo,
            commands::projects::projects_create,
            commands::projects::projects_update,
            commands::projects::projects_remove,
            commands::projects::projects_delete,
            commands::projects::projects_reveal,
            commands::projects::projects_open_in_vscode,
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

            let chats = ChatStore::open(directories.chats_dir()).inspect_err(|e| log::error!("could not open the chat history: {e}"))?;
            let projects = ProjectRegistry::open(directories.projects_file())
                .inspect_err(|e| log::error!("could not open the project registry: {e}"))?;

            app.manage(directories);
            app.manage(settings);
            app.manage(chats);
            app.manage(projects);
            app.manage(ChatRuns::default());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Procheck");
}
