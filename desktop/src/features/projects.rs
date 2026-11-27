//! Projects: a project is a directory holding `procheck.json` plus its data folders.
//! The application data directory only keeps `projects.json`, a registry pointing at them.
pub mod create;
pub mod customization;
pub mod edit;
pub mod layout;
pub mod registry;
pub mod repository;
pub mod sources;
pub mod vscode;

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::features::agents::AgentId;
use crate::infra::storage::{StorageResult, json_file};
use customization::Customization;
use layout::ProjectDirectories;
use registry::RegistryEntry;

pub const MANIFEST_VERSION: u32 = 1;

/// `release` is the Scaffolding phase; the id is kept for compatibility with the UI tokens.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProjectPhase {
    Initial,
    Release,
    Sdlc,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Methodology {
    Scrum,
    Kanban,
    Hybrid,
}

/// Language of the documents Procheck generates for a project; picked once when it is created.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DocumentLanguage {
    Vi,
    En,
}

/// Contents of `<project dir>\procheck.json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectManifest {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub code: Option<String>,
    pub client: Option<String>,
    pub industry: Option<String>,
    pub description: Option<String>,
    pub phase: ProjectPhase,
    pub methodology: Option<Methodology>,
    pub repository: Option<String>,
    /// Absent in projects created before document languages existed.
    #[serde(default)]
    pub document_language: Option<DocumentLanguage>,
    pub created_at: String,
}

/// Contents of `<project dir>\.procheck\settings.json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSettings {
    pub cli: AgentId,
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub customization: Option<Customization>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProjectStatus {
    Ready,
    /// The directory or its `procheck.json` is gone (moved, deleted, drive not mounted).
    Missing,
    /// `procheck.json` exists but cannot be read, or belongs to another project id.
    Invalid,
}

/// A registered project as shown in the project list.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectItem {
    pub id: String,
    pub dir: String,
    pub last_opened_at: String,
    pub status: ProjectStatus,
    pub manifest: Option<ProjectManifest>,
}

pub fn read_manifest(dir: &Path) -> StorageResult<Option<ProjectManifest>> {
    json_file::read(&ProjectDirectories::new(dir).manifest_file())
}

pub fn describe(entry: RegistryEntry) -> ProjectItem {
    let (status, manifest) = match read_manifest(Path::new(&entry.dir)) {
        Ok(Some(manifest)) if manifest.id == entry.id => (ProjectStatus::Ready, Some(manifest)),
        Ok(Some(_)) => (ProjectStatus::Invalid, None),
        Ok(None) => (ProjectStatus::Missing, None),
        Err(e) => {
            log::warn!("could not read the manifest of project {}: {e}", entry.id);
            (ProjectStatus::Invalid, None)
        }
    };
    ProjectItem {
        id: entry.id,
        dir: entry.dir,
        last_opened_at: entry.last_opened_at,
        status,
        manifest,
    }
}

/// Trimmed text, or `None` when it is blank.
pub fn clean(value: Option<String>) -> Option<String> {
    value.map(|v| v.trim().to_owned()).filter(|v| !v.is_empty())
}
