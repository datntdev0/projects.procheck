//! Artifacts of the Initial phase: the files an AI agent writes for each step, their review status
//! and the agent run that generates a step. A run streams its events over a channel and resolves
//! with its result once the CLI is done.
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;

use super::{CommandError, CommandResult, blocking};
use crate::container::AppDirectories;
use crate::features::projects::artifacts::catalog::{self, ArtifactFile, ArtifactsOverview, ReviewStatus};
use crate::features::projects::artifacts::generate::{self, GenerateContext, GenerateEvent, GenerateResult, GenerationRuns};
use crate::features::projects::artifacts::{ArtifactsError, Loaded, load};
use crate::features::projects::customization::PhaseCustomization;
use crate::features::projects::registry::ProjectRegistry;
use crate::features::projects::vscode;
use crate::features::settings::SettingsStore;

impl From<ArtifactsError> for CommandError {
    fn from(e: ArtifactsError) -> Self {
        CommandError::new(e.code(), e)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactContent {
    pub file: ArtifactFile,
    pub content: String,
}

fn initial_phase(loaded: &Loaded) -> Option<&PhaseCustomization> {
    loaded
        .settings
        .as_ref()
        .and_then(|s| s.customization.as_ref())
        .map(|c| &c.phases.initial)
}

/// Steps, files and statuses of the project, and the run in progress.
#[tauri::command]
pub async fn artifacts_overview<R: Runtime>(app: AppHandle<R>, id: String) -> CommandResult<ArtifactsOverview> {
    blocking(move || {
        let loaded = load(&app.state::<ProjectRegistry>(), &id)?;
        let running = app.state::<GenerationRuns>().running(&id);
        let cli = loaded.settings.as_ref().map(|s| s.cli);
        Ok(catalog::overview(&loaded.dirs, cli, loaded.manifest.document_language, initial_phase(&loaded), running)?)
    })
    .await?
}

/// One artifact file with its content; `path` is relative to the project directory.
#[tauri::command]
pub async fn artifacts_read<R: Runtime>(app: AppHandle<R>, id: String, path: String) -> CommandResult<ArtifactContent> {
    blocking(move || {
        let loaded = load(&app.state::<ProjectRegistry>(), &id)?;
        let file = catalog::resolve(&loaded.dirs, &path)?;
        let content = String::from_utf8_lossy(&std::fs::read(file).map_err(ArtifactsError::from)?).into_owned();
        let file = catalog::describe(&loaded.dirs, initial_phase(&loaded), &path)?;
        Ok(ArtifactContent { file, content })
    })
    .await?
}

/// Runs the project's CLI as an agent for one step, reporting on `on_event`.
#[tauri::command]
pub async fn artifacts_generate<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    step_id: String,
    on_event: Channel<GenerateEvent>,
) -> CommandResult<GenerateResult> {
    blocking(move || {
        let agents = app.state::<SettingsStore>().get().agents;
        let ctx = GenerateContext {
            registry: &app.state::<ProjectRegistry>(),
            runs: &app.state::<GenerationRuns>(),
            claude: agents.claude,
            codex: agents.codex,
            cli_dir: app.state::<AppDirectories>().cli_dir(),
        };
        let mut emit = |event: GenerateEvent| {
            if let Err(e) = on_event.send(event) {
                log::debug!("generation event not delivered: {e}");
            }
        };
        Ok(generate::generate(&ctx, &id, &step_id, &mut emit)?)
    })
    .await?
}

/// Stops the run of the project; `false` when none is running.
#[tauri::command]
pub fn artifacts_generate_stop<R: Runtime>(app: AppHandle<R>, id: String) -> bool {
    app.state::<GenerationRuns>().stop(&id)
}

#[tauri::command]
pub async fn artifacts_set_status<R: Runtime>(app: AppHandle<R>, id: String, path: String, status: ReviewStatus) -> CommandResult<ArtifactFile> {
    blocking(move || {
        let loaded = load(&app.state::<ProjectRegistry>(), &id)?;
        Ok(catalog::set_status(&loaded.dirs, initial_phase(&loaded), &path, status)?)
    })
    .await?
}

/// Opens the project folder in VS Code with the file open.
#[tauri::command]
pub async fn artifacts_open_in_vscode<R: Runtime>(app: AppHandle<R>, id: String, path: String) -> CommandResult<()> {
    let (root, file) = {
        let loaded = load(&app.state::<ProjectRegistry>(), &id)?;
        (loaded.dirs.root.clone(), catalog::resolve(&loaded.dirs, &path)?)
    };
    let url = vscode::protocol_url(&file);
    let launched = blocking(move || vscode::open_file_with_cli(&root, &file))
        .await?
        .map_err(|e| CommandError::new("vscode", e))?;
    if launched {
        return Ok(());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| {
        log::warn!("could not open VS Code: {e}");
        CommandError::new("vscodeMissing", e)
    })
}

/// Shows the file in File Explorer.
#[tauri::command]
pub fn artifacts_reveal<R: Runtime>(app: AppHandle<R>, id: String, path: String) -> CommandResult<()> {
    let loaded = load(&app.state::<ProjectRegistry>(), &id)?;
    let file = catalog::resolve(&loaded.dirs, &path)?;
    app.opener().reveal_item_in_dir(file).map_err(|e| CommandError::new("opener", e))
}
