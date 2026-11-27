//! The artifact files of a project: scans `artifacts/initial/<artifact id>/**/*.md`, ties each folder
//! to its customization step and artifact, and works out the status of every file and step.
//! Versions come from git (`history`); the review status a person sets is kept in
//! `.procheck\artifacts.json` next to the commit it was set on, so a file that changes afterwards
//! goes back to Draft by itself.
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, PoisonError};

use serde::{Deserialize, Serialize};

use super::history::{self, ArtifactLog};
use super::prompt::is_unreadable;
use super::{ArtifactsError, INITIAL_DIR};
use crate::features::agents::AgentId;
use crate::features::projects::DocumentLanguage;
use crate::features::projects::customization::PhaseCustomization;
use crate::features::projects::layout::ProjectDirectories;
use crate::features::projects::sources::{self, catalog as source_catalog, modified_at, safe_relative, to_relative_string};
use crate::infra::storage::{StorageResult, json_file};

pub const RECORDS_VERSION: u32 = 1;

/// Serializes read-modify-write cycles of `artifacts.json`.
static RECORDS_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReviewStatus {
    Draft,
    Review,
    Approved,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum StepStatus {
    Done,
    Review,
    Current,
    Todo,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Author {
    Agent,
    User,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactFile {
    /// Relative to the project directory, with forward slashes.
    pub path: String,
    /// Folder name.
    pub artifact_id: String,
    /// `None` when the folder is no longer in the customization.
    pub step_id: Option<String>,
    pub status: ReviewStatus,
    /// Commits that touched the file; 0 = never committed.
    pub version: u32,
    /// Last commit date, or the modification time while the file has uncommitted changes.
    pub updated_at: String,
    pub by: Option<Author>,
    pub cli: Option<String>,
    pub model: Option<String>,
    pub run_id: Option<String>,
    /// A change in the work tree that is not in git yet.
    pub uncommitted: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepArtifact {
    pub artifact_id: String,
    pub name: String,
    pub files: Vec<ArtifactFile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepState {
    pub step_id: String,
    pub status: StepStatus,
    /// A successful agent run exists.
    pub generated: bool,
    /// Some earlier step is not generated.
    pub locked: bool,
    pub artifacts: Vec<StepArtifact>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningStep {
    pub run_id: String,
    pub step_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactsOverview {
    /// The project's CLI (`settings.json`); `None` when the project has no settings.
    pub cli: Option<AgentId>,
    pub git_available: bool,
    pub document_language: Option<DocumentLanguage>,
    /// The five Initial steps in order; empty when the project has no customization.
    pub steps: Vec<StepState>,
    /// Files in folders that are not in the customization (any more).
    pub orphans: Vec<ArtifactFile>,
    pub running: Option<RunningStep>,
    /// Sources the agent cannot read (audio, video, office files, archives, stored-only formats).
    pub unreadable_sources: usize,
}

/// `.procheck\artifacts.json`.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Records {
    schema_version: u32,
    files: BTreeMap<String, Record>,
}

impl Default for Records {
    fn default() -> Self {
        Self {
            schema_version: RECORDS_VERSION,
            files: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct Record {
    status: ReviewStatus,
    /// Full hash of the last commit of the file when the status was set.
    commit: String,
}

/// A file with what is needed to explain its status.
struct Entry {
    file: ArtifactFile,
    last_commit: Option<String>,
}

struct Snapshot {
    git_available: bool,
    entries: Vec<Entry>,
    generated: HashSet<String>,
}

pub fn overview(
    dirs: &ProjectDirectories,
    cli: Option<AgentId>,
    language: Option<DocumentLanguage>,
    phase: Option<&PhaseCustomization>,
    running: Option<RunningStep>,
) -> Result<ArtifactsOverview, ArtifactsError> {
    let snapshot = snapshot(dirs, phase)?;
    let mut files: Vec<ArtifactFile> = snapshot.entries.into_iter().map(|e| e.file).collect();
    let mut steps = Vec::new();
    let mut earlier_generated = true;
    for step in phase.map(|p| p.steps.as_slice()).unwrap_or_default() {
        let artifacts: Vec<StepArtifact> = step
            .artifacts
            .iter()
            .map(|artifact| StepArtifact {
                artifact_id: artifact.id.clone(),
                name: artifact.name.clone(),
                files: files.iter().filter(|f| f.artifact_id == artifact.id).cloned().collect(),
            })
            .collect();
        let generated = snapshot.generated.contains(&step.id);
        steps.push(StepState {
            step_id: step.id.clone(),
            status: step_status(generated, !earlier_generated, &artifacts),
            generated,
            locked: !earlier_generated,
            artifacts,
        });
        earlier_generated &= generated;
    }
    files.retain(|f| f.step_id.is_none());
    Ok(ArtifactsOverview {
        cli,
        git_available: snapshot.git_available,
        document_language: language,
        steps,
        orphans: files,
        running,
        unreadable_sources: unreadable_sources(dirs),
    })
}

fn step_status(generated: bool, locked: bool, artifacts: &[StepArtifact]) -> StepStatus {
    if generated {
        let mut files = artifacts.iter().flat_map(|a| &a.files).peekable();
        let all_approved = files.peek().is_some() && files.all(|f| f.status == ReviewStatus::Approved);
        return if all_approved { StepStatus::Done } else { StepStatus::Review };
    }
    if locked { StepStatus::Todo } else { StepStatus::Current }
}

fn unreadable_sources(dirs: &ProjectDirectories) -> usize {
    match source_catalog::read(dirs) {
        Ok(catalog) => catalog.sources.iter().filter(|s| !s.missing && is_unreadable(s.kind)).count(),
        Err(e) => {
            log::warn!("could not read the source catalog: {e}");
            0
        }
    }
}

/// Steps with at least one successful agent run.
pub fn generated_steps(dirs: &ProjectDirectories) -> Result<HashSet<String>, ArtifactsError> {
    Ok(history::artifact_log(dirs)?.generated_steps)
}

/// The files and their statuses as they are now.
pub fn files(dirs: &ProjectDirectories, phase: Option<&PhaseCustomization>) -> Result<Vec<ArtifactFile>, ArtifactsError> {
    Ok(snapshot(dirs, phase)?.entries.into_iter().map(|e| e.file).collect())
}

/// One file by its project-relative path.
pub fn describe(dirs: &ProjectDirectories, phase: Option<&PhaseCustomization>, path: &str) -> Result<ArtifactFile, ArtifactsError> {
    find(snapshot(dirs, phase)?, path).map(|e| e.file)
}

/// Sets the review status of a file. A file with uncommitted changes is committed first (as the
/// user's), because the status is tied to a commit.
pub fn set_status(dirs: &ProjectDirectories, phase: Option<&PhaseCustomization>, path: &str, status: ReviewStatus) -> Result<ArtifactFile, ArtifactsError> {
    resolve(dirs, path)?;
    let path = to_relative_string(&safe_relative(path).ok_or(ArtifactsError::InvalidPath)?);
    if status != ReviewStatus::Draft {
        history::ensure(dirs)?;
        if find(snapshot(dirs, phase)?, &path)?.file.uncommitted {
            history::commit_user_changes(dirs, "initial: changes before status change", None)?;
        }
    }
    let entry = find(snapshot(dirs, phase)?, &path)?;
    {
        let _guard = RECORDS_LOCK.lock().unwrap_or_else(PoisonError::into_inner);
        let mut records = read_records(dirs)?;
        match (status, &entry.last_commit) {
            (ReviewStatus::Draft, _) => records.files.remove(&path),
            (status, Some(commit)) => records.files.insert(path.clone(), Record { status, commit: commit.clone() }),
            (_, None) => return Err(ArtifactsError::Git("the file has no commit to attach the status to".into())),
        };
        json_file::write(&dirs.artifacts_file(), &records)?;
    }
    describe(dirs, phase, &path)
}

/// The file for a project-relative path below `artifacts/`; no `..`, no other folder.
pub fn resolve(dirs: &ProjectDirectories, path: &str) -> Result<PathBuf, ArtifactsError> {
    let relative = safe_relative(path).ok_or(ArtifactsError::InvalidPath)?;
    let mut parts = relative.components();
    if parts.next() != Some(Component::Normal("artifacts".as_ref())) || parts.next().is_none() {
        return Err(ArtifactsError::InvalidPath);
    }
    let file = dirs.root.join(relative);
    if file.is_file() { Ok(file) } else { Err(ArtifactsError::NotFound) }
}

fn find(snapshot: Snapshot, path: &str) -> Result<Entry, ArtifactsError> {
    snapshot
        .entries
        .into_iter()
        .find(|e| e.file.path == path)
        .ok_or(ArtifactsError::NotFound)
}

fn read_records(dirs: &ProjectDirectories) -> StorageResult<Records> {
    json_file::read_or_reset(&dirs.artifacts_file())
}

fn snapshot(dirs: &ProjectDirectories, phase: Option<&PhaseCustomization>) -> Result<Snapshot, ArtifactsError> {
    let git_available = history::available();
    let tracked = git_available && history::is_repo(dirs);
    let log = if tracked { degrade("history", history::artifact_log(dirs)) } else { ArtifactLog::default() };
    let pending: HashSet<String> = if tracked {
        degrade("status", history::pending_artifacts(dirs).map(|entries| entries.into_iter().map(|e| e.path).collect()))
    } else {
        HashSet::new()
    };
    let records = read_records(dirs)?;
    let owners: HashMap<&str, (&str, &str)> = phase
        .into_iter()
        .flat_map(|p| &p.steps)
        .flat_map(|step| step.artifacts.iter().map(move |a| (a.id.as_str(), (step.id.as_str(), a.name.as_str()))))
        .collect();

    let mut disk = Vec::new();
    collect(&dirs.initial_artifacts_dir(), &dirs.root, &mut disk);
    disk.sort();
    let entries = disk
        .into_iter()
        .filter_map(|path| {
            let artifact_id = path.strip_prefix(&format!("{INITIAL_DIR}/"))?.split('/').next()?.to_owned();
            let history = log.files.get(&path);
            let uncommitted = pending.contains(&path);
            let record = records.files.get(&path);
            let status = match (record, history) {
                (Some(r), Some(h)) if !uncommitted && r.commit == h.last.hash => r.status,
                _ => ReviewStatus::Draft,
            };
            let updated_at = match history {
                Some(h) if !uncommitted => h.last.date.clone(),
                _ => modified_at(&dirs.root.join(safe_relative(&path)?)).unwrap_or_default(),
            };
            let trailers = history.map(|h| &h.last.trailers);
            Some(Entry {
                last_commit: history.map(|h| h.last.hash.clone()),
                file: ArtifactFile {
                    step_id: owners.get(artifact_id.as_str()).map(|(step, _)| (*step).to_owned()),
                    artifact_id,
                    path,
                    status,
                    version: history.map_or(0, |h| h.version),
                    updated_at,
                    by: trailers.and_then(|t| match t.by.as_deref() {
                        Some("agent") => Some(Author::Agent),
                        Some("user") => Some(Author::User),
                        _ => None,
                    }),
                    cli: trailers.and_then(|t| t.cli.clone()),
                    model: trailers.and_then(|t| t.model.clone()),
                    run_id: trailers.and_then(|t| t.run.clone()),
                    uncommitted,
                },
            })
        })
        .collect();
    Ok(Snapshot {
        git_available,
        entries,
        generated: log.generated_steps,
    })
}

/// A failed read-only git query leaves the listing without that information instead of failing it.
fn degrade<T: Default>(what: &str, result: Result<T, history::HistoryError>) -> T {
    result.unwrap_or_else(|e| {
        log::warn!("could not read the git {what} of the artifacts: {e}");
        T::default()
    })
}

/// Project-relative paths of the `.md` files in `artifacts/initial/<folder>/`, at any depth.
fn collect(dir: &Path, root: &Path, out: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for path in entries.flatten().map(|e| e.path()) {
        if path.is_dir() {
            collect(&path, root, out);
        } else if is_markdown(&path)
            && !sources::is_ignored(&path.file_name().unwrap_or_default().to_string_lossy())
            && let Ok(relative) = path.strip_prefix(root)
        {
            out.push(to_relative_string(relative));
        }
    }
}

fn is_markdown(path: &Path) -> bool {
    path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
}
