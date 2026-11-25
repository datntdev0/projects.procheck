//! Source files: anything picked on this PC and copied into `<project dir>\sources`, listed in
//! `.procheck\sources.json` with its kind, hash and index state.
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::time::SystemTime;

use serde::Serialize;
use sha2::{Digest, Sha256};

pub mod catalog;
pub mod import;
pub mod kinds;
pub mod reconcile;

use kinds::{ReadMode, SourceCategory, SourceKind};

const PARTIAL_SUFFIX: &str = ".part";
const IGNORED_FILES: [&str; 2] = ["thumbs.db", "desktop.ini"];

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
    /// Where the file will be copied, relative to `sources\` (keeps the folder of a dropped folder).
    pub relative: String,
    pub bytes: u64,
    pub kind: SourceKind,
    pub category: SourceCategory,
    pub mode: ReadMode,
    pub problem: Option<SourceProblem>,
    /// Path of a source in the project with the same content.
    pub duplicate_of: Option<String>,
}

/// Any file can be a source; its kind only sets the size limit and how it will be read.
pub fn describe(path: &Path) -> SourceCandidate {
    let name = path.file_name().unwrap_or_default().to_string_lossy().into_owned();
    describe_as(path, &name)
}

pub fn describe_as(path: &Path, relative: &str) -> SourceCandidate {
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
        relative: relative.to_owned(),
        bytes,
        kind,
        category: kind.category(),
        mode: kind.mode(),
        problem,
        duplicate_of: None,
    }
}

/// System files, Office lock files and hidden files (including our own partial copies).
pub fn is_ignored(name: &str) -> bool {
    name.starts_with('.') || name.starts_with("~$") || IGNORED_FILES.contains(&name.to_lowercase().as_str())
}

/// `a/b/c.pdf` for a relative path; `None` when it is empty or escapes the folder (`..`, `C:\`).
pub fn safe_relative(relative: &str) -> Option<PathBuf> {
    let path = PathBuf::from(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
    let normal = path.components().all(|c| matches!(c, Component::Normal(_)));
    (normal && path.components().next().is_some()).then_some(path)
}

pub fn to_relative_string(path: &Path) -> String {
    path.components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

/// A copied file: where it landed and what it holds.
#[derive(Debug, Clone, PartialEq)]
pub struct CopiedFile {
    pub target: PathBuf,
    pub bytes: u64,
    pub sha256: String,
}

/// Copies `source` to `target`, renamed `name (2).ext`, `name (3).ext`, … when that name is taken.
/// The data goes to a hidden partial file first and is hashed on the way, so the target either
/// holds the whole file or does not exist.
pub fn copy_hashed(source: &Path, target: &Path) -> io::Result<CopiedFile> {
    let parent = target
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "target has no folder"))?;
    fs::create_dir_all(parent)?;
    let target = unique_target(target);
    let partial = partial_path(&target);
    let written = write_hashed(source, &partial).and_then(|copied| {
        fs::rename(&partial, &target)?;
        Ok(copied)
    });
    match written {
        Ok((bytes, sha256)) => Ok(CopiedFile { target, bytes, sha256 }),
        Err(e) => {
            let _ = fs::remove_file(&partial);
            Err(e)
        }
    }
}

pub fn hash_file(path: &Path) -> io::Result<String> {
    let mut hasher = Sha256::new();
    pump(File::open(path)?, &mut |chunk| {
        hasher.update(chunk);
        Ok(())
    })?;
    Ok(hex(&hasher.finalize()))
}

pub fn modified_at(path: &Path) -> io::Result<String> {
    let modified: SystemTime = fs::metadata(path)?.modified()?;
    Ok(chrono::DateTime::<chrono::Local>::from(modified).to_rfc3339_opts(chrono::SecondsFormat::Secs, false))
}

