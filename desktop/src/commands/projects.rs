//! Projects: the project list (registry) and the New project wizard.
use std::path::{Path, PathBuf};

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_dialog::DialogExt;

use super::{CommandError, CommandResult, blocking};
use crate::features::projects::create::{self, CreateError, CreateProgress, DirectoryCheck, NewProject};
use crate::features::projects::registry::ProjectRegistry;
use crate::features::projects::repository::{self, RepositoryInfo};
use crate::features::projects::sources::{self, SOURCE_EXTENSIONS, SourceCandidate};
use crate::features::projects::{ProjectItem, describe};
use crate::infra::storage::StorageError;

const DEFAULT_PROJECTS_FOLDER: &str = "Procheck";

impl From<CreateError> for CommandError {
    fn from(e: CreateError) -> Self {
        CommandError::new(e.code(), e)
    }
}

impl From<StorageError> for CommandError {
    fn from(e: StorageError) -> Self {
        CommandError::new("storage", e)
    }
}

#[tauri::command]
pub fn projects_list(registry: State<'_, ProjectRegistry>) -> Vec<ProjectItem> {
    registry.entries().into_iter().map(describe).collect()
}

/// Marks a project as opened now (recent list order) and returns its current state.
#[tauri::command]
pub fn projects_open(registry: State<'_, ProjectRegistry>, id: String) -> CommandResult<ProjectItem> {
    registry
        .touch(&id)?
        .map(describe)
        .ok_or_else(|| CommandError::new("notFound", format!("project not found: {id}")))
}

/// Parent folder suggested for new projects: `Documents\Procheck`.
#[tauri::command]
pub fn projects_default_dir<R: Runtime>(app: AppHandle<R>) -> CommandResult<String> {
    app.path()
        .document_dir()
        .map(|dir| dir.join(DEFAULT_PROJECTS_FOLDER).display().to_string())
        .map_err(|e| CommandError::new("path", e))
}

#[tauri::command]
pub fn projects_check_dir(dir: String) -> DirectoryCheck {
    create::check_directory(Path::new(dir.trim()))
}

/// Native multi-file picker for raw source documents; empty when cancelled.
#[tauri::command]
pub async fn projects_pick_sources<R: Runtime>(app: AppHandle<R>, title: Option<String>) -> CommandResult<Vec<SourceCandidate>> {
    let mut dialog = app.dialog().file().add_filter("Documents", &SOURCE_EXTENSIONS);
    if let Some(title) = title {
        dialog = dialog.set_title(title);
    }
    let picked = blocking(move || dialog.blocking_pick_files()).await?.unwrap_or_default();
    picked
        .into_iter()
        .map(|file| file.into_path().map(|path| sources::describe(&path)))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::new("dialog", e))
}

/// Size and problems of files dropped on the window.
#[tauri::command]
pub fn projects_describe_sources(paths: Vec<String>) -> Vec<SourceCandidate> {
    paths.iter().map(|path| sources::describe(Path::new(path))).collect()
}

#[tauri::command]
pub async fn projects_inspect_repo(path: String) -> CommandResult<RepositoryInfo> {
    blocking(move || repository::inspect(&PathBuf::from(path.trim()))).await
}

/// Creates the project directory, reporting each step on `on_progress`.
#[tauri::command]
pub async fn projects_create<R: Runtime>(
    app: AppHandle<R>,
    input: NewProject,
    on_progress: Channel<CreateProgress>,
) -> CommandResult<ProjectItem> {
    blocking(move || {
        let registry = app.state::<ProjectRegistry>();
        create::create(input, &registry, &mut |step| report(&on_progress, step))
    })
    .await?
    .map_err(Into::into)
}

fn report(channel: &Channel<CreateProgress>, step: CreateProgress) {
    if let Err(e) = channel.send(step) {
        log::debug!("could not report project creation progress: {e}");
    }
}
