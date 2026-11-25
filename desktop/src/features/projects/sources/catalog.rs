//! `<project dir>\.procheck\sources.json`: one record per file in `sources\`.
use std::sync::{Mutex, PoisonError};

use serde::{Deserialize, Serialize};

use super::kinds::{ReadMode, SourceCategory, SourceKind};
use crate::features::projects::layout::ProjectDirectories;
use crate::infra::storage::{StorageResult, json_file};

pub const CATALOG_VERSION: u32 = 1;

/// Serializes read-modify-write cycles of catalogs, so two imports never overwrite each other.
static CATALOG_LOCK: Mutex<()> = Mutex::new(());

/// Where the file is in the indexing pipeline. Readable files start `Queued`; formats without a
/// reader are `Stored` and never indexed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum IndexState {
    Queued,
    Indexing,
    Indexed,
    Stored,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceIndex {
    pub state: IndexState,
    #[serde(default)]
    pub error: Option<String>,
}

impl SourceIndex {
    pub fn initial(kind: SourceKind) -> Self {
        let state = match kind.mode() {
            ReadMode::Store => IndexState::Stored,
            _ => IndexState::Queued,
        };
        Self { state, error: None }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRecord {
    pub id: String,
    /// Relative to `sources\`, with `/` separators (`workshops/day 1.m4a`).
    pub path: String,
    pub kind: SourceKind,
    pub category: SourceCategory,
    pub bytes: u64,
    pub sha256: String,
    pub modified_at: String,
    pub added_at: String,
    /// The file was deleted or moved outside Procheck; the record is kept until removed.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub missing: bool,
    pub index: SourceIndex,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceCatalog {
    pub schema_version: u32,
    pub sources: Vec<SourceRecord>,
}

impl Default for SourceCatalog {
    fn default() -> Self {
        Self {
            schema_version: CATALOG_VERSION,
            sources: Vec::new(),
        }
    }
}

impl SourceCatalog {
    pub fn find(&self, id: &str) -> Option<&SourceRecord> {
        self.sources.iter().find(|s| s.id == id)
    }

    #[cfg(test)]
    pub fn find_by_path(&self, path: &str) -> Option<&SourceRecord> {
        self.sources.iter().find(|s| s.path.eq_ignore_ascii_case(path))
    }

    pub fn find_by_hash(&self, sha256: &str) -> Option<&SourceRecord> {
        self.sources.iter().find(|s| !s.missing && s.sha256 == sha256)
    }

    /// Takes the records with these ids out of the catalog and returns them.
    pub fn take(&mut self, ids: &[String]) -> Vec<SourceRecord> {
        let (taken, kept) = std::mem::take(&mut self.sources)
            .into_iter()
            .partition(|s| ids.contains(&s.id));
        self.sources = kept;
        taken
    }

    pub fn set_category(&mut self, id: &str, category: SourceCategory) -> Option<SourceRecord> {
        let record = self.sources.iter_mut().find(|s| s.id == id)?;
        record.category = category;
        Some(record.clone())
    }
}

/// The catalog of a project; empty when it does not exist yet or cannot be parsed.
pub fn read(dirs: &ProjectDirectories) -> StorageResult<SourceCatalog> {
    json_file::read_or_reset(&dirs.sources_catalog())
}

/// Reads the catalog, applies `change` and writes it back, holding the catalog lock throughout.
pub fn update<T>(dirs: &ProjectDirectories, change: impl FnOnce(&mut SourceCatalog) -> T) -> StorageResult<T> {
    let _guard = CATALOG_LOCK.lock().unwrap_or_else(PoisonError::into_inner);
    let mut catalog = read(dirs)?;
    let result = change(&mut catalog);
    json_file::write(&dirs.sources_catalog(), &catalog)?;
    Ok(result)
}

#[cfg(test)]
pub(crate) mod tests {
    use std::fs;
    use std::path::PathBuf;

    use super::*;

    pub(crate) fn temp_project(name: &str) -> ProjectDirectories {
        let dir = std::env::temp_dir().join(format!("procheck-sources-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("sources")).unwrap();
        ProjectDirectories::new(dir)
    }

    pub(crate) fn record(id: &str, path: &str) -> SourceRecord {
        let kind = SourceKind::of(&PathBuf::from(path));
        SourceRecord {
            id: id.into(),
            path: path.into(),
            kind,
            category: kind.category(),
            bytes: 1,
            sha256: format!("hash-{id}"),
            modified_at: "2026-11-25T09:00:00+07:00".into(),
            added_at: "2026-11-25T09:00:00+07:00".into(),
            missing: false,
            index: SourceIndex::initial(kind),
        }
    }

    #[test]
    fn a_missing_catalog_reads_as_empty() {
        let dirs = temp_project("catalog-empty");
        assert_eq!(read(&dirs).unwrap(), SourceCatalog::default());
        fs::remove_dir_all(&dirs.root).unwrap();
    }

    #[test]
    fn updates_are_written_and_read_back() {
        let dirs = temp_project("catalog-update");
        update(&dirs, |c| c.sources.extend([record("a", "RFP.pdf"), record("b", "design.fig")])).unwrap();
        let moved = update(&dirs, |c| c.set_category("a", SourceCategory::Other)).unwrap();
        let taken = update(&dirs, |c| c.take(&["b".to_owned()])).unwrap();

        let catalog = read(&dirs).unwrap();
        assert_eq!(moved.map(|r| r.category), Some(SourceCategory::Other));
        assert_eq!(taken.len(), 1);
        assert_eq!(catalog.sources.len(), 1);
        assert_eq!(catalog.find_by_path("rfp.PDF").map(|r| r.id.as_str()), Some("a"));
        assert_eq!(catalog.find_by_hash("hash-a").map(|r| r.id.as_str()), Some("a"));
        fs::remove_dir_all(&dirs.root).unwrap();
    }

    #[test]
    fn unreadable_formats_start_stored_and_the_rest_queued() {
        assert_eq!(record("a", "RFP.pdf").index.state, IndexState::Queued);
        assert_eq!(record("b", "design.fig").index.state, IndexState::Stored);
    }

    #[test]
    fn the_missing_flag_is_only_written_when_set() {
        let mut r = record("a", "RFP.pdf");
        assert!(!serde_json::to_string(&r).unwrap().contains("missing"));
        r.missing = true;
        assert!(serde_json::to_string(&r).unwrap().contains("\"missing\":true"));
    }
}
