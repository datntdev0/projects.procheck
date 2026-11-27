//! Settings → Agent Integration. The CLIs are the ones Procheck downloaded (see `tools`); each runs
//! with its home in the application data directory (`<data dir>\cli\<cli>`).
use tauri::State;

use super::{CommandError, CommandResult, blocking};
use crate::container::AppDirectories;
use crate::features::agents::{self, AgentError, AgentId, AgentStatus, TestResult};

impl From<AgentError> for CommandError {
    fn from(e: AgentError) -> Self {
        CommandError::new(e.code(), e)
    }
}

/// Downloaded version, sign-in state and models of one CLI.
#[tauri::command]
pub async fn agents_status(directories: State<'_, AppDirectories>, agent: AgentId) -> CommandResult<AgentStatus> {
    let home = directories.cli_home(agent.key());
    blocking(move || agents::status(agent, &home)).await
}

/// Sends one short prompt and reports how long the answer took.
#[tauri::command]
pub async fn agents_test(directories: State<'_, AppDirectories>, agent: AgentId, model: Option<String>) -> CommandResult<TestResult> {
    let (home, cwd) = (directories.cli_home(agent.key()), directories.scratch_dir());
    blocking(move || agents::test(agent, model.as_deref(), &home, &cwd)).await?.map_err(Into::into)
}

/// Opens the CLI's sign-in in a console window; resolves with the new status once it closes.
#[tauri::command]
pub async fn agents_sign_in(directories: State<'_, AppDirectories>, agent: AgentId) -> CommandResult<AgentStatus> {
    let (home, cwd) = (directories.cli_home(agent.key()), directories.scratch_dir());
    blocking(move || agents::sign_in(agent, &home, &cwd)).await?.map_err(Into::into)
}

#[tauri::command]
pub async fn agents_sign_out(directories: State<'_, AppDirectories>, agent: AgentId) -> CommandResult<AgentStatus> {
    let home = directories.cli_home(agent.key());
    blocking(move || agents::sign_out(agent, &home)).await?.map_err(Into::into)
}
