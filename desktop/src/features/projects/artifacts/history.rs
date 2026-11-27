//! The project's git repository. `git init` runs in the project directory, so versions, history and
//! outside changes are plain git: the version of a file is the number of commits that touched it.
//! Procheck commits as `Procheck <procheck@local>` through `-c` options and never touches the
//! user's git configuration. Commits carry `Procheck-*` trailers that are read back here.
//! Without `git` on PATH everything degrades quietly: callers get `HistoryError::GitMissing`.
use std::collections::{HashMap, HashSet};
use std::ffi::OsStr;
use std::fs;
use std::io;
use std::path::Path;
use std::time::Duration;

use crate::features::projects::layout::ProjectDirectories;
use crate::features::projects::sources::catalog;
use crate::features::projects::sources::{hash_file, modified_at, safe_relative};
use crate::infra::process::{self, Launch, Output, RunError};
use crate::infra::storage::StorageError;

const READ_TIMEOUT: Duration = Duration::from_secs(20);
const WRITE_TIMEOUT: Duration = Duration::from_secs(300);

const ARTIFACTS_DIR: &str = "artifacts";
const INITIAL_PREFIX: &str = "artifacts/initial/";
const GITIGNORE: &str = ".gitignore";
const SOURCES_CATALOG: &str = ".procheck/sources.json";

/// Sources larger than this are kept out of git (listed in `.gitignore`) and verified by hash.
pub const LARGE_SOURCE_BYTES: u64 = 50 * 1024 * 1024;
const BLOCK_START: &str = "# >>> procheck: large sources";
const BLOCK_END: &str = "# <<< procheck";

const DEFAULT_IGNORE: &str = "\
# Procheck: data that is not versioned
.procheck/chats/
.procheck/runs/
.procheck/cli/
.procheck/worktrees/
.procheck/index/
.procheck/artifacts.json
.procheck/*.tmp
sources/**/.*.part

# The linked code repository (a separate repo) and the board
repository/
board/

";

const COMMIT_MARK: char = '\u{1}';
const FIELD_MARK: char = '\u{1f}';
const HEADER_END: char = '\u{2}';
const LOG_FORMAT: &str = "--format=%x01%H%x1f%cI%x1f%(trailers:only,unfold)%x02";

#[derive(Debug)]
pub enum HistoryError {
    GitMissing,
    Failed(String),
    Io(io::Error),
    Storage(StorageError),
}

