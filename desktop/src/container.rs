use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime};

use crate::infra::storage::StorageResult;
use crate::shared::env;

/// Folder name used under the OS local data directory.
const APP_FOLDER: &str = "Procheck";
const DATABASE_FILE: &str = "application.sqlite";

/// Well-known directories used by the app.
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
        fs::create_dir_all(&root)?;
        Ok(Self { root })
    }

    pub fn database_path(&self) -> PathBuf {
        self.root.join(DATABASE_FILE)
    }
}
