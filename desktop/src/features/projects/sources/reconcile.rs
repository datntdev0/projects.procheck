//! Brings the catalog in line with `sources\` after changes made outside Procheck (File Explorer):
//! new files are added, edited files are queued for indexing again, deleted ones are marked missing.
use std::fs;
use std::path::{Path, PathBuf};

use super::catalog::{self, SourceCatalog, SourceIndex, SourceRecord};
use super::kinds::SourceKind;
use super::{hash_file, is_ignored, modified_at, to_relative_string};
use crate::features::chats::now;
use crate::features::projects::layout::ProjectDirectories;
use crate::infra::storage::StorageResult;

/// A file found in `sources\`.
struct DiskFile {
    path: PathBuf,
    relative: String,
    bytes: u64,
    modified_at: String,
}

pub fn reconcile(dirs: &ProjectDirectories) -> StorageResult<SourceCatalog> {
    let sources = dirs.sources_dir();
    let mut files = Vec::new();
    collect(&sources, &sources, &mut files);
    catalog::update(dirs, |catalog| {
        apply(catalog, &files);
        catalog.clone()
    })
}

fn apply(catalog: &mut SourceCatalog, files: &[DiskFile]) {
    for record in &mut catalog.sources {
        record.missing = !files.iter().any(|f| f.relative.eq_ignore_ascii_case(&record.path));
    }
    for file in files {
        match catalog.sources.iter_mut().find(|s| s.path.eq_ignore_ascii_case(&file.relative)) {
            Some(record) => refresh(record, file),
            None => {
                if let Some(record) = discovered(file) {
                    catalog.sources.push(record);
                }
            }
        }
    }
}

/// Size or date changed: hash again, and index again when the content is different.
fn refresh(record: &mut SourceRecord, file: &DiskFile) {
    if record.bytes == file.bytes && record.modified_at == file.modified_at {
        return;
    }
    let Some(sha256) = hash(file) else { return };
    if sha256 != record.sha256 {
        record.sha256 = sha256;
        record.index = SourceIndex::initial(record.kind);
    }
    record.bytes = file.bytes;
    record.modified_at = file.modified_at.clone();
}

fn discovered(file: &DiskFile) -> Option<SourceRecord> {
    let kind = SourceKind::of(&file.path);
    Some(SourceRecord {
        id: uuid::Uuid::new_v4().to_string(),
        path: file.relative.clone(),
        kind,
        category: kind.category(),
        bytes: file.bytes,
        sha256: hash(file)?,
        modified_at: file.modified_at.clone(),
        added_at: now(),
        missing: false,
        index: SourceIndex::initial(kind),
    })
}

fn hash(file: &DiskFile) -> Option<String> {
    hash_file(&file.path)
        .inspect_err(|e| log::warn!("could not read source {}: {e}", file.path.display()))
        .ok()
}

fn collect(root: &Path, dir: &Path, files: &mut Vec<DiskFile>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for path in entries.flatten().map(|e| e.path()) {
        let name = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
        if is_ignored(&name) {
            continue;
        }
        if path.is_dir() {
            collect(root, &path, files);
        } else if let Some(file) = disk_file(root, path) {
            files.push(file);
        }
    }
}

fn disk_file(root: &Path, path: PathBuf) -> Option<DiskFile> {
    let bytes = fs::metadata(&path).ok()?.len();
    Some(DiskFile {
        relative: to_relative_string(path.strip_prefix(root).ok()?),
        bytes,
        modified_at: modified_at(&path).ok()?,
        path,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::features::projects::sources::catalog::IndexState;
    use crate::features::projects::sources::catalog::tests::temp_project;
    use crate::features::projects::sources::import::{ImportItem, import};

    #[test]
    fn files_changed_outside_procheck_are_picked_up() {
        let dirs = temp_project("reconcile");
        let sources = dirs.sources_dir();
        fs::write(dirs.root.join("brief.md"), "v1").unwrap();
        fs::write(dirs.root.join("old.txt"), "old").unwrap();
        let items = ["brief.md", "old.txt"].map(|name| ImportItem {
            path: dirs.root.join(name).display().to_string(),
            relative: name.into(),
            category: None,
        });
        let added = import(&dirs, &items, &mut |_| {}).unwrap();
        catalog::update(&dirs, |c| c.sources[0].index.state = IndexState::Indexed).unwrap();

        fs::write(sources.join("brief.md"), "version two").unwrap();
        fs::remove_file(sources.join("old.txt")).unwrap();
        fs::create_dir_all(sources.join("dropped")).unwrap();
        fs::write(sources.join("dropped").join("photo.png"), "png").unwrap();
        fs::write(sources.join(".photo.png.part"), "partial").unwrap();

        let catalog = reconcile(&dirs).unwrap();

        let brief = catalog.find(&added[0].id).unwrap();
        assert_eq!((brief.bytes, brief.index.state), (11, IndexState::Queued));
        assert_ne!(brief.sha256, added[0].sha256);
        assert!(catalog.find(&added[1].id).unwrap().missing);
        let photo = catalog.find_by_path("dropped/photo.png").unwrap();
        assert_eq!((photo.kind, photo.missing), (SourceKind::Image, false));
        assert_eq!(catalog.sources.len(), 3);
        assert_eq!(catalog::read(&dirs).unwrap(), catalog);
        fs::remove_dir_all(&dirs.root).unwrap();
    }

    #[test]
    fn an_unchanged_folder_leaves_the_catalog_untouched() {
        let dirs = temp_project("reconcile-same");
        fs::write(dirs.sources_dir().join("a.md"), "a").unwrap();
        let first = reconcile(&dirs).unwrap();
        let written = fs::metadata(dirs.sources_catalog()).unwrap().modified().unwrap();

        let second = reconcile(&dirs).unwrap();

        assert_eq!(first, second);
        assert_eq!(fs::metadata(dirs.sources_catalog()).unwrap().modified().unwrap(), written);
        fs::remove_dir_all(&dirs.root).unwrap();
    }
}