impl std::fmt::Display for HistoryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::GitMissing => write!(f, "git is not installed"),
            Self::Failed(why) => write!(f, "git failed: {why}"),
            Self::Io(e) => write!(f, "I/O error: {e}"),
            Self::Storage(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for HistoryError {}

impl From<io::Error> for HistoryError {
    fn from(e: io::Error) -> Self {
        Self::Io(e)
    }
}

impl From<StorageError> for HistoryError {
    fn from(e: StorageError) -> Self {
        Self::Storage(e)
    }
}

fn git(dirs: &ProjectDirectories, args: &[&str], timeout: Duration) -> Result<Output, HistoryError> {
    let mut full: Vec<&OsStr> = vec![OsStr::new("-C"), dirs.root.as_os_str()];
    full.extend(
        [
            "-c",
            "user.name=Procheck",
            "-c",
            "user.email=procheck@local",
            "-c",
            "core.quotepath=false",
            "-c",
            "commit.gpgsign=false",
        ]
        .map(OsStr::new),
    );
    full.extend(args.iter().map(OsStr::new));
    process::run(Path::new("git"), full, &Launch::default(), timeout).map_err(|e| match e {
        RunError::Spawn(_) => HistoryError::GitMissing,
        other => HistoryError::Failed(other.to_string()),
    })
}

/// Runs git and fails when it exits with an error.
fn git_ok(dirs: &ProjectDirectories, args: &[&str], timeout: Duration) -> Result<Output, HistoryError> {
    let output = git(dirs, args, timeout)?;
    if output.success() {
        Ok(output)
    } else {
        Err(HistoryError::Failed(failure_reason(&output)))
    }
}

fn failure_reason(output: &Output) -> String {
    let line = |text: &str| text.lines().rev().map(str::trim).find(|l| !l.is_empty()).map(str::to_owned);
    line(&output.stderr)
        .or_else(|| line(&output.stdout))
        .unwrap_or_else(|| format!("exited with {}", output.status))
}

pub fn available() -> bool {
    process::run(Path::new("git"), ["--version"], &Launch::default(), READ_TIMEOUT).is_ok_and(|o| o.success())
}

/// The project directory has its own `.git` (a parent folder's repository does not count).
pub fn is_repo(dirs: &ProjectDirectories) -> bool {
    dirs.root.join(".git").exists()
}

/// Seven characters of a commit hash.
pub fn short(hash: &str) -> &str {
    hash.get(..7).unwrap_or(hash)
}

/// Makes the project a repository when it is not one yet: `git init`, `.gitignore` and a first
/// commit of what is there. `Ok(false)` when git is not installed.
pub fn init(dirs: &ProjectDirectories) -> Result<bool, HistoryError> {
    if !available() {
        log::info!("git is not installed; {} stays without a repository", dirs.root.display());
        return Ok(false);
    }
    if !is_repo(dirs) {
        git_ok(dirs, &["init", "--quiet"], WRITE_TIMEOUT)?;
        log::info!("initialized a git repository in {}", dirs.root.display());
    }
    if !dirs.root.join(GITIGNORE).exists() {
        fs::write(dirs.root.join(GITIGNORE), DEFAULT_IGNORE)?;
    }
    sync_large_sources(dirs)?;
    commit(dirs, &["."], "Procheck: initial commit", &[])?;
    Ok(true)
}

/// A repository must exist before an agent run; creates it for projects made before artifacts.
pub fn ensure(dirs: &ProjectDirectories) -> Result<(), HistoryError> {
    if is_repo(dirs) {
        return if available() { Ok(()) } else { Err(HistoryError::GitMissing) };
    }
    match init(dirs)? {
        true => Ok(()),
        false => Err(HistoryError::GitMissing),
    }
}

/// Stages `pathspecs` and commits them with `subject` and `trailers`. Returns the full hash of the
/// new commit, or `None` when nothing changed there.
pub fn commit(dirs: &ProjectDirectories, pathspecs: &[&str], subject: &str, trailers: &[(&str, &str)]) -> Result<Option<String>, HistoryError> {
    stage(dirs, pathspecs)?;
    let staged = git_ok(dirs, &["diff", "--cached", "--name-only"], READ_TIMEOUT)?;
    if staged.stdout.trim().is_empty() {
        return Ok(None);
    }
    let body: String = trailers.iter().map(|(key, value)| format!("{key}: {value}\n")).collect();
    let mut args = vec!["commit", "--quiet", "--no-verify", "-m", subject];
    if !body.is_empty() {
        args.extend(["-m", body.trim_end()]);
    }
    git_ok(dirs, &args, WRITE_TIMEOUT)?;
    Ok(head(dirs))
}

/// `git add -A`; a path that matches nothing (a folder that was never created) is skipped.
fn stage(dirs: &ProjectDirectories, pathspecs: &[&str]) -> Result<(), HistoryError> {
    let add = |specs: &[&str]| {
        let mut args = vec!["add", "-A", "--"];
        args.extend(specs);
        git(dirs, &args, WRITE_TIMEOUT)
    };
    let all = add(pathspecs)?;
    if all.success() {
        return Ok(());
    }
    if !all.stderr.contains("did not match") {
        return Err(HistoryError::Failed(failure_reason(&all)));
    }
    for spec in pathspecs.iter().filter(|s| !s.starts_with(':')) {
        let one = add(&[spec])?;
        if !one.success() && !one.stderr.contains("did not match") {
            return Err(HistoryError::Failed(failure_reason(&one)));
        }
    }
    Ok(())
}

pub fn head(dirs: &ProjectDirectories) -> Option<String> {
    git(dirs, &["rev-parse", "HEAD"], READ_TIMEOUT)
        .ok()
        .filter(Output::success)
        .map(|o| o.stdout.trim().to_owned())
}

/// A changed path in the work tree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusEntry {
    pub x: char,
    pub y: char,
    /// Relative to the project directory, with forward slashes.
    pub path: String,
}

/// Changed and new files below `pathspecs` (the whole project when empty).
pub fn status(dirs: &ProjectDirectories, pathspecs: &[&str]) -> Result<Vec<StatusEntry>, HistoryError> {
    let mut args = vec!["status", "--porcelain=v1", "-z", "--untracked-files=all"];
    if !pathspecs.is_empty() {
        args.push("--");
        args.extend(pathspecs);
    }
    Ok(parse_status(&git_ok(dirs, &args, READ_TIMEOUT)?.stdout))
}

fn parse_status(output: &str) -> Vec<StatusEntry> {
    let mut entries = Vec::new();
    let mut parts = output.split('\0');
    while let Some(part) = parts.next() {
        let mut chars = part.chars();
        let (Some(x), Some(y), Some(' ')) = (chars.next(), chars.next(), chars.next()) else {
            continue;
        };
        if matches!(x, 'R' | 'C') {
            parts.next();
        }
        entries.push(StatusEntry {
            x,
            y,
            path: chars.as_str().to_owned(),
        });
    }
    entries
}

