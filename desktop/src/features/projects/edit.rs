//! Project settings: editing `procheck.json`, unregistering a project and deleting its directory.
use std::fs;
use std::io;

use serde::Deserialize;

use super::layout::ProjectDirectories;
use super::registry::{ProjectRegistry, RegistryEntry};
use super::repository::{self, LinkError, RepositoryStatus};
use super::{ProjectItem, ProjectManifest, clean, describe};
use crate::infra::storage::{StorageError, json_file};

/// Editable fields of the manifest (General section of Project settings).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectUpdate {
    pub name: String,
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub client: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub repository: Option<String>,
}

#[derive(Debug)]
pub enum EditError {
    NotFound,
    /// The directory or its `procheck.json` is missing or belongs to another project.
    NotReady,
    NameRequired,
    RepositoryRequired,
    Repository(RepositoryStatus),
    Io(io::Error),
    Storage(StorageError),
}

impl EditError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::NotFound => "notFound",
            Self::NotReady => "notReady",
            Self::NameRequired => "nameRequired",
            Self::RepositoryRequired => "repositoryRequired",
            Self::Repository(_) => "invalidRepository",
            Self::Io(_) => "io",
            Self::Storage(_) => "storage",
        }
    }
}

impl std::fmt::Display for EditError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound => write!(f, "the project is not in the project list"),
            Self::NotReady => write!(f, "the project directory or its procheck.json cannot be read"),
            Self::NameRequired => write!(f, "the project name is required"),
            Self::RepositoryRequired => write!(f, "a project in SDLC needs a linked repository"),
            Self::Repository(status) => write!(f, "the linked repository cannot be used: {status:?}"),
            Self::Io(e) => write!(f, "I/O error: {e}"),
            Self::Storage(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for EditError {}

impl From<LinkError> for EditError {
    fn from(e: LinkError) -> Self {
        match e {
            LinkError::Required => Self::RepositoryRequired,
            LinkError::Invalid(status) => Self::Repository(status),
        }
    }
}

impl From<io::Error> for EditError {
    fn from(e: io::Error) -> Self {
        Self::Io(e)
    }
}

impl From<StorageError> for EditError {
    fn from(e: StorageError) -> Self {
        Self::Storage(e)
    }
}

/// A registered project whose `procheck.json` is readable and belongs to it.
pub struct ReadyProject {
    pub entry: RegistryEntry,
    pub manifest: ProjectManifest,
}

pub fn ready(registry: &ProjectRegistry, id: &str) -> Result<ReadyProject, EditError> {
    let entry = registry.find(id).ok_or(EditError::NotFound)?;
    let manifest = describe(entry.clone()).manifest.ok_or(EditError::NotReady)?;
    Ok(ReadyProject { entry, manifest })
}

/// Writes the edited fields to `procheck.json`. A newly linked repository must be a git work tree.
pub fn update(registry: &ProjectRegistry, id: &str, update: ProjectUpdate) -> Result<ProjectItem, EditError> {
    let ReadyProject { entry, manifest } = ready(registry, id)?;
    let name = clean(Some(update.name)).ok_or(EditError::NameRequired)?;
    let wanted = clean(update.repository);
    let repository = if wanted.is_some() && wanted == manifest.repository {
        wanted
    } else {
        repository::link(manifest.phase, wanted)?
    };
    let next = ProjectManifest {
        name,
        code: clean(update.code),
        client: clean(update.client),
        description: clean(update.description),
        repository,
        ..manifest
    };
    json_file::write(&ProjectDirectories::new(&entry.dir).manifest_file(), &next)?;
    log::info!("updated the manifest of project {id}");
    Ok(describe(entry))
}

/// Removes the project from the project list; its directory is kept.
pub fn remove(registry: &ProjectRegistry, id: &str) -> Result<(), EditError> {
    if !registry.remove(id)? {
        return Err(EditError::NotFound);
    }
    log::info!("removed project {id} from the project list");
    Ok(())
}

/// Deletes the project directory and removes the project from the list. Only a directory whose
/// `procheck.json` belongs to this project is deleted.
pub fn delete(registry: &ProjectRegistry, id: &str) -> Result<(), EditError> {
    let ReadyProject { entry, .. } = ready(registry, id)?;
    fs::remove_dir_all(&entry.dir)?;
    registry.remove(id)?;
    log::info!("deleted project {id} and its directory {}", entry.dir);
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use super::*;
    use crate::features::agents::AgentId;
    use crate::features::projects::create::{self, NewProject};
    use crate::features::projects::{DocumentLanguage, ProjectPhase, read_manifest};

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("procheck-edit-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn create_project(base: &Path, registry: &ProjectRegistry) -> ProjectItem {
        let input = NewProject {
            name: "Lotus Pay".into(),
            code: Some("LP".into()),
            client: Some("Lotus".into()),
            industry: None,
            description: None,
            dir: base.join("lotus-pay").display().to_string(),
            phase: ProjectPhase::Initial,
            document_language: DocumentLanguage::Vi,
            repository: None,
            sources: vec![],
            cli: AgentId::Claude,
            model: None,
        };
        create::create(input, registry, &mut |_| {}).unwrap()
    }

    fn update_of(name: &str) -> ProjectUpdate {
        ProjectUpdate {
            name: name.into(),
            code: Some(" lp2 ".into()),
            client: Some(" ".into()),
            description: Some("Merchant portal".into()),
            repository: None,
        }
    }

    #[test]
    fn update_rewrites_the_editable_fields_and_keeps_the_rest() {
        let base = temp_dir("update");
        let registry = ProjectRegistry::open(base.join("projects.json")).unwrap();
        let item = create_project(&base, &registry);
        let before = item.manifest.unwrap();

        let updated = update(&registry, &item.id, update_of("  Lotus Pay v2 ")).unwrap();

        let manifest = read_manifest(Path::new(&item.dir)).unwrap().unwrap();
        assert_eq!(updated.manifest.as_ref(), Some(&manifest));
        assert_eq!((manifest.name.as_str(), manifest.code.as_deref(), manifest.client.as_deref()), ("Lotus Pay v2", Some("lp2"), None));
        assert_eq!(manifest.description.as_deref(), Some("Merchant portal"));
        assert_eq!((manifest.id, manifest.created_at, manifest.phase), (before.id, before.created_at, before.phase));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn update_rejects_a_blank_name_and_a_folder_that_is_not_a_repository() {
        let base = temp_dir("invalid");
        let registry = ProjectRegistry::open(base.join("projects.json")).unwrap();
        let item = create_project(&base, &registry);
        let plain = base.join("plain");
        fs::create_dir_all(&plain).unwrap();

        assert!(matches!(update(&registry, &item.id, update_of("  ")), Err(EditError::NameRequired)));
        let linked = ProjectUpdate {
            repository: Some(plain.display().to_string()),
            ..update_of("Lotus Pay")
        };
        assert!(matches!(update(&registry, &item.id, linked), Err(EditError::Repository(_))));
        assert!(matches!(update(&registry, "unknown", update_of("x")), Err(EditError::NotFound)));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn remove_keeps_the_directory_and_delete_removes_it() {
        let base = temp_dir("delete");
        let registry = ProjectRegistry::open(base.join("projects.json")).unwrap();
        let kept = create_project(&base.join("kept"), &registry);
        let deleted = create_project(&base.join("deleted"), &registry);

        remove(&registry, &kept.id).unwrap();
        assert!(Path::new(&kept.dir).join("procheck.json").is_file());
        assert!(matches!(remove(&registry, &kept.id), Err(EditError::NotFound)));

        delete(&registry, &deleted.id).unwrap();
        assert!(!Path::new(&deleted.dir).exists());
        assert!(registry.entries().is_empty());
        fs::remove_dir_all(base).unwrap();
    }
}
