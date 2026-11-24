//! New project: validates the wizard input, writes the project directory and registers it.
//! Anything written before a failure is removed again, so a failed attempt leaves no trace.
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::layout::ProjectDirectories;
use super::registry::{ProjectRegistry, RegistryEntry};
use super::repository::{self, LinkError, RepositoryStatus};
use super::sources::{self, SourceProblem};
use super::{MANIFEST_VERSION, ProjectItem, ProjectManifest, ProjectPhase, ProjectSettings, clean, describe};
use crate::features::agents::AgentId;
use crate::features::chats::now;
use crate::infra::storage::{StorageError, json_file};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewProject {
    pub name: String,
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub client: Option<String>,
    #[serde(default)]
    pub industry: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    pub dir: String,
    pub phase: ProjectPhase,
    #[serde(default)]
    pub repository: Option<String>,
    #[serde(default)]
    pub sources: Vec<String>,
    pub cli: AgentId,
    #[serde(default)]
    pub model: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DirectoryCheck {
    /// Missing (it will be created) or an empty folder.
    Available,
    NotAbsolute,
    NotDirectory,
    NotEmpty,
    Unreadable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "step", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum CreateProgress {
    Directories,
    Source { index: usize, total: usize, name: String },
    Settings,
    Manifest,
    Registry,
}

#[derive(Debug)]
pub enum CreateError {
    NameRequired,
    Directory(DirectoryCheck),
    RepositoryRequired,
    Repository(RepositoryStatus),
    Source { path: String, problem: SourceProblem },
    Io(io::Error),
    Storage(StorageError),
}

impl CreateError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::NameRequired => "nameRequired",
            Self::Directory(_) => "invalidDirectory",
            Self::RepositoryRequired => "repositoryRequired",
            Self::Repository(_) => "invalidRepository",
            Self::Source { .. } => "invalidSource",
            Self::Io(_) => "io",
            Self::Storage(_) => "storage",
        }
    }
}

impl std::fmt::Display for CreateError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NameRequired => write!(f, "the project name is required"),
            Self::Directory(check) => write!(f, "the project directory cannot be used: {check:?}"),
            Self::RepositoryRequired => write!(f, "a linked repository is required to start from SDLC"),
            Self::Repository(status) => write!(f, "the linked repository cannot be used: {status:?}"),
            Self::Source { path, problem } => write!(f, "source {path} cannot be added: {problem:?}"),
            Self::Io(e) => write!(f, "I/O error: {e}"),
            Self::Storage(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for CreateError {}

impl From<LinkError> for CreateError {
    fn from(e: LinkError) -> Self {
        match e {
            LinkError::Required => Self::RepositoryRequired,
            LinkError::Invalid(status) => Self::Repository(status),
        }
    }
}

impl From<io::Error> for CreateError {
    fn from(e: io::Error) -> Self {
        Self::Io(e)
    }
}

impl From<StorageError> for CreateError {
    fn from(e: StorageError) -> Self {
        Self::Storage(e)
    }
}

pub fn check_directory(path: &Path) -> DirectoryCheck {
    if !path.is_absolute() {
        return DirectoryCheck::NotAbsolute;
    }
    match fs::metadata(path) {
        Err(e) if e.kind() == io::ErrorKind::NotFound => DirectoryCheck::Available,
        Err(_) => DirectoryCheck::Unreadable,
        Ok(meta) if !meta.is_dir() => DirectoryCheck::NotDirectory,
        Ok(_) => match fs::read_dir(path).map(|mut entries| entries.next().is_none()) {
            Ok(true) => DirectoryCheck::Available,
            Ok(false) => DirectoryCheck::NotEmpty,
            Err(_) => DirectoryCheck::Unreadable,
        },
    }
}

pub fn create(
    input: NewProject,
    registry: &ProjectRegistry,
    progress: &mut dyn FnMut(CreateProgress),
) -> Result<ProjectItem, CreateError> {
    let plan = Plan::from_input(input)?;
    let rollback = Rollback::prepare(&plan.root);
    let written = write_project(&plan, progress).and_then(|()| {
        progress(CreateProgress::Registry);
        let entry = RegistryEntry::new(plan.manifest.id.clone(), &plan.root);
        registry.add(entry.clone())?;
        Ok(entry)
    });
    match written {
        Ok(entry) => {
            log::info!("created project {} in {}", entry.id, entry.dir);
            Ok(describe(entry))
        }
        Err(e) => {
            log::warn!("could not create a project in {}: {e}", plan.root.display());
            rollback.undo();
            Err(e)
        }
    }
}

struct Plan {
    root: PathBuf,
    manifest: ProjectManifest,
    settings: ProjectSettings,
    sources: Vec<PathBuf>,
}

impl Plan {
    fn from_input(input: NewProject) -> Result<Self, CreateError> {
        let name = clean(Some(input.name)).ok_or(CreateError::NameRequired)?;
        let root = PathBuf::from(input.dir.trim());
        match check_directory(&root) {
            DirectoryCheck::Available => {}
            other => return Err(CreateError::Directory(other)),
        }
        let repository = repository::link(input.phase, clean(input.repository))?;
        let sources = input
            .sources
            .iter()
            .map(|path| check_source(Path::new(path)))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self {
            root,
            manifest: ProjectManifest {
                schema_version: MANIFEST_VERSION,
                id: uuid::Uuid::new_v4().to_string(),
                name,
                code: clean(input.code),
                client: clean(input.client),
                industry: clean(input.industry),
                description: clean(input.description),
                phase: input.phase,
                methodology: None,
                repository,
                created_at: now(),
            },
            settings: ProjectSettings {
                cli: input.cli,
                model: clean(input.model),
            },
            sources,
        })
    }
}

