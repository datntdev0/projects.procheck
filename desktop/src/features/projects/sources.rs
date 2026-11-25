//! Raw source documents: files picked on this PC and copied into `<project dir>\sources`.
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::Serialize;

pub mod catalog;
pub mod kinds;

use kinds::{ReadMode, SourceCategory, SourceKind};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SourceProblem {
    NotFound,
    NotAFile,
    TooLarge,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceCandidate {
    pub path: String,
    pub name: String,
    pub bytes: u64,
    pub kind: SourceKind,
    pub category: SourceCategory,
    pub mode: ReadMode,
    pub problem: Option<SourceProblem>,
}

/// Any file can be a source; its kind only sets the size limit and how it will be read.
pub fn describe(path: &Path) -> SourceCandidate {
    let kind = SourceKind::of(path);
    let (bytes, problem) = match fs::metadata(path) {
        Err(_) => (0, Some(SourceProblem::NotFound)),
        Ok(meta) if !meta.is_file() => (0, Some(SourceProblem::NotAFile)),
        Ok(meta) if meta.len() > kind.max_bytes() => (meta.len(), Some(SourceProblem::TooLarge)),
        Ok(meta) => (meta.len(), None),
    };
    SourceCandidate {
        path: path.display().to_string(),
        name: path.file_name().unwrap_or_default().to_string_lossy().into_owned(),
        bytes,
        kind,
        category: kind.category(),
        mode: kind.mode(),
        problem,
    }
}

/// Copies `source` into `dir`, renaming it `name (2).ext`, `name (3).ext`, … when the name is taken.
pub fn copy_into(dir: &Path, source: &Path) -> io::Result<PathBuf> {
    let file_name = source
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "source has no file name"))?;
    let target = unique_target(dir, Path::new(file_name));
    fs::copy(source, &target)?;
    Ok(target)
}

fn unique_target(dir: &Path, file_name: &Path) -> PathBuf {
    let first = dir.join(file_name);
    if !first.exists() {
        return first;
    }
    let stem = file_name.file_stem().unwrap_or_default().to_string_lossy();
    let extension = file_name.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (2..)
        .map(|n| dir.join(format!("{stem} ({n}){extension}")))
        .find(|candidate| !candidate.exists())
        .expect("an unused file name always exists")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("procheck-sources-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn copies_keep_both_files_when_names_collide() {
        let dir = temp_dir("collide");
        let target = dir.join("sources");
        fs::create_dir_all(&target).unwrap();
        let a = dir.join("a");
        let b = dir.join("b");
        fs::create_dir_all(&a).unwrap();
        fs::create_dir_all(&b).unwrap();
        fs::write(a.join("brief.md"), "one").unwrap();
        fs::write(b.join("brief.md"), "two").unwrap();

        assert_eq!(copy_into(&target, &a.join("brief.md")).unwrap(), target.join("brief.md"));
        assert_eq!(copy_into(&target, &b.join("brief.md")).unwrap(), target.join("brief (2).md"));
        assert_eq!(fs::read_to_string(target.join("brief (2).md")).unwrap(), "two");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn describe_reports_size_and_problems() {
        let dir = temp_dir("describe");
        fs::write(dir.join("notes.txt"), "12345").unwrap();

        let ok = describe(&dir.join("notes.txt"));
        assert_eq!((ok.name.as_str(), ok.bytes, ok.problem), ("notes.txt", 5, None));
        assert_eq!((ok.kind, ok.mode), (SourceKind::Text, ReadMode::Text));
        assert_eq!(describe(&dir.join("nope.txt")).problem, Some(SourceProblem::NotFound));
        assert_eq!(describe(&dir).problem, Some(SourceProblem::NotAFile));
        fs::remove_dir_all(dir).unwrap();
    }
}
