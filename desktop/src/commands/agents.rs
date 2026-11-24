//! Settings → Agent Integration. Every command takes the executable path from the UI draft
//! (`binPath`, empty = find on PATH), so a path can be checked before it is saved. The CLI
//! always runs with its home in the application data directory (`<data dir>\cli\<cli>`).
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_dialog::DialogExt;

use super::{CommandError, CommandResult, blocking};
use crate::container::AppDirectories;
use crate::features::agents::{self, AgentError, AgentId, AgentStatus, TestResult};

impl From<AgentError> for CommandError {
    fn from(e: AgentError) -> Self {
        CommandError::new(e.code(), e)
    }
}

/// Executable, version, sign-in state and models of one CLI.
#[tauri::command]
pub async fn agents_status(
    directories: State<'_, AppDirectories>,
    agent: AgentId,
    bin_path: Option<String>,
) -> CommandResult<AgentStatus> {
    let home = directories.cli_home(agent.key());
    blocking(move || agents::status(agent, bin_path.as_deref(), &home)).await
}

/// Sends one short prompt and reports how long the answer took.
#[tauri::command]
pub async fn agents_test(
    directories: State<'_, AppDirectories>,
    agent: AgentId,
    bin_path: Option<String>,
    model: Option<String>,
) -> CommandResult<TestResult> {
    let (home, cwd) = (directories.cli_home(agent.key()), directories.scratch_dir());
    blocking(move || agents::test(agent, bin_path.as_deref(), model.as_deref(), &home, &cwd)).await?.map_err(Into::into)
}

/// Opens the CLI's sign-in in a console window; resolves with the new status once it closes.
#[tauri::command]
pub async fn agents_sign_in(
    directories: State<'_, AppDirectories>,
    agent: AgentId,
    bin_path: Option<String>,
) -> CommandResult<AgentStatus> {
    let (home, cwd) = (directories.cli_home(agent.key()), directories.scratch_dir());
    blocking(move || agents::sign_in(agent, bin_path.as_deref(), &home, &cwd)).await?.map_err(Into::into)
}

#[tauri::command]
pub async fn agents_sign_out(
    directories: State<'_, AppDirectories>,
    agent: AgentId,
    bin_path: Option<String>,
) -> CommandResult<AgentStatus> {
    let home = directories.cli_home(agent.key());
    blocking(move || agents::sign_out(agent, bin_path.as_deref(), &home)).await?.map_err(Into::into)
}

/// Native file picker for the CLI executable; `None` when cancelled.
#[tauri::command]
pub async fn agents_pick_binary<R: Runtime>(
    app: AppHandle<R>,
    title: Option<String>,
    start: Option<String>,
) -> CommandResult<Option<String>> {
    let mut dialog = app.dialog().file().add_filter("Programs", &["exe", "cmd", "bat", "ps1"]);
    if let Some(title) = title {
        dialog = dialog.set_title(title);
    }
    let start_dir = start
        .map(std::path::PathBuf::from)
        .and_then(|p| if p.is_dir() { Some(p) } else { p.parent().map(Into::into) })
        .filter(|p: &std::path::PathBuf| p.is_dir());
    if let Some(dir) = start_dir {
        dialog = dialog.set_directory(dir);
    }
    let picked = blocking(move || dialog.blocking_pick_file()).await?;
    picked
        .map(|path| path.into_path().map(|p| p.display().to_string()))
        .transpose()
        .map_err(|e| CommandError::new("dialog", e))
}