fn check_source(path: &Path) -> Result<PathBuf, CreateError> {
    let candidate = sources::describe(path);
    match candidate.problem {
        None => Ok(path.to_owned()),
        Some(problem) => Err(CreateError::Source {
            path: candidate.path,
            problem,
        }),
    }
}

fn write_project(plan: &Plan, progress: &mut dyn FnMut(CreateProgress)) -> Result<(), CreateError> {
    let dirs = ProjectDirectories::new(&plan.root);
    progress(CreateProgress::Directories);
    for dir in dirs.scaffold() {
        fs::create_dir_all(dir)?;
    }

    let total = plan.sources.len();
    for (index, source) in plan.sources.iter().enumerate() {
        progress(CreateProgress::Source {
            index,
            total,
            name: source.file_name().unwrap_or_default().to_string_lossy().into_owned(),
        });
        sources::copy_into(&dirs.sources_dir(), source)?;
    }

    progress(CreateProgress::Settings);
    fs::create_dir_all(dirs.cli_profile(plan.settings.cli))?;
    json_file::write(&dirs.settings_file(), &plan.settings)?;

    progress(CreateProgress::Manifest);
    json_file::write(&dirs.manifest_file(), &plan.manifest)?;
    Ok(())
}

/// What to remove when creation fails: the topmost folder Procheck had to create, or, when the
/// project directory already existed (and was empty), everything inside it.
struct Rollback {
    root: PathBuf,
    created_from: Option<PathBuf>,
}

impl Rollback {
    fn prepare(root: &Path) -> Self {
        Self {
            root: root.to_owned(),
            created_from: root.ancestors().take_while(|p| !p.exists()).last().map(Path::to_owned),
        }
    }

    fn undo(&self) {
        let result = match &self.created_from {
            Some(top) => fs::remove_dir_all(top),
            None => clear_dir(&self.root),
        };
        if let Err(e) = result {
            log::warn!("could not clean up {}: {e}", self.root.display());
        }
    }
}

