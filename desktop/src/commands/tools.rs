//! Tools Procheck downloads: Git (needed to start), Claude Code and Codex CLI. An install streams its
//! progress over a channel and resolves with the snapshot once it is done; a tool that fails is
//! reported in its item, not as a rejection.
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime, State};

use super::{CommandError, CommandResult, blocking};
use crate::infra::tools::manifest::ToolId;
use crate::infra::tools::models::{ToolsEvent, ToolsSnapshot};
use crate::infra::tools::service::ToolsService;

/// What is installed (reads the install markers; starts no process).
#[tauri::command]
pub async fn tools_check<R: Runtime>(app: AppHandle<R>) -> CommandResult<ToolsSnapshot> {
    blocking(move || app.state::<ToolsService>().check()).await
}

/// Downloads and installs `ids` one after another, reporting on `on_event`.
#[tauri::command]
pub async fn tools_install<R: Runtime>(app: AppHandle<R>, ids: Vec<ToolId>, on_event: Channel<ToolsEvent>) -> CommandResult<ToolsSnapshot> {
    blocking(move || {
        let sink = |event: ToolsEvent| {
            if let Err(e) = on_event.send(event) {
                log::debug!("tools event not delivered: {e}");
            }
        };
        app.state::<ToolsService>().install(&ids, &sink)
    })
    .await?
    .map_err(|_| CommandError::new("busy", "a download is already running"))
}

/// Stops the download in progress; `false` when none is running.
#[tauri::command]
pub fn tools_cancel(service: State<'_, ToolsService>) -> bool {
    service.cancel()
}
