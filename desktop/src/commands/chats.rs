//! Chats: general chats (no project) and project chats. A turn streams its events over a channel
//! and resolves with the recorded answer once the CLI is done.
use std::path::PathBuf;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime, State};

use super::{CommandError, CommandResult};
use crate::container::AppDirectories;
use crate::features::agents::AgentId;
use crate::features::chats::runner::{self, ChatEvent, ChatRunError, ChatRuns, TurnContext, TurnResult};
use crate::features::chats::store::{ChatStore, ChatStoreError};
use crate::features::chats::{ChatMessage, ChatSummary, ToolAccess, UsageLimits};
use crate::features::projects::edit::{self, EditError};
use crate::features::projects::registry::ProjectRegistry;
use crate::features::settings::SettingsStore;

const PROJECT_UNAVAILABLE: &str = "projectUnavailable";

impl From<ChatStoreError> for CommandError {
    fn from(e: ChatStoreError) -> Self {
        CommandError::new(e.code(), e)
    }
}

impl From<ChatRunError> for CommandError {
    fn from(e: ChatRunError) -> Self {
        CommandError::new(e.code(), e)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatsOverview {
    pub chats_dir: String,
    pub working_dir: String,
    pub cli_dir: String,
    pub chats: Vec<ChatSummary>,
    pub limits: Vec<UsageLimits>,
    pub running: Vec<String>,
}

#[tauri::command]
pub fn chats_overview(
    directories: State<'_, AppDirectories>,
    store: State<'_, ChatStore>,
    runs: State<'_, ChatRuns>,
) -> ChatsOverview {
    ChatsOverview {
        chats_dir: store.dir().display().to_string(),
        working_dir: directories.scratch_dir().display().to_string(),
        cli_dir: directories.cli_dir().display().to_string(),
        chats: store.list(),
        limits: store.limits(),
        running: runs.running(),
    }
}

#[tauri::command]
pub fn chats_create(
    store: State<'_, ChatStore>,
    registry: State<'_, ProjectRegistry>,
    agent: AgentId,
    model: Option<String>,
    project_id: Option<String>,
) -> CommandResult<ChatSummary> {
    if let Some(project_id) = &project_id {
        project_dir(&registry, project_id)?;
    }
    Ok(store.create(agent, clean_model(model), project_id)?)
}

fn project_dir(registry: &ProjectRegistry, project_id: &str) -> CommandResult<PathBuf> {
    edit::ready(registry, project_id)
        .map(|project| PathBuf::from(project.entry.dir))
        .map_err(|e: EditError| CommandError::new(PROJECT_UNAVAILABLE, e))
}

#[tauri::command]
pub fn chats_set_model(store: State<'_, ChatStore>, id: String, model: Option<String>) -> CommandResult<ChatSummary> {
    let model = clean_model(model);
    Ok(store.update(&id, |c| c.selected_model = model)?)
}

fn clean_model(model: Option<String>) -> Option<String> {
    model.map(|m| m.trim().to_owned()).filter(|m| !m.is_empty())
}

#[tauri::command]
pub fn chats_messages(store: State<'_, ChatStore>, id: String) -> CommandResult<Vec<ChatMessage>> {
    Ok(store.messages(&id)?)
}

#[tauri::command]
pub fn chats_rename(store: State<'_, ChatStore>, id: String, title: String) -> CommandResult<ChatSummary> {
    let title = title.trim().to_owned();
    if title.is_empty() {
        return Err(CommandError::new("empty", "the title is empty"));
    }
    Ok(store.update(&id, |c| c.title = title)?)
}

#[tauri::command]
pub fn chats_pin(store: State<'_, ChatStore>, id: String, pinned: bool) -> CommandResult<ChatSummary> {
    Ok(store.update(&id, |c| c.pinned = pinned)?)
}

#[tauri::command]
pub fn chats_delete(store: State<'_, ChatStore>, runs: State<'_, ChatRuns>, id: String) -> CommandResult<()> {
    if runs.running().contains(&id) {
        return Err(ChatRunError::Busy.into());
    }
    Ok(store.delete(&id)?)
}

#[tauri::command]
pub fn chats_stop(runs: State<'_, ChatRuns>, id: String) -> bool {
    runs.stop(&id)
}

#[tauri::command]
pub async fn chats_send<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    text: String,
    on_event: Channel<ChatEvent>,
) -> CommandResult<TurnResult> {
    tauri::async_runtime::spawn_blocking(move || run_turn(&app, &id, &text, &on_event))
        .await
        .map_err(|e| CommandError::new("failed", e))?
}

fn run_turn<R: Runtime>(app: &AppHandle<R>, id: &str, text: &str, channel: &Channel<ChatEvent>) -> CommandResult<TurnResult> {
    let directories = app.state::<AppDirectories>();
    let store = app.state::<ChatStore>();
    let agents = app.state::<SettingsStore>().get().agents;
    let (cwd, access) = match store.get(id)?.project_id {
        Some(project_id) => (project_dir(&app.state::<ProjectRegistry>(), &project_id)?, ToolAccess::ProjectFiles),
        None => (directories.scratch_dir(), ToolAccess::None),
    };
    let ctx = TurnContext {
        store: &store,
        runs: &app.state::<ChatRuns>(),
        claude: agents.claude,
        codex: agents.codex,
        cli_dir: directories.cli_dir(),
        cwd,
        access,
        bin: None,
    };
    let mut emit = |event: ChatEvent| {
        if let Err(e) = channel.send(event) {
            log::debug!("chat event not delivered: {e}");
        }
    };
    Ok(runner::send(&ctx, id, text, &mut emit)?)
}
