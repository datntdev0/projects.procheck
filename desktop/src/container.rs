use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime};

use crate::infra::storage::StorageResult;
use crate::shared::env;

/// Folder name used under the OS local data directory.
const APP_FOLDER: &str = "Procheck";
const SETTINGS_FILE: &str = "settings.json";
const PROJECTS_FILE: &str = "projects.json";
const LOGS_DIR: &str = "logs";
const CACHE_DIR: &str = "cache";

/// Well-known locations inside the application data directory
/// (`%LOCALAPPDATA%\Procheck` by default). Project data never lives here.
#[derive(Debug, Clone)]
pub struct AppDirectories {
    pub root: PathBuf,
}

impl AppDirectories {
    /// Resolves (and creates) the data root, honoring env override and portable mode.
    pub fn resolve<R: Runtime>(app: &AppHandle<R>) -> Result<Self, Box<dyn std::error::Error>> {
        let root = match env::data_dir_override() {
            Some(dir) => dir,
            None => app.path().local_data_dir()?.join(APP_FOLDER),
        };
        Self::at(root).map_err(Into::into)
    }

    fn at(root: PathBuf) -> StorageResult<Self> {
        let directories = Self { root };
        for dir in [&directories.root, &directories.logs_dir(), &directories.cache_dir()] {
            fs::create_dir_all(dir)?;
        }
        Ok(directories)
    }

    /// App preferences (theme, language, defaults).
    pub fn settings_file(&self) -> PathBuf {
        self.root.join(SETTINGS_FILE)
    }

    /// Registry of known project directories.
    pub fn projects_file(&self) -> PathBuf {
        self.root.join(PROJECTS_FILE)
    }

    /// Application and harness logs.
    pub fn logs_dir(&self) -> PathBuf {
        self.root.join(LOGS_DIR)
    }

    /// Rebuildable data: indexes, thumbnails, temp files. Always safe to delete.
    pub fn cache_dir(&self) -> PathBuf {
        self.root.join(CACHE_DIR)
    }
}
