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
const SCRATCH_DIR: &str = "scratch";
const CLI_DIR: &str = "cli";
const CHATS_DIR: &str = "chats";
const TOOLS_DIR: &str = "tools";
const GIT_DIR: &str = "git";

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

    pub(crate) fn at(root: PathBuf) -> StorageResult<Self> {
        let directories = Self { root };
        for dir in [
            &directories.root,
            &directories.logs_dir(),
            &directories.cache_dir(),
            &directories.scratch_dir(),
            &directories.cli_dir(),
            &directories.chats_dir(),
        ] {
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

    /// Empty working directory for CLI runs that belong to no project (connection tests, general chats).
    pub fn scratch_dir(&self) -> PathBuf {
        self.root.join(SCRATCH_DIR)
    }

    /// Home folders of the AI CLIs Procheck runs (sign-in, config, sessions), one per CLI.
    pub fn cli_dir(&self) -> PathBuf {
        self.root.join(CLI_DIR)
    }

    /// Home folder of one CLI (`cli\claude`, `cli\codex`): the CLI's own config directory
    /// while Procheck runs it, kept apart from the user's profile.
    pub fn cli_home(&self, cli: &str) -> PathBuf {
        self.cli_dir().join(cli)
    }

    pub fn chats_dir(&self) -> PathBuf {
        self.root.join(CHATS_DIR)
    }

    /// Downloaded tools: Git, Claude Code and Codex CLI.
    pub fn tools_dir(&self) -> PathBuf {
        self.root.join(TOOLS_DIR)
    }

    /// Procheck's own git configuration.
    pub fn git_dir(&self) -> PathBuf {
        self.root.join(GIT_DIR)
    }
}