fn clear_dir(dir: &Path) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            fs::remove_dir_all(path)?;
        } else {
            fs::remove_file(path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::projects::{ProjectStatus, read_manifest};

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("procheck-create-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn input(dir: &Path) -> NewProject {
        NewProject {
            name: "  Lotus Pay  ".into(),
            code: Some("LP".into()),
            client: Some(" ".into()),
            industry: Some("fintech".into()),
            description: None,
            dir: dir.display().to_string(),
            phase: ProjectPhase::Initial,
            repository: None,
            sources: vec![],
            cli: AgentId::Claude,
            model: Some("sonnet".into()),
        }
    }

    #[test]
    fn creates_the_project_layout_copies_sources_and_registers_it() {
        let base = temp_dir("ok");
        fs::write(base.join("brief.md"), "# Brief").unwrap();
        let registry = ProjectRegistry::open(base.join("projects.json")).unwrap();
        let root = base.join("nested").join("lotus-pay");
        let mut steps = vec![];

        let item = create(
            NewProject {
                sources: vec![base.join("brief.md").display().to_string()],
                ..input(&root)
            },
            &registry,
            &mut |step| steps.push(step),
        )
        .unwrap();

        assert_eq!(item.status, ProjectStatus::Ready);
        let manifest = read_manifest(&root).unwrap().unwrap();
        assert_eq!((manifest.name.as_str(), manifest.client.as_deref()), ("Lotus Pay", None));
        assert_eq!(uuid::Uuid::parse_str(&manifest.id).unwrap().get_version_num(), 4);
        let dirs = ProjectDirectories::new(&root);
        assert!(dirs.scaffold().iter().all(|d| d.is_dir()));
        assert!(dirs.cli_profile(AgentId::Claude).is_dir());
        assert_eq!(fs::read_to_string(dirs.sources_dir().join("brief.md")).unwrap(), "# Brief");
        let entries = registry.entries();
        assert_eq!((entries[0].id.as_str(), entries[0].dir.clone()), (manifest.id.as_str(), root.display().to_string()));
        assert_eq!(steps.first(), Some(&CreateProgress::Directories));
        assert_eq!(steps.last(), Some(&CreateProgress::Registry));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn rejects_a_folder_that_is_not_empty() {
        let base = temp_dir("not-empty");
        fs::write(base.join("keep.txt"), "mine").unwrap();
        let registry_dir = temp_dir("not-empty-registry");
        let registry = ProjectRegistry::open(registry_dir.join("projects.json")).unwrap();

        let error = create(input(&base), &registry, &mut |_| {}).unwrap_err();

        assert!(matches!(error, CreateError::Directory(DirectoryCheck::NotEmpty)));
        assert_eq!(fs::read_dir(&base).unwrap().count(), 1);
        fs::remove_dir_all(base).unwrap();
        fs::remove_dir_all(registry_dir).unwrap();
    }

    #[test]
    fn sdlc_needs_a_repository_and_nothing_is_written_without_one() {
        let base = temp_dir("sdlc");
        let registry = ProjectRegistry::open(base.join("projects.json")).unwrap();
        let root = base.join("app");

        let error = create(
            NewProject {
                phase: ProjectPhase::Sdlc,
                ..input(&root)
            },
            &registry,
            &mut |_| {},
        )
        .unwrap_err();

        assert!(matches!(error, CreateError::RepositoryRequired));
        assert!(!root.exists());
        assert!(registry.entries().is_empty());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn rollback_removes_created_folders_or_empties_an_existing_one() {
        let base = temp_dir("rollback");
        let created = base.join("a").join("b");
        let rollback = Rollback::prepare(&created);
        fs::create_dir_all(created.join("sources")).unwrap();
        rollback.undo();
        assert!(!base.join("a").exists());

        let existing = base.join("existing");
        fs::create_dir_all(&existing).unwrap();
        let rollback = Rollback::prepare(&existing);
        fs::create_dir_all(existing.join(".procheck").join("cli")).unwrap();
        fs::write(existing.join("procheck.json"), "{}").unwrap();
        rollback.undo();
        assert!(existing.is_dir());
        assert_eq!(fs::read_dir(&existing).unwrap().count(), 0);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn relative_paths_and_files_are_not_project_directories() {
        let base = temp_dir("check");
        fs::write(base.join("file.txt"), "x").unwrap();
        assert_eq!(check_directory(Path::new("projects\\x")), DirectoryCheck::NotAbsolute);
        assert_eq!(check_directory(&base.join("file.txt")), DirectoryCheck::NotDirectory);
        assert_eq!(check_directory(&base.join("new")), DirectoryCheck::Available);
        fs::remove_dir_all(base).unwrap();
    }
}