/// Files with uncommitted changes below `artifacts/`.
pub fn pending_artifacts(dirs: &ProjectDirectories) -> Result<Vec<StatusEntry>, HistoryError> {
    status(dirs, &[ARTIFACTS_DIR])
}

/// Changes anywhere except `artifacts/initial/`.
pub fn changes_outside_initial(dirs: &ProjectDirectories) -> Result<Vec<StatusEntry>, HistoryError> {
    let mut entries = status(dirs, &["."])?;
    entries.retain(|e| !e.path.starts_with(INITIAL_PREFIX));
    Ok(entries)
}

/// Commits what changed outside `artifacts/` (files added to `sources\`, settings edited by hand, …).
pub fn commit_outside_artifacts(dirs: &ProjectDirectories, subject: &str) -> Result<Option<String>, HistoryError> {
    commit(dirs, &[".", ":(exclude)artifacts"], subject, &[])
}

/// Commits the pending changes below `artifacts/` as the user's (hand edits, or what a stopped or
/// failed run left behind: `partial_run`).
pub fn commit_user_changes(dirs: &ProjectDirectories, subject: &str, partial_run: Option<&str>) -> Result<Option<String>, HistoryError> {
    let mut trailers = vec![("Procheck-By", "user")];
    if let Some(run) = partial_run {
        trailers.push(("Procheck-Partial-Run", run));
    }
    commit(dirs, &[ARTIFACTS_DIR], subject, &trailers)
}

/// The `Procheck-*` trailers of a commit.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Trailers {
    pub by: Option<String>,
    pub step: Option<String>,
    pub run: Option<String>,
    pub cli: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitInfo {
    pub hash: String,
    /// ISO 8601 commit date.
    pub date: String,
    pub trailers: Trailers,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileHistory {
    /// Commits that touched the file.
    pub version: u32,
    pub last: CommitInfo,
}

#[derive(Debug, Default)]
pub struct ArtifactLog {
    /// By project-relative path.
    pub files: HashMap<String, FileHistory>,
    /// Steps with a commit made by an agent run (`Procheck-Step` + `Procheck-By: agent`).
    pub generated_steps: HashSet<String>,
}

/// History of everything below `artifacts/`, newest commit first.
pub fn artifact_log(dirs: &ProjectDirectories) -> Result<ArtifactLog, HistoryError> {
    let output = git(dirs, &["log", "--no-renames", "--name-only", LOG_FORMAT, "--", ARTIFACTS_DIR], READ_TIMEOUT)?;
    if !output.success() {
        // A repository without commits has no history yet.
        return if output.stderr.contains("does not have any commits") {
            Ok(ArtifactLog::default())
        } else {
            Err(HistoryError::Failed(failure_reason(&output)))
        };
    }
    Ok(parse_log(&output.stdout))
}

fn parse_log(output: &str) -> ArtifactLog {
    let mut log = ArtifactLog::default();
    for chunk in output.split(COMMIT_MARK).filter(|c| !c.trim().is_empty()) {
        let Some((header, names)) = chunk.split_once(HEADER_END) else { continue };
        let mut fields = header.splitn(3, FIELD_MARK);
        let (Some(hash), Some(date), Some(trailers)) = (fields.next(), fields.next(), fields.next()) else {
            continue;
        };
        let commit = CommitInfo {
            hash: hash.to_owned(),
            date: date.to_owned(),
            trailers: parse_trailers(trailers),
        };
        if commit.trailers.by.as_deref() == Some("agent")
            && let Some(step) = &commit.trailers.step
        {
            log.generated_steps.insert(step.clone());
        }
        for name in names.lines().map(str::trim).filter(|n| !n.is_empty()) {
            log.files
                .entry(name.to_owned())
                .and_modify(|history| history.version += 1)
                .or_insert_with(|| FileHistory {
                    version: 1,
                    last: commit.clone(),
                });
        }
    }
    log
}

fn parse_trailers(text: &str) -> Trailers {
    let mut trailers = Trailers::default();
    for line in text.lines() {
        let Some((key, value)) = line.split_once(':') else { continue };
        let value = Some(value.trim().to_owned()).filter(|v| !v.is_empty());
        match key.trim() {
            "Procheck-By" => trailers.by = value,
            "Procheck-Step" => trailers.step = value,
            "Procheck-Run" => trailers.run = value,
            "Procheck-Cli" => trailers.cli = value,
            "Procheck-Model" => trailers.model = value,
            _ => {}
        }
    }
    trailers
}

// ---------- Large sources ----------

/// Rewrites the Procheck block of `.gitignore` to list the sources above `LARGE_SOURCE_BYTES`.
/// Returns whether the file changed.
pub fn sync_large_sources(dirs: &ProjectDirectories) -> Result<bool, HistoryError> {
    let file = dirs.root.join(GITIGNORE);
    let existing = match fs::read_to_string(&file) {
        Ok(text) => text,
        Err(e) if e.kind() == io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(e.into()),
    };
    let mut paths: Vec<String> = catalog::read(dirs)?
        .sources
        .into_iter()
        .filter(|s| !s.missing && s.bytes > LARGE_SOURCE_BYTES)
        .map(|s| format!("/sources/{}", escape_pattern(&s.path)))
        .collect();
    paths.sort();
    let next = with_block(&existing, &paths);
    if next == existing {
        return Ok(false);
    }
    fs::write(&file, next)?;
    Ok(true)
}

/// `text` with the Procheck block replaced by `patterns` (added at the end when it is missing).
fn with_block(text: &str, patterns: &[String]) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.iter().position(|l| l.trim() == BLOCK_START);
    let end = start.and_then(|s| lines[s..].iter().position(|l| l.trim() == BLOCK_END).map(|e| s + e));
    let block = std::iter::once(BLOCK_START).chain(patterns.iter().map(String::as_str)).chain([BLOCK_END]);
    let out: Vec<&str> = match (start, end) {
        (Some(start), Some(end)) => lines[..start].iter().copied().chain(block).chain(lines[end + 1..].iter().copied()).collect(),
        _ => {
            let mut out = lines;
            if out.last().is_some_and(|l| !l.trim().is_empty()) {
                out.push("");
            }
            out.extend(block);
            out
        }
    };
    let mut joined = out.join("\n");
    joined.push('\n');
    joined
}

