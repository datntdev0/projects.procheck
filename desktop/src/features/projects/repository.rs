//! Linked repository: a local git work tree, anywhere on this PC.
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;

use super::ProjectPhase;
use crate::infra::process::{self, Launch, Output, RunError};

const GIT_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RepositoryStatus {
    Ready,
    NotFound,
    NotRepository,
    GitMissing,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryInfo {
    pub path: String,
    pub status: RepositoryStatus,
    /// Top-level folder of the work tree; what gets linked when `path` is a subfolder.
    pub root: Option<String>,
    /// `None` on a detached HEAD.
    pub branch: Option<String>,
    pub clean: Option<bool>,
}

impl RepositoryInfo {
    fn failed(path: &Path, status: RepositoryStatus) -> Self {
        Self {
            path: path.display().to_string(),
            status,
            root: None,
            branch: None,
            clean: None,
        }
    }
}

/// Why a folder cannot be linked to a project.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinkError {
    /// SDLC works in git worktrees, so it cannot run without a repository.
    Required,
    Invalid(RepositoryStatus),
}

/// Validates the repository to link for a project in `phase`; links the work tree root.
pub fn link(phase: ProjectPhase, path: Option<String>) -> Result<Option<String>, LinkError> {
    let Some(path) = path else {
        return match phase {
            ProjectPhase::Sdlc => Err(LinkError::Required),
            _ => Ok(None),
        };
    };
    let info = inspect(Path::new(&path));
    match info.status {
        RepositoryStatus::Ready => Ok(info.root.or(Some(path))),
        status => Err(LinkError::Invalid(status)),
    }
}

pub fn inspect(path: &Path) -> RepositoryInfo {
    if !path.is_dir() {
        return RepositoryInfo::failed(path, RepositoryStatus::NotFound);
    }
    let root = match git(path, &["rev-parse", "--show-toplevel"]) {
        Err(RunError::Spawn(_)) => return RepositoryInfo::failed(path, RepositoryStatus::GitMissing),
        Ok(output) if output.success() => normalize(output.stdout.trim()),
        _ => return RepositoryInfo::failed(path, RepositoryStatus::NotRepository),
    };
    let branch = git_line(path, &["branch", "--show-current"]).filter(|b| !b.is_empty());
    let clean = git(path, &["status", "--porcelain"])
        .ok()
        .filter(Output::success)
        .map(|output| output.stdout.trim().is_empty());
    RepositoryInfo {
        path: path.display().to_string(),
        status: RepositoryStatus::Ready,
        root: Some(root),
        branch,
        clean,
    }
}

fn git(dir: &Path, args: &[&str]) -> Result<Output, RunError> {
    let mut full: Vec<&OsStr> = vec![OsStr::new("-C"), dir.as_os_str()];
    full.extend(args.iter().map(OsStr::new));
    process::run(Path::new("git"), full, &Launch::default(), GIT_TIMEOUT)
}

fn git_line(dir: &Path, args: &[&str]) -> Option<String> {
    git(dir, args)
        .ok()
        .filter(Output::success)
        .map(|output| output.stdout.trim().to_owned())
}

/// git prints `D:/src/app`; rebuild it with the platform separator.
fn normalize(path: &str) -> String {
    Path::new(path).components().collect::<PathBuf>().display().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_folder_is_not_found() {
        let info = inspect(Path::new("Z:\\procheck\\does-not-exist"));
        assert_eq!(info.status, RepositoryStatus::NotFound);
    }

    #[test]
    fn a_plain_folder_is_not_a_repository() {
        let dir = std::env::temp_dir().join(format!("procheck-repo-plain-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let status = inspect(&dir).status;
        assert!(matches!(status, RepositoryStatus::NotRepository | RepositoryStatus::GitMissing));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
