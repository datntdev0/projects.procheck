//! Adding and removing sources: files are copied into `sources\` and recorded in the catalog.
//! An import is all or nothing: when one file fails, the files already copied are removed again.
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::catalog::{self, SourceCatalog, SourceIndex, SourceRecord};
use super::kinds::{SourceCategory, SourceKind};
use super::{CopiedFile, SourceCandidate, SourceProblem, copy_hashed, describe_as, hash_file, is_ignored, modified_at, safe_relative};
use crate::features::chats::now;
use crate::features::projects::artifacts::history;
use crate::features::projects::layout::ProjectDirectories;
use crate::infra::storage::StorageError;

/// A file to add: where it is now, where it goes under `sources\` and, optionally, its category.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportItem {
    pub path: String,
    pub relative: String,
    #[serde(default)]
    pub category: Option<SourceCategory>,
}

impl From<&SourceCandidate> for ImportItem {
    fn from(candidate: &SourceCandidate) -> Self {
        Self {
            path: candidate.path.clone(),
            relative: candidate.relative.clone(),
            category: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub index: usize,
    pub total: usize,
    pub name: String,
}

#[derive(Debug)]
pub enum ImportError {
    Source { path: String, problem: SourceProblem },
    InvalidPath(String),
    Io(io::Error),
    Storage(StorageError),
}

impl ImportError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Source { .. } => "invalidSource",
            Self::InvalidPath(_) => "invalidPath",
            Self::Io(_) => "io",
            Self::Storage(_) => "storage",
        }
    }
}