/// A file name as a literal `.gitignore` pattern.
fn escape_pattern(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    for (i, c) in path.chars().enumerate() {
        if matches!(c, '\\' | '*' | '?' | '[' | ']') || (i == 0 && matches!(c, '#' | '!')) {
            out.push('\\');
        }
        out.push(c);
    }
    if out.ends_with(' ') {
        out.insert(out.len() - 1, '\\');
    }
    out
}

/// Large sources are not in git, so compare them with the hash recorded when they were added.
/// Returns the project-relative paths of those that changed or are gone.
pub fn changed_large_sources(dirs: &ProjectDirectories) -> Vec<String> {
    let records = match catalog::read(dirs) {
        Ok(catalog) => catalog.sources,
        Err(e) => {
            log::warn!("could not read the source catalog: {e}");
            return Vec::new();
        }
    };
    let mut changed = Vec::new();
    for record in records.iter().filter(|s| !s.missing && s.bytes > LARGE_SOURCE_BYTES) {
        let Some(relative) = safe_relative(&record.path) else { continue };
        let file = dirs.sources_dir().join(relative);
        let differs = match fs::metadata(&file) {
            Err(_) => {
                log::warn!("the large source {} is gone from the project", record.path);
                true
            }
            Ok(meta) if meta.len() == record.bytes && modified_at(&file).is_ok_and(|m| m == record.modified_at) => false,
            Ok(_) => match hash_file(&file) {
                Ok(sha) if sha == record.sha256 => false,
                Ok(_) => {
                    log::warn!("the large source {} changed (its hash differs)", record.path);
                    true
                }
                Err(e) => {
                    log::warn!("could not hash {}: {e}", file.display());
                    false
                }
            },
        };
        if differs {
            changed.push(format!("sources/{}", record.path));
        }
    }
    changed
}

// ---------- Commits Procheck makes on its own ----------

/// Commits a change to `sources\` (`sources: add 3 files`). Logged, never fatal; skipped when the
/// project is not a repository.
pub fn record_sources(dirs: &ProjectDirectories, subject: &str) {
    if !is_repo(dirs) {
        return;
    }
    let result = sync_large_sources(dirs).and_then(|_| commit(dirs, &[GITIGNORE, "sources", SOURCES_CATALOG], subject, &[]));
    if let Err(e) = result {
        log::warn!("could not commit '{subject}': {e}");
    }
}

/// Commits the customization (`settings: customization`). Logged, never fatal.
pub fn record_settings(dirs: &ProjectDirectories) {
    if !is_repo(dirs) {
        return;
    }
    if let Err(e) = commit(dirs, &[".procheck/settings.json", ".procheck/templates"], "settings: customization", &[]) {
        log::warn!("could not commit the customization: {e}");
    }
}
