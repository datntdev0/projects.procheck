//! Every git call of Procheck goes through here: the git Procheck downloaded, with Procheck's own
//! configuration (`<data dir>\git\config`) instead of the user's. `GIT_CONFIG_NOSYSTEM` keeps the
//! system config out too, and `GIT_TERMINAL_PROMPT=0` makes git fail instead of waiting for input.
//! `HOME` / `USERPROFILE` are left alone so ssh keys and the credential manager keep working.
use std::ffi::OsStr;
use std::fs;
use std::io;
use std::time::Duration;

use crate::infra::process::{self, Launch, Output, RunError};
use crate::infra::tools::{self, Layout, manifest::ToolId};

/// Written once git is installed. Commits are authored as Procheck; LF line endings are kept so
/// the hash of a file the agent wrote is stable; paths are not quoted (Vietnamese names); any
/// folder may hold a project (another drive, a network drive).
const CONFIG: &str = "\
[user]
\tname = Procheck
\temail = procheck@local
[init]
\tdefaultBranch = main
[core]
\tautocrlf = false
\tquotepath = false
\tlongpaths = true
\tfsmonitor = false
[safe]
\tdirectory = *
[commit]
\tgpgsign = false
[advice]
\tdetachedHead = false
";

/// Inherited variables that would point git at another repository.
const UNSET: &[&str] = &["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"];

/// Writes Procheck's git configuration.
pub fn write_config(layout: &Layout) -> io::Result<()> {
    fs::create_dir_all(layout.git_dir())?;
    fs::write(layout.git_config(), CONFIG)
}

/// Runs the downloaded git. When it is not installed this fails like a missing program
/// (`RunError::Spawn`), which callers already treat as "git is not available".
pub fn run<I, S>(args: I, timeout: Duration) -> Result<Output, RunError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let (Some(layout), Some(exe)) = (tools::layout(), tools::installed_executable(ToolId::Git)) else {
        return Err(RunError::Spawn(io::Error::new(io::ErrorKind::NotFound, "git has not been downloaded")));
    };
    let launch = Launch {
        cwd: None,
        env: vec![
            ("GIT_CONFIG_GLOBAL", layout.git_config().into_os_string()),
            ("GIT_CONFIG_NOSYSTEM", "1".into()),
            ("GIT_TERMINAL_PROMPT", "0".into()),
        ],
        unset: UNSET,
    };
    process::run(&exe, args, &launch, timeout)
}