impl std::fmt::Display for ImportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Source { path, problem } => write!(f, "source {path} cannot be added: {problem:?}"),
            Self::InvalidPath(path) => write!(f, "{path} is not a path inside the sources folder"),
            Self::Io(e) => write!(f, "I/O error: {e}"),
            Self::Storage(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for ImportError {}

impl From<io::Error> for ImportError {
    fn from(e: io::Error) -> Self {
        Self::Io(e)
    }
}

impl From<StorageError> for ImportError {
    fn from(e: StorageError) -> Self {
        Self::Storage(e)
    }
}

/// Files and folders picked or dropped, as candidates: folders are expanded (keeping the folder
/// name in `relative`) and each file is checked against the project for identical content.
pub fn inspect(dirs: &ProjectDirectories, paths: &[PathBuf]) -> Vec<SourceCandidate> {
    let catalog = catalog::read(dirs).unwrap_or_else(|e| {
        log::warn!("could not read the source catalog: {e}");
        SourceCatalog::default()
    });
    expand(paths)
        .into_iter()
        .map(|(path, relative)| with_duplicate(describe_as(&path, &relative), &catalog))
        .collect()
}

/// Copies the files into `sources\` and adds them to the catalog, reporting each file.
pub fn import(
    dirs: &ProjectDirectories,
    items: &[ImportItem],
    progress: &mut dyn FnMut(ImportProgress),
) -> Result<Vec<SourceRecord>, ImportError> {
    let planned = items.iter().map(plan).collect::<Result<Vec<_>, _>>()?;
    let mut records = Vec::with_capacity(planned.len());
    for (index, (item, relative)) in planned.iter().enumerate() {
        progress(ImportProgress {
            index,
            total: planned.len(),
            name: file_name(relative),
        });
        match copy_one(dirs, item, relative) {
            Ok(record) => records.push(record),
            Err(e) => {
                discard(dirs, &records);
                return Err(e);
            }
        }
    }
    let added = records.clone();
    catalog::update(dirs, |catalog| add(catalog, records)).inspect_err(|_| discard(dirs, &added))?;
    log::info!("added {} source(s) to {}", added.len(), dirs.root.display());
    history::record_sources(dirs, &format!("sources: add {}", describe_records(&added)));
    Ok(added)
}

/// Deletes the files and their index folders and drops them from the catalog. Files that cannot
/// be deleted (open in another app) stay listed and the first error is returned.
pub fn remove(dirs: &ProjectDirectories, ids: &[String]) -> Result<Vec<SourceRecord>, ImportError> {
    let catalog = catalog::read(dirs)?;
    let mut deleted = Vec::new();
    let mut failure = None;
    for record in catalog.sources.iter().filter(|s| ids.contains(&s.id)) {
        match delete_files(dirs, record) {
            Ok(()) => deleted.push(record.id.clone()),
            Err(e) => {
                log::warn!("could not delete source {}: {e}", record.path);
                failure.get_or_insert(e);
            }
        }
    }
    let removed = catalog::update(dirs, |catalog| catalog.take(&deleted))?;
    if !removed.is_empty() {
        history::record_sources(dirs, &format!("sources: remove {}", describe_records(&removed)));
    }
    match failure {
        Some(e) => Err(e.into()),
        None => Ok(removed),
    }
}

/// The file name of a single record, or the count (`3 files`), for a commit message.
fn describe_records(records: &[SourceRecord]) -> String {
    match records {
        [only] => file_name(Path::new(&only.path)),
        many => format!("{} files", many.len()),
    }
}

/// `(file, path relative to sources\)` for each file, walking into folders.
fn expand(paths: &[PathBuf]) -> Vec<(PathBuf, String)> {
    let mut files = Vec::new();
    for path in paths {
        let name = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
        if path.is_dir() {
            collect_folder(path, &name, &mut files);
        } else {
            files.push((path.clone(), name));
        }
    }
    files
}

fn collect_folder(dir: &Path, prefix: &str, files: &mut Vec<(PathBuf, String)>) {
    let Ok(entries) = fs::read_dir(dir) else {
        log::warn!("could not read the folder {}", dir.display());
        return;
    };
    let mut entries: Vec<_> = entries.flatten().map(|e| e.path()).collect();
    entries.sort();
    for path in entries {
        let name = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
        if is_ignored(&name) {
            continue;
        }
        let relative = format!("{prefix}/{name}");
        if path.is_dir() {
            collect_folder(&path, &relative, files);
        } else {
            files.push((path, relative));
        }
    }
}

fn with_duplicate(mut candidate: SourceCandidate, catalog: &SourceCatalog) -> SourceCandidate {
    if candidate.problem.is_none() {
        candidate.duplicate_of = hash_file(Path::new(&candidate.path))
            .ok()
            .and_then(|sha| catalog.find_by_hash(&sha).map(|s| s.path.clone()));
    }
    candidate
}

fn plan(item: &ImportItem) -> Result<(&ImportItem, PathBuf), ImportError> {
    let relative = safe_relative(&item.relative).ok_or_else(|| ImportError::InvalidPath(item.relative.clone()))?;
    let candidate = describe_as(Path::new(&item.path), &item.relative);
    match candidate.problem {
        None => Ok((item, relative)),
        Some(problem) => Err(ImportError::Source {
            path: candidate.path,
            problem,
        }),
    }
}

fn copy_one(dirs: &ProjectDirectories, item: &ImportItem, relative: &Path) -> Result<SourceRecord, ImportError> {
    let sources = dirs.sources_dir();
    let CopiedFile { target, bytes, sha256 } = copy_hashed(Path::new(&item.path), &sources.join(relative))?;
    let stored = target.strip_prefix(&sources).unwrap_or(&target);
    let kind = SourceKind::of(&target);
    Ok(SourceRecord {
        id: uuid::Uuid::new_v4().to_string(),
        path: super::to_relative_string(stored),
        kind,
        category: item.category.unwrap_or(kind.category()),
        bytes,
        sha256,
        modified_at: modified_at(&target)?,
        added_at: now(),
        missing: false,
        index: SourceIndex::initial(kind),
    })
}

/// A record whose file went missing is replaced by a new file copied to the same path.
fn add(catalog: &mut SourceCatalog, records: Vec<SourceRecord>) {
    catalog
        .sources
        .retain(|s| !(s.missing && records.iter().any(|r| r.path.eq_ignore_ascii_case(&s.path))));
    catalog.sources.extend(records);
}

fn discard(dirs: &ProjectDirectories, records: &[SourceRecord]) {
    for record in records {
        if let Err(e) = delete_files(dirs, record) {
            log::warn!("could not roll back the copy of {}: {e}", record.path);
        }
    }
}

fn delete_files(dirs: &ProjectDirectories, record: &SourceRecord) -> io::Result<()> {
    let file = safe_relative(&record.path).map(|relative| dirs.sources_dir().join(relative));
    if let Some(file) = file {
        remove_if_exists(fs::remove_file(file))?;
    }
    remove_if_exists(fs::remove_dir_all(dirs.index_dir().join(&record.id)))
}

fn remove_if_exists(result: io::Result<()>) -> io::Result<()> {
    match result {
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        other => other,
    }
}

fn file_name(relative: &Path) -> String {
    relative.file_name().unwrap_or_default().to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::projects::sources::catalog::IndexState;
    use crate::features::projects::sources::catalog::tests::temp_project;

    fn item(path: &Path, relative: &str) -> ImportItem {
        ImportItem {
            path: path.display().to_string(),
            relative: relative.into(),
            category: None,
        }
    }

    fn outside(dirs: &ProjectDirectories) -> PathBuf {
        let dir = dirs.root.join("outside");
        fs::create_dir_all(dir.join("Workshop").join("day 1")).unwrap();
        fs::write(dir.join("RFP.pdf"), "rfp").unwrap();
        fs::write(dir.join("wireframes.fig"), "fig").unwrap();
        fs::write(dir.join("Workshop").join("agenda.md"), "# Agenda").unwrap();
        fs::write(dir.join("Workshop").join("day 1").join("kickoff.m4a"), "audio").unwrap();
        fs::write(dir.join("Workshop").join("~$agenda.md"), "lock").unwrap();
        dir
    }

    #[test]
    fn folders_expand_into_their_files_keeping_the_folder_name() {
        let dirs = temp_project("inspect");
        let from = outside(&dirs);

        let candidates = inspect(&dirs, &[from.join("RFP.pdf"), from.join("Workshop")]);

        let relative: Vec<&str> = candidates.iter().map(|c| c.relative.as_str()).collect();
        assert_eq!(relative, ["RFP.pdf", "Workshop/agenda.md", "Workshop/day 1/kickoff.m4a"]);
        assert_eq!(candidates[2].kind, SourceKind::Audio);
        fs::remove_dir_all(&dirs.root).unwrap();
    }

    #[test]
    fn imports_copy_record_and_report_each_file() {
        let dirs = temp_project("import");
        let from = outside(&dirs);
        let mut steps = vec![];

        let records = import(
            &dirs,
            &[
                item(&from.join("RFP.pdf"), "RFP.pdf"),
                ImportItem {
                    category: Some(SourceCategory::Other),
                    ..item(&from.join("wireframes.fig"), "design/wireframes.fig")
                },
            ],
            &mut |step| steps.push(step.name),
        )
        .unwrap();

        assert_eq!(steps, ["RFP.pdf", "wireframes.fig"]);
        assert!(dirs.sources_dir().join("design").join("wireframes.fig").is_file());
        let catalog = catalog::read(&dirs).unwrap();
        assert_eq!(catalog.sources, records);
        assert_eq!((records[0].index.state, records[0].bytes), (IndexState::Queued, 3));
        assert_eq!((records[1].path.as_str(), records[1].category), ("design/wireframes.fig", SourceCategory::Other));
        assert_eq!(records[1].index.state, IndexState::Stored);
        fs::remove_dir_all(&dirs.root).unwrap();
    }

    #[test]
    fn same_content_is_reported_as_a_duplicate() {
        let dirs = temp_project("duplicate");
        let from = outside(&dirs);
        import(&dirs, &[item(&from.join("RFP.pdf"), "RFP.pdf")], &mut |_| {}).unwrap();
        fs::write(from.join("RFP copy.pdf"), "rfp").unwrap();

        let candidates = inspect(&dirs, &[from.join("RFP copy.pdf"), from.join("wireframes.fig")]);

        assert_eq!(candidates[0].duplicate_of.as_deref(), Some("RFP.pdf"));
        assert_eq!(candidates[1].duplicate_of, None);
        fs::remove_dir_all(&dirs.root).unwrap();
    }

    #[test]
    fn a_failed_import_leaves_nothing_behind() {
        let dirs = temp_project("rollback");
        let from = outside(&dirs);

        let error = import(
            &dirs,
            &[item(&from.join("RFP.pdf"), "RFP.pdf"), item(&from.join("gone.pdf"), "gone.pdf")],
            &mut |_| {},
        )
        .unwrap_err();
        let escape = import(&dirs, &[item(&from.join("RFP.pdf"), "../RFP.pdf")], &mut |_| {}).unwrap_err();

        assert!(matches!(error, ImportError::Source { problem: SourceProblem::NotFound, .. }));
        assert!(matches!(escape, ImportError::InvalidPath(_)));
        assert_eq!(fs::read_dir(dirs.sources_dir()).unwrap().count(), 0);
        assert!(catalog::read(&dirs).unwrap().sources.is_empty());
        fs::remove_dir_all(&dirs.root).unwrap();
    }

    #[test]
    fn removing_deletes_the_file_its_index_and_the_record() {
        let dirs = temp_project("remove");
        let from = outside(&dirs);
        let records = import(&dirs, &[item(&from.join("RFP.pdf"), "RFP.pdf")], &mut |_| {}).unwrap();
        let index = dirs.index_dir().join(&records[0].id);
        fs::create_dir_all(&index).unwrap();

        let removed = remove(&dirs, &[records[0].id.clone()]).unwrap();

        assert_eq!(removed, records);
        assert!(!dirs.sources_dir().join("RFP.pdf").exists());
        assert!(!index.exists());
        assert!(catalog::read(&dirs).unwrap().sources.is_empty());
        fs::remove_dir_all(&dirs.root).unwrap();
    }
}
