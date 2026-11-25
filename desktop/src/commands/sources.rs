//! Sources page: the files in a project's `sources\` folder and their catalog.
use std::path::PathBuf;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tauri_plugin_opener::OpenerExt;

use super::{CommandError, CommandResult, blocking};
use crate::features::projects::edit;
use crate::features::projects::layout::ProjectDirectories;
use crate::features::projects::registry::ProjectRegistry;
use crate::features::projects::sources::catalog::{self, SourceRecord};
use crate::features::projects::sources::import::{self, ImportError, ImportItem, ImportProgress};
use crate::features::projects::sources::kinds::SourceCategory;
use crate::features::projects::sources::{SourceCandidate, reconcile, safe_relative};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceList {
    /// Absolute path of the project's `sources\` folder.
    pub dir: String,
    pub sources: Vec<SourceRecord>,
}

impl From<ImportError> for CommandError {
    fn from(e: ImportError) -> Self {
        CommandError::new(e.code(), e)
    }
}

/// The catalog after picking up files added, edited or deleted outside Procheck.
#[tauri::command]
pub async fn sources_list<R: Runtime>(app: AppHandle<R>, id: String) -> CommandResult<SourceList> {
    blocking(move || {
        let dirs = project_dirs(&app.state::<ProjectRegistry>(), &id)?;
        let catalog = reconcile::reconcile(&dirs)?;
        Ok(SourceList {
            dir: dirs.sources_dir().display().to_string(),
            sources: catalog.sources,
        })
    })
    .await?
}

/// Native picker for files (or folders) to add; candidates are empty when cancelled.
#[tauri::command]
pub async fn sources_pick<R: Runtime>(app: AppHandle<R>, id: String, folders: bool, title: Option<String>) -> CommandResult<Vec<SourceCandidate>> {
    let dirs = project_dirs(&app.state::<ProjectRegistry>(), &id)?;
    let mut dialog = app.dialog().file();
    if let Some(title) = title {
        dialog = dialog.set_title(title);
    }
    blocking(move || {
        let picked = if folders { dialog.blocking_pick_folders() } else { dialog.blocking_pick_files() };
        let paths = to_paths(picked.unwrap_or_default())?;
        Ok(import::inspect(&dirs, &paths))
    })
    .await?
}

/// Files and folders dropped on the window, expanded and checked for duplicates.
#[tauri::command]
pub async fn sources_inspect<R: Runtime>(app: AppHandle<R>, id: String, paths: Vec<String>) -> CommandResult<Vec<SourceCandidate>> {
    let dirs = project_dirs(&app.state::<ProjectRegistry>(), &id)?;
    blocking(move || import::inspect(&dirs, &paths.into_iter().map(PathBuf::from).collect::<Vec<_>>())).await
}

/// Copies the files into `sources\`, reporting each file on `on_progress`.
#[tauri::command]
pub async fn sources_import<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    items: Vec<ImportItem>,
    on_progress: Channel<ImportProgress>,
) -> CommandResult<Vec<SourceRecord>> {
    let dirs = project_dirs(&app.state::<ProjectRegistry>(), &id)?;
    blocking(move || import::import(&dirs, &items, &mut |step| report(&on_progress, step)))
        .await?
        .map_err(Into::into)
}

/// Deletes the files from `sources\` together with their index.
#[tauri::command]
pub async fn sources_remove<R: Runtime>(app: AppHandle<R>, id: String, ids: Vec<String>) -> CommandResult<Vec<SourceRecord>> {
    let dirs = project_dirs(&app.state::<ProjectRegistry>(), &id)?;
    blocking(move || import::remove(&dirs, &ids)).await?.map_err(Into::into)
}

#[tauri::command]
pub fn sources_set_category(
    registry: State<'_, ProjectRegistry>,
    id: String,
    source_id: String,
    category: SourceCategory,
) -> CommandResult<SourceRecord> {
    let dirs = project_dirs(&registry, &id)?;
    catalog::update(&dirs, |catalog| catalog.set_category(&source_id, category))?.ok_or_else(|| not_found(&source_id))
}

/// Opens the file with its default app.
#[tauri::command]
pub fn sources_open<R: Runtime>(app: AppHandle<R>, registry: State<'_, ProjectRegistry>, id: String, source_id: String) -> CommandResult<()> {
    let file = source_file(&registry, &id, &source_id)?;
    app.opener()
        .open_path(file.display().to_string(), None::<&str>)
        .map_err(|e| CommandError::new("opener", e))
}

/// Shows the file in File Explorer, or opens the `sources\` folder when no file is given.
#[tauri::command]
pub fn sources_reveal<R: Runtime>(
    app: AppHandle<R>,
    registry: State<'_, ProjectRegistry>,
    id: String,
    source_id: Option<String>,
) -> CommandResult<()> {
    let opener = app.opener();
    let result = match source_id {
        Some(source_id) => opener.reveal_item_in_dir(source_file(&registry, &id, &source_id)?),
        None => {
            let dir = project_dirs(&registry, &id)?.sources_dir();
            std::fs::create_dir_all(&dir).map_err(|e| CommandError::new("io", e))?;
            opener.open_path(dir.display().to_string(), None::<&str>)
        }
    };
    result.map_err(|e| CommandError::new("opener", e))
}

fn project_dirs(registry: &ProjectRegistry, id: &str) -> CommandResult<ProjectDirectories> {
    let project = edit::ready(registry, id)?;
    Ok(ProjectDirectories::new(project.entry.dir))
}

fn source_file(registry: &ProjectRegistry, id: &str, source_id: &str) -> CommandResult<PathBuf> {
    let dirs = project_dirs(registry, id)?;
    let catalog = catalog::read(&dirs)?;
    let record = catalog.find(source_id).ok_or_else(|| not_found(source_id))?;
    let relative = safe_relative(&record.path).ok_or_else(|| not_found(source_id))?;
    let file = dirs.sources_dir().join(relative);
    if file.is_file() {
        Ok(file)
    } else {
        Err(CommandError::new("missing", format!("the file is no longer in the sources folder: {}", record.path)))
    }
}

fn to_paths(picked: Vec<FilePath>) -> CommandResult<Vec<PathBuf>> {
    picked
        .into_iter()
        .map(FilePath::into_path)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| CommandError::new("dialog", e))
}

fn not_found(source_id: &str) -> CommandError {
    CommandError::new("notFound", format!("source not found: {source_id}"))
}

fn report(channel: &Channel<ImportProgress>, step: ImportProgress) {
    if let Err(e) = channel.send(step) {
        log::debug!("could not report source import progress: {e}");
    }
}