fn write_hashed(source: &Path, partial: &Path) -> io::Result<(u64, String)> {
    let mut output = File::create(partial)?;
    let mut hasher = Sha256::new();
    let bytes = pump(File::open(source)?, &mut |chunk| {
        hasher.update(chunk);
        output.write_all(chunk)
    })?;
    output.sync_all()?;
    Ok((bytes, hex(&hasher.finalize())))
}

fn pump(mut input: File, sink: &mut dyn FnMut(&[u8]) -> io::Result<()>) -> io::Result<u64> {
    let mut buffer = vec![0u8; 256 * 1024];
    let mut total = 0u64;
    loop {
        let read = input.read(&mut buffer)?;
        if read == 0 {
            return Ok(total);
        }
        sink(&buffer[..read])?;
        total += read as u64;
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn partial_path(target: &Path) -> PathBuf {
    let name = target.file_name().unwrap_or_default().to_string_lossy();
    target.with_file_name(format!(".{name}{PARTIAL_SUFFIX}"))
}

fn unique_target(first: &Path) -> PathBuf {
    if !first.exists() {
        return first.to_owned();
    }
    let stem = first.file_stem().unwrap_or_default().to_string_lossy();
    let extension = first.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (2..)
        .map(|n| first.with_file_name(format!("{stem} ({n}){extension}")))
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
        let a = dir.join("a");
        let b = dir.join("b");
        fs::create_dir_all(&a).unwrap();
        fs::create_dir_all(&b).unwrap();
        fs::write(a.join("brief.md"), "one").unwrap();
        fs::write(b.join("brief.md"), "two").unwrap();

        let first = copy_hashed(&a.join("brief.md"), &target.join("brief.md")).unwrap();
        let second = copy_hashed(&b.join("brief.md"), &target.join("brief.md")).unwrap();

        assert_eq!(first.target, target.join("brief.md"));
        assert_eq!(second.target, target.join("brief (2).md"));
        assert_eq!(fs::read_to_string(&second.target).unwrap(), "two");
        assert_eq!(fs::read_dir(&target).unwrap().count(), 2);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn copies_are_hashed_on_the_way() {
        let dir = temp_dir("hash");
        fs::write(dir.join("a.txt"), "abc").unwrap();

        let copied = copy_hashed(&dir.join("a.txt"), &dir.join("out").join("nested").join("a.txt")).unwrap();

        let abc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        assert_eq!((copied.bytes, copied.sha256.as_str()), (3, abc));
        assert_eq!(hash_file(&copied.target).unwrap(), abc);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn describe_reports_size_and_problems() {
        let dir = temp_dir("describe");
        fs::write(dir.join("notes.txt"), "12345").unwrap();

        let ok = describe(&dir.join("notes.txt"));
        assert_eq!((ok.name.as_str(), ok.relative.as_str(), ok.bytes, ok.problem), ("notes.txt", "notes.txt", 5, None));
        assert_eq!((ok.kind, ok.mode), (SourceKind::Text, ReadMode::Text));
        assert_eq!(describe(&dir.join("nope.txt")).problem, Some(SourceProblem::NotFound));
        assert_eq!(describe(&dir).problem, Some(SourceProblem::NotAFile));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn relative_paths_cannot_leave_the_sources_folder() {
        assert_eq!(safe_relative("day 1/notes.md"), Some(PathBuf::from("day 1").join("notes.md")));
        assert_eq!(safe_relative("../secrets.txt"), None);
        assert_eq!(safe_relative("C:\\Windows\\win.ini"), None);
        assert_eq!(safe_relative(""), None);
        assert_eq!(to_relative_string(&PathBuf::from("a").join("b.pdf")), "a/b.pdf");
    }

    #[test]
    fn hidden_system_and_lock_files_are_ignored() {
        assert!(is_ignored(".brief.md.part"));
        assert!(is_ignored("~$Budget.xlsx"));
        assert!(is_ignored("Thumbs.db"));
        assert!(!is_ignored("Budget.xlsx"));
    }
}
