//! Phase customization (Initial phase): the prompt, step instructions, artifacts and document
//! templates of a project. It lives in `.procheck\settings.json` (`customization`) and in
//! `.procheck\templates\initial\<artifact id>.md`, seeded from the bundled defaults when the
//! project is created.
pub mod defaults;

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::edit::{self, EditError};
use super::layout::ProjectDirectories;
use super::registry::ProjectRegistry;
use super::{DocumentLanguage, ProjectSettings};
use crate::infra::storage::{StorageError, json_file};

pub const SCHEMA_VERSION: u32 = 1;

/// Largest template accepted, in bytes of content.
pub const MAX_TEMPLATE_SIZE: usize = 1_048_576;

/// The steps of the Initial phase, in their fixed order.
const STEP_IDS: [&str; 5] = ["discovery", "requirements", "scope", "estimation", "signoff"];

const MAX_ARTIFACT_ID_LEN: usize = 40;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TemplateOrigin {
    Default,
    Custom,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateRef {
    /// Relative to `.procheck\templates\`, with forward slashes: `initial/meeting.md`.
    pub file: String,
    /// Display name: the original file name.
    pub name: String,
    pub size: u64,
    pub origin: TemplateOrigin,
    /// ISO 8601 UTC; empty for bundled defaults that are not in a project yet.
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactCustomization {
    pub id: String,
    pub name: String,
    /// Ignored when saving: the backend decides it from the template changes.
    #[serde(default)]
    pub template: Option<TemplateRef>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepCustomization {
    pub id: String,
    pub instructions: String,
    pub artifacts: Vec<ArtifactCustomization>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhaseCustomization {
    pub prompt: String,
    pub steps: Vec<StepCustomization>,
}

/// Phases are a map-like struct so Scaffolding and SDLC can be added without a schema change.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Phases {
    pub initial: PhaseCustomization,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Customization {
    pub schema_version: u32,
    pub phases: Phases,
}

/// What the Customization section loads.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomizationView {
    /// `None` for projects created before customization existed.
    pub customization: Option<Customization>,
    /// Bundled defaults in the project's document language, for comparing and restoring.
    pub defaults: Option<PhaseCustomization>,
    pub language: Option<DocumentLanguage>,
}

/// A change to the template of one artifact, applied when the customization is saved.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum TemplateChange {
    /// `content` is the UTF-8 text of a markdown file.
    Upload { artifact_id: String, name: String, content: String },
    Remove { artifact_id: String },
    RestoreDefault { artifact_id: String },
}

impl TemplateChange {
    fn artifact_id(&self) -> &str {
        match self {
            Self::Upload { artifact_id, .. } | Self::Remove { artifact_id } | Self::RestoreDefault { artifact_id } => artifact_id,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateContent {
    pub name: String,
    pub content: String,
}

#[derive(Debug)]
pub enum CustomizationError {
    NotFound,
    NotReady,
    /// The project has no customization or no document language (created before the feature).
    NotSupported,
    TemplateType,
    TemplateTooLarge,
    Invalid(&'static str),
    Io(io::Error),
    Storage(StorageError),
}

impl CustomizationError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::NotFound => "notFound",
            Self::NotReady => "notReady",
            Self::NotSupported => "notSupported",
            Self::TemplateType => "templateType",
            Self::TemplateTooLarge => "templateTooLarge",
            Self::Invalid(_) => "invalidCustomization",
            Self::Io(_) => "io",
            Self::Storage(_) => "storage",
        }
    }
}

impl std::fmt::Display for CustomizationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound => write!(f, "the project or the template was not found"),
            Self::NotReady => write!(f, "the project directory or its settings cannot be read"),
            Self::NotSupported => write!(f, "the project has no customization"),
            Self::TemplateType => write!(f, "a template must be a markdown (.md) file"),
            Self::TemplateTooLarge => write!(f, "a template must not be larger than {MAX_TEMPLATE_SIZE} bytes"),
            Self::Invalid(reason) => write!(f, "invalid customization: {reason}"),
            Self::Io(e) => write!(f, "I/O error: {e}"),
            Self::Storage(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for CustomizationError {}

impl From<io::Error> for CustomizationError {
    fn from(e: io::Error) -> Self {
        Self::Io(e)
    }
}

impl From<StorageError> for CustomizationError {
    fn from(e: StorageError) -> Self {
        Self::Storage(e)
    }
}

impl From<EditError> for CustomizationError {
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

/// Template path as stored in a `TemplateRef`: relative to `.procheck\templates\`.
fn template_file_ref(artifact_id: &str) -> String {
    format!("initial/{artifact_id}.md")
}

/// UTC, so the stored timestamps do not depend on the machine's time zone.
fn timestamp() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

/// Writes the bundled templates of `language` into a new project and returns the customization
/// to store in its `settings.json`.
pub fn seed(dirs: &ProjectDirectories, language: DocumentLanguage) -> Result<Customization, CustomizationError> {
    let mut initial = defaults::initial(language);
    let now = timestamp();
    fs::create_dir_all(dirs.initial_templates_dir())?;
    for artifact in initial.steps.iter_mut().flat_map(|step| &mut step.artifacts) {
        let Some(template) = artifact.template.as_mut() else { continue };
        if let Some((_, content)) = defaults::bundled_template(language, &artifact.id) {
            fs::write(dirs.template_file(&artifact.id), content)?;
            template.updated_at = now.clone();
        }
    }
    Ok(Customization {
        schema_version: SCHEMA_VERSION,
        phases: Phases { initial },
    })
}

pub fn get(registry: &ProjectRegistry, id: &str) -> Result<CustomizationView, CustomizationError> {
    let project = edit::ready(registry, id)?;
    let dirs = ProjectDirectories::new(&project.entry.dir);
    let settings: Option<ProjectSettings> = json_file::read(&dirs.settings_file())?;
    let language = project.manifest.document_language;
    Ok(CustomizationView {
        customization: settings.and_then(|s| s.customization),
        defaults: language.map(defaults::initial),
        language,
    })
}

pub fn read_template(registry: &ProjectRegistry, id: &str, artifact_id: &str) -> Result<TemplateContent, CustomizationError> {
    let project = edit::ready(registry, id)?;
    let dirs = ProjectDirectories::new(&project.entry.dir);
    let settings: ProjectSettings = json_file::read(&dirs.settings_file())?.ok_or(CustomizationError::NotReady)?;
    let customization = settings.customization.ok_or(CustomizationError::NotSupported)?;
    // Looked up by id, so `artifact_id` never reaches the file system unless it is a known artifact.
    let template = customization
        .phases
        .initial
        .steps
        .into_iter()
        .flat_map(|step| step.artifacts)
        .find(|artifact| artifact.id == artifact_id)
        .and_then(|artifact| artifact.template)
        .ok_or(CustomizationError::NotFound)?;
    match fs::read_to_string(dirs.template_file(artifact_id)) {
        Ok(content) => Ok(TemplateContent {
            name: template.name,
            content,
        }),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Err(CustomizationError::NotFound),
        Err(e) => Err(e.into()),
    }
}

/// Saves the Initial phase customization. Template files are written first, then `settings.json`
/// (the commit point), and last the template files nothing refers to any more are deleted.
pub fn save(
    registry: &ProjectRegistry,
    id: &str,
    customization: Customization,
    changes: Vec<TemplateChange>,
) -> Result<Customization, CustomizationError> {
    let project = edit::ready(registry, id)?;
    let language = project.manifest.document_language.ok_or(CustomizationError::NotSupported)?;
    let dirs = ProjectDirectories::new(&project.entry.dir);
    let mut settings: ProjectSettings = json_file::read(&dirs.settings_file())?.ok_or(CustomizationError::NotReady)?;
    let current = settings.customization.take().ok_or(CustomizationError::NotSupported)?;

    let mut initial = customization.phases.initial;
    validate(&initial, &changes, language)?;

    // The last change of an artifact wins.
    let changes: HashMap<&str, &TemplateChange> = changes.iter().map(|change| (change.artifact_id(), change)).collect();
    let kept: HashMap<&str, &TemplateRef> = current
        .phases
        .initial
        .steps
        .iter()
        .flat_map(|step| &step.artifacts)
        .filter_map(|artifact| artifact.template.as_ref().map(|template| (artifact.id.as_str(), template)))
        .collect();

    fs::create_dir_all(dirs.initial_templates_dir())?;
    let now = timestamp();
    for artifact in initial.steps.iter_mut().flat_map(|step| &mut step.artifacts) {
        artifact.name = artifact.name.trim().to_owned();
        artifact.template = match changes.get(artifact.id.as_str()) {
            Some(TemplateChange::Upload { name, content, .. }) => {
                Some(write_template(&dirs, &artifact.id, name, content, TemplateOrigin::Custom, &now)?)
            }
            Some(TemplateChange::Remove { .. }) => None,
            Some(TemplateChange::RestoreDefault { .. }) => {
                let (name, content) = defaults::bundled_template(language, &artifact.id)
                    .ok_or(CustomizationError::Invalid("the artifact has no default template"))?;
                Some(write_template(&dirs, &artifact.id, name, content, TemplateOrigin::Default, &now)?)
            }
            None => kept.get(artifact.id.as_str()).map(|template| (*template).clone()),
        };
    }

    let saved = Customization {
        schema_version: SCHEMA_VERSION,
        phases: Phases { initial },
    };
    settings.customization = Some(saved.clone());
    json_file::write(&dirs.settings_file(), &settings)?;
    log::info!("saved the customization of project {id}");

    remove_unreferenced(&dirs, &saved);
    Ok(saved)
}

fn validate(initial: &PhaseCustomization, changes: &[TemplateChange], language: DocumentLanguage) -> Result<(), CustomizationError> {
    if !initial.steps.iter().map(|step| step.id.as_str()).eq(STEP_IDS) {
        return Err(CustomizationError::Invalid("the steps must be the five steps of the Initial phase, in order"));
    }
    let mut ids = HashSet::new();
    for artifact in initial.steps.iter().flat_map(|step| &step.artifacts) {
        if !valid_artifact_id(&artifact.id) {
            return Err(CustomizationError::Invalid("an artifact id is not valid"));
        }
        if !ids.insert(artifact.id.as_str()) {
            return Err(CustomizationError::Invalid("an artifact id is used twice"));
        }
        if artifact.name.trim().is_empty() {
            return Err(CustomizationError::Invalid("an artifact name is blank"));
        }
    }
    for change in changes {
        if !ids.contains(change.artifact_id()) {
            return Err(CustomizationError::Invalid("a template change refers to an unknown artifact"));
        }
        match change {
            TemplateChange::Upload { name, content, .. } => {
                if !name.to_lowercase().ends_with(".md") {
                    return Err(CustomizationError::TemplateType);
                }
                if content.len() > MAX_TEMPLATE_SIZE {
                    return Err(CustomizationError::TemplateTooLarge);
                }
            }
            TemplateChange::Remove { .. } => {}
            TemplateChange::RestoreDefault { artifact_id } => {
                if defaults::bundled_template(language, artifact_id).is_none() {
                    return Err(CustomizationError::Invalid("the artifact has no default template"));
                }
            }
        }
    }
    Ok(())
}

/// Lowercase letters, digits and dashes, 1 to 40 characters: safe to use as a file name.
fn valid_artifact_id(id: &str) -> bool {
    (1..=MAX_ARTIFACT_ID_LEN).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

fn write_template(
    dirs: &ProjectDirectories,
    artifact_id: &str,
    name: &str,
    content: &str,
    origin: TemplateOrigin,
    now: &str,
) -> Result<TemplateRef, CustomizationError> {
    fs::write(dirs.template_file(artifact_id), content)?;
    Ok(TemplateRef {
        file: template_file_ref(artifact_id),
        name: name.to_owned(),
        size: content.len() as u64,
        origin,
        updated_at: now.to_owned(),
    })
}

/// Deletes the `.md` files in `templates\initial\` that no artifact refers to. Failing to delete
/// one is only logged: the saved settings are already correct.
fn remove_unreferenced(dirs: &ProjectDirectories, saved: &Customization) {
    let referenced: HashSet<&str> = saved
        .phases
        .initial
        .steps
        .iter()
        .flat_map(|step| &step.artifacts)
        .filter_map(|artifact| artifact.template.as_ref())
        .filter_map(|template| template.file.strip_prefix("initial/"))
        .collect();
    let Ok(entries) = fs::read_dir(dirs.initial_templates_dir()) else { return };
    for path in entries.filter_map(Result::ok).map(|entry| entry.path()) {
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or_default();
        if is_markdown(&path)
            && !referenced.contains(name)
            && let Err(e) = fs::remove_file(&path)
        {
            log::warn!("could not delete the unused template {}: {e}", path.display());
        }
    }
}

fn is_markdown(path: &Path) -> bool {
    path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
}
