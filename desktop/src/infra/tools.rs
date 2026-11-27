//! Tools Procheck downloads and runs from its own data directory: Git (PortableGit), Claude Code and
//! Codex CLI. Which version of each is wanted is fixed in `tools.manifest.json`. Nothing here looks
//! at the user's `PATH` or at what else is installed on the PC.
//!
//! ```text
//! <data dir>\tools\.downloads\   archives being downloaded (`.part`) or waiting to be installed
//! <data dir>\tools\<id>\         one install per tool, with `.procheck-tool.json` as its marker
//! <data dir>\git\config          Procheck's own git configuration (see `git`)
//! ```
pub mod download;
pub mod install;
pub mod manifest;
pub mod models;
pub mod service;

use std::path::PathBuf;
use std::sync::OnceLock;

use manifest::ToolId;

const TOOLS_DIR: &str = "tools";
const DOWNLOADS_DIR: &str = ".downloads";
const GIT_DIR: &str = "git";
const GIT_CONFIG_FILE: &str = "config";
/// Bash of PortableGit, which Claude Code needs on Windows.
const GIT_BASH: &str = "bin/bash.exe";

/// Where the tools live, below the application data directory.
#[derive(Debug, Clone)]
pub struct Layout {
    pub data_dir: PathBuf,
}

impl Layout {
    pub fn tools_dir(&self) -> PathBuf {
        self.data_dir.join(TOOLS_DIR)
    }

    pub fn downloads_dir(&self) -> PathBuf {
        self.tools_dir().join(DOWNLOADS_DIR)
    }

    pub fn install_dir(&self, id: ToolId) -> PathBuf {
        self.tools_dir().join(id.key())
    }

    /// The executable of an installed tool (it may not exist).
    pub fn executable(&self, id: ToolId) -> PathBuf {
        self.install_dir(id).join(&manifest::item(id).entry)
    }

    /// The folder holding `git.exe`, put in front of `PATH` for the CLIs.
    pub fn git_cmd_dir(&self) -> PathBuf {
        self.install_dir(ToolId::Git).join("cmd")
    }

    pub fn git_bash(&self) -> PathBuf {
        self.install_dir(ToolId::Git).join(GIT_BASH)
    }

    /// Procheck's own git configuration folder.
    pub fn git_dir(&self) -> PathBuf {
        self.data_dir.join(GIT_DIR)
    }

    pub fn git_config(&self) -> PathBuf {
        self.git_dir().join(GIT_CONFIG_FILE)
    }
}

static LAYOUT: OnceLock<Layout> = OnceLock::new();

/// Sets the data directory the tools live in. Called once at startup.
pub fn init(data_dir: PathBuf) {
    if LAYOUT.set(Layout { data_dir }).is_err() {
        log::warn!("the tools layout was already set");
    }
}

/// `None` before `init`, which only happens in unit tests.
pub fn layout() -> Option<&'static Layout> {
    LAYOUT.get()
}

/// The executable of `id` when it is installed.
pub fn installed_executable(id: ToolId) -> Option<PathBuf> {
    let layout = layout()?;
    install::installed(layout, id)?;
    Some(layout.executable(id))
}
