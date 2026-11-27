//! Artifacts of the Initial phase: Markdown files an AI agent writes into
//! `<project dir>\artifacts\initial\<artifact id>\`. The project directory is a git repository, so
//! the versions of a file are its commits (`history`), `catalog` lists the files with their review
//! status, `prompt` builds the instructions of an agent run and `generate` runs it.
pub mod catalog;
pub mod generate;
pub mod history;
pub mod prompt;

use std::io;

use super::edit::{self, EditError};
use super::layout::ProjectDirectories;
use super::registry::ProjectRegistry;
use super::{ProjectManifest, ProjectSettings};
use crate::features::agents::AgentError;
use crate::infra::storage::{StorageError, json_file};
use history::HistoryError;

/// Where the files of the Initial phase live, relative to the project directory.
pub const INITIAL_DIR: &str = "artifacts/initial";

#[derive(Debug)]
pub enum ArtifactsError {
    NotFound,
    /// The directory or `procheck.json` / `settings.json` of the project cannot be read.
    NotReady,
    /// The project has no customization (created before it existed).
    NotSupported,
    /// The path is not a file below `artifacts/`.
    InvalidPath,
    /// `git` is not installed.
    GitMissing,
    /// Another run is in progress in this project.
    Busy,
    /// An earlier step has no successful run yet.
    StepLocked,
    Agent(AgentError),
    /// A git command failed.
    Git(String),
    Io(io::Error),
    Storage(StorageError),
}

impl ArtifactsError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::NotFound => "notFound",
            Self::NotReady => "notReady",
            Self::NotSupported => "notSupported",
            Self::InvalidPath => "invalidPath",
            Self::GitMissing => "gitMissing",
            Self::Busy => "busy",
            Self::StepLocked => "stepLocked",
            Self::Agent(AgentError::NotInstalled(_)) => "cliMissing",
            Self::Agent(AgentError::SignedOut) => "notSignedIn",
            Self::Agent(e) => e.code(),
            Self::Git(_) => "git",
            Self::Io(_) => "io",
            Self::Storage(_) => "storage",
        }
    }
}

impl std::fmt::Display for ArtifactsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound => write!(f, "the project, step or file was not found"),
            Self::NotReady => write!(f, "the project directory or its settings cannot be read"),
            Self::NotSupported => write!(f, "the project has no customization"),
            Self::InvalidPath => write!(f, "the path is not a file in the artifacts folder"),
            Self::GitMissing => write!(f, "git is not installed"),
            Self::Busy => write!(f, "an AI run is already in progress in this project"),
            Self::StepLocked => write!(f, "an earlier step has not been generated yet"),
            Self::Agent(e) => write!(f, "{e}"),
            Self::Git(e) => write!(f, "git failed: {e}"),
            Self::Io(e) => write!(f, "I/O error: {e}"),
            Self::Storage(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for ArtifactsError {}

impl From<io::Error> for ArtifactsError {
    fn from(e: io::Error) -> Self {
        Self::Io(e)
    }
}

impl From<StorageError> for ArtifactsError {
    fn from(e: StorageError) -> Self {
        Self::Storage(e)
    }
}

impl From<AgentError> for ArtifactsError {
    fn from(e: AgentError) -> Self {
        Self::Agent(e)
    }
}

impl From<HistoryError> for ArtifactsError {
    fn from(e: HistoryError) -> Self {
        match e {
            HistoryError::GitMissing => Self::GitMissing,
            HistoryError::Failed(why) => Self::Git(why),
            HistoryError::Io(e) => Self::Io(e),
            HistoryError::Storage(e) => Self::Storage(e),
        }
    }
}

impl From<EditError> for ArtifactsError {
    fn from(e: EditError) -> Self {
        match e {
            EditError::NotFound => Self::NotFound,
            EditError::Io(e) => Self::Io(e),
            EditError::Storage(e) => Self::Storage(e),
            // `edit::ready` only fails with the cases above or because the manifest is unusable.
            _ => Self::NotReady,
        }
    }
}

/// A ready project with its settings.
pub struct Loaded {
    pub dirs: ProjectDirectories,
    pub manifest: ProjectManifest,
    /// `None` when `settings.json` does not exist.
    pub settings: Option<ProjectSettings>,
}

pub fn load(registry: &ProjectRegistry, id: &str) -> Result<Loaded, ArtifactsError> {
    let project = edit::ready(registry, id)?;
    let dirs = ProjectDirectories::new(&project.entry.dir);
    let settings = json_file::read(&dirs.settings_file())?;
    Ok(Loaded {
        dirs,
        manifest: project.manifest,
        settings,
    })
}
