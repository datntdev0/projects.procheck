//! All chats page: general chats (no project). A turn streams its events over a channel and
//! resolves with the recorded answer once the CLI is done.
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime, State};

use super::{CommandError, CommandResult};
use crate::container::AppDirectories;
use crate::features::agents::AgentId;
use crate::features::chats::runner::{self, ChatEvent, ChatRunError, ChatRuns, TurnContext, TurnResult};
use crate::features::chats::store::{ChatStore, ChatStoreError};
use crate::features::chats::{ChatMessage, ChatSummary, UsageLimits};
use crate::features::settings::SettingsStore;

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
pub fn chats_create(store: State<'_, ChatStore>, agent: AgentId, model: Option<String>) -> CommandResult<ChatSummary> {
    Ok(store.create(agent, clean_model(model))?)
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
    let agents = app.state::<SettingsStore>().get().agents;
    let ctx = TurnContext {
        store: &app.state::<ChatStore>(),
        runs: &app.state::<ChatRuns>(),
        claude: agents.claude,
        codex: agents.codex,
        cli_dir: directories.cli_dir(),
        cwd: directories.scratch_dir(),
    };
    let mut emit = |event: ChatEvent| {
        if let Err(e) = channel.send(event) {
            log::debug!("chat event not delivered: {e}");
        }
    };
    Ok(runner::send(&ctx, id, text, &mut emit)?)
}
