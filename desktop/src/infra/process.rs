//! Running external programs (the agent CLIs) with a timeout and without a console window.
use std::ffi::{OsStr, OsString};
use std::io::{self, BufRead, BufReader, Lines, Read, Write};
use std::path::Path;
use std::process::{Child, ChildStdout, Command, ExitStatus, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

/// Environment variables that make a CLI believe it runs inside another agent session
/// (set when Procheck itself is started from Claude Code). They are never passed on.
const BLOCKED_ENV: &[&str] = &["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_SSE_PORT"];

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
#[cfg(windows)]
const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

/// Captured result of a finished program.
#[derive(Debug)]
pub struct Output {
    pub status: ExitStatus,
    pub stdout: String,
    pub stderr: String,
    pub elapsed: Duration,
}

impl Output {
    pub fn success(&self) -> bool {
        self.status.success()
    }
}

#[derive(Debug)]
pub enum RunError {
    /// The program could not be started (missing file, not executable, …).
    Spawn(io::Error),
    /// The program did not finish in time and was killed.
    Timeout(Duration),
    Io(io::Error),
}

impl std::fmt::Display for RunError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Spawn(e) => write!(f, "could not start the program: {e}"),
            Self::Timeout(t) => write!(f, "no answer within {} s", t.as_secs()),
            Self::Io(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for RunError {}

/// Where and how to run a program: working directory and extra environment variables
/// (set on top of the inherited environment, overriding inherited values).
#[derive(Debug, Default, Clone)]
pub struct Launch<'a> {
    pub cwd: Option<&'a Path>,
    pub env: Vec<(&'static str, OsString)>,
    /// Inherited variables the program must not see.
    pub unset: &'static [&'static str],
}

fn base_command<I, S>(program: &Path, args: I, launch: &Launch<'_>) -> Command
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = Command::new(program);
    command.args(args);
    if let Some(cwd) = launch.cwd {
        command.current_dir(cwd);
    }
    for name in BLOCKED_ENV.iter().chain(launch.unset) {
        command.env_remove(name);
    }
    for (name, value) in &launch.env {
        command.env(name, value);
    }
    command
}

/// Runs `program` hidden, with stdin closed, and waits up to `timeout` for it to exit.
/// Output is captured as (lossy) UTF-8.
pub fn run<I, S>(program: &Path, args: I, launch: &Launch<'_>, timeout: Duration) -> Result<Output, RunError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = base_command(program, args, launch);
    command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let started = Instant::now();
    let mut child = command.spawn().map_err(RunError::Spawn)?;
    let stdout = drain(child.stdout.take());
    let stderr = drain(child.stderr.take());
    let status = wait(&mut child, timeout)?;
    Ok(Output {
        status,
        stdout: stdout.join().unwrap_or_default(),
        stderr: stderr.join().unwrap_or_default(),
        elapsed: started.elapsed(),
    })
}

/// Starts a GUI program (e.g. VS Code behind its `.cmd` shim) without waiting for it and
/// without a console window.
pub fn launch_detached<I, S>(program: &Path, args: I) -> io::Result<()>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = base_command(program, args, &Launch::default());
    command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command.spawn().map(drop)
}

/// Runs `program` in a new, visible console window (for interactive sign-in) and waits up to
/// `timeout` for the user to finish and the window to close.
pub fn run_in_console<I, S>(program: &Path, args: I, launch: &Launch<'_>, timeout: Duration) -> Result<ExitStatus, RunError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = base_command(program, args, launch);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NEW_CONSOLE);
    }
    let mut child = command.spawn().map_err(RunError::Spawn)?;
    wait(&mut child, timeout)
}

/// Stops a streaming program and everything it started (e.g. `node` behind a `.cmd` shim).
#[derive(Debug)]
pub struct KillSwitch {
    pid: u32,
    killed: AtomicBool,
}

impl KillSwitch {
    pub fn kill(&self) {
        if self.killed.swap(true, Ordering::SeqCst) {
            return;
        }
        kill_tree(self.pid);
    }

    pub fn was_killed(&self) -> bool {
        self.killed.load(Ordering::SeqCst)
    }
}

#[cfg(windows)]
fn kill_tree(pid: u32) {
    use std::os::windows::process::CommandExt;
    let _ = Command::new("taskkill")
        .args(["/pid", &pid.to_string(), "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .status();
}

#[cfg(not(windows))]
fn kill_tree(pid: u32) {
    let _ = Command::new("kill").args(["-9", &pid.to_string()]).status();
}

/// How a streaming program ended.
#[derive(Debug)]
pub struct StreamEnd {
    pub status: ExitStatus,
    pub stderr: String,
    pub killed: bool,
}

/// A running program whose stdout is read line by line while it runs.
pub struct StreamingChild {
    child: Child,
    lines: Lines<BufReader<ChildStdout>>,
    stderr: thread::JoinHandle<String>,
    stdin: thread::JoinHandle<()>,
    switch: Arc<KillSwitch>,
}

impl StreamingChild {
    pub fn kill_switch(&self) -> Arc<KillSwitch> {
        Arc::clone(&self.switch)
    }

    pub fn next_line(&mut self) -> Option<String> {
        self.lines.next().and_then(Result::ok)
    }

    pub fn finish(mut self) -> Result<StreamEnd, RunError> {
        let status = self.child.wait().map_err(RunError::Io)?;
        let _ = self.stdin.join();
        Ok(StreamEnd {
            status,
            stderr: self.stderr.join().unwrap_or_default(),
            killed: self.switch.was_killed(),
        })
    }
}

/// Starts `program` hidden, writes `input` to its stdin and closes it, and hands back its stdout
/// as lines. Passing the prompt on stdin keeps it away from `cmd.exe` argument parsing.
pub fn spawn_streaming<I, S>(program: &Path, args: I, launch: &Launch<'_>, input: &str) -> Result<StreamingChild, RunError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = base_command(program, args, launch);
    command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command.spawn().map_err(RunError::Spawn)?;
    let stdin = feed(child.stdin.take(), input.to_owned());
    let stderr = drain(child.stderr.take());
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| RunError::Io(io::Error::other("stdout is not captured")))?;
    let switch = Arc::new(KillSwitch {
        pid: child.id(),
        killed: AtomicBool::new(false),
    });
    Ok(StreamingChild {
        child,
        lines: BufReader::new(stdout).lines(),
        stderr,
        stdin,
        switch,
    })
}

fn feed<W: Write + Send + 'static>(pipe: Option<W>, input: String) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        if let Some(mut pipe) = pipe {
            let _ = pipe.write_all(input.as_bytes());
        }
    })
}

fn drain<R: Read + Send + 'static>(pipe: Option<R>) -> thread::JoinHandle<String> {
    thread::spawn(move || {
        let mut bytes = Vec::new();
        if let Some(mut pipe) = pipe {
            let _ = pipe.read_to_end(&mut bytes);
        }
        String::from_utf8_lossy(&bytes).into_owned()
    })
}

fn wait(child: &mut Child, timeout: Duration) -> Result<ExitStatus, RunError> {
    let deadline = Instant::now() + timeout;
    loop {
        if let Some(status) = child.try_wait().map_err(RunError::Io)? {
            return Ok(status);
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(RunError::Timeout(timeout));
        }
        thread::sleep(Duration::from_millis(40));
    }
}

/// Finds `name` on `PATH`, trying each `PATHEXT` extension on Windows (`claude` → `claude.exe`, `claude.cmd`, …).
pub fn find_on_path(name: &str) -> Option<std::path::PathBuf> {
    let path = std::env::var_os("PATH")?;
    let extensions: Vec<String> = if cfg!(windows) {
        std::env::var("PATHEXT")
            .unwrap_or_else(|_| ".EXE;.CMD;.BAT;.COM".into())
            .split(';')
            .filter(|e| !e.is_empty())
            .map(|e| e.to_ascii_lowercase())
            .collect()
    } else {
        vec![String::new()]
    };
    std::env::split_paths(&path).find_map(|dir| {
        extensions
            .iter()
            .map(|ext| dir.join(format!("{name}{ext}")))
            .find(|candidate| candidate.is_file())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn captures_output_and_exit_code() {
        let cmd = find_on_path("cmd").expect("cmd.exe on PATH");
        let launch = Launch {
            cwd: None,
            env: vec![("PROCHECK_TEST_VALUE", "hello".into())],
            unset: &[],
        };
        let out = run(&cmd, ["/c", "echo %PROCHECK_TEST_VALUE%& echo oops 1>&2& exit /b 3"], &launch, Duration::from_secs(10)).unwrap();
        assert_eq!(out.stdout.trim(), "hello");
        assert_eq!(out.stderr.trim(), "oops");
        assert_eq!(out.status.code(), Some(3));
    }

    #[cfg(windows)]
    #[test]
    fn kills_programs_that_run_too_long() {
        let cmd = find_on_path("cmd").expect("cmd.exe on PATH");
        let result = run(&cmd, ["/c", "ping -n 30 127.0.0.1 >nul"], &Launch::default(), Duration::from_millis(300));
        assert!(matches!(result, Err(RunError::Timeout(_))));
    }

    #[cfg(windows)]
    #[test]
    fn streams_stdout_lines_and_reads_stdin() {
        let cmd = find_on_path("cmd").expect("cmd.exe on PATH");
        let mut child = spawn_streaming(&cmd, ["/c", "echo first& more"], &Launch::default(), "from stdin\r\n").unwrap();
        let mut lines = Vec::new();
        while let Some(line) = child.next_line() {
            lines.push(line.trim().to_owned());
        }
        let end = child.finish().unwrap();
        assert!(end.status.success());
        assert!(!end.killed);
        assert_eq!(lines.iter().filter(|l| !l.is_empty()).collect::<Vec<_>>(), ["first", "from stdin"]);
    }

    #[cfg(windows)]
    #[test]
    fn kill_switch_stops_a_streaming_program() {
        let cmd = find_on_path("cmd").expect("cmd.exe on PATH");
        let mut child = spawn_streaming(&cmd, ["/c", "echo ready& ping -n 30 127.0.0.1 >nul"], &Launch::default(), "").unwrap();
        assert_eq!(child.next_line().as_deref().map(str::trim), Some("ready"));
        let started = Instant::now();
        child.kill_switch().kill();
        while child.next_line().is_some() {}
        let end = child.finish().unwrap();
        assert!(end.killed);
        assert!(started.elapsed() < Duration::from_secs(10));
    }

    #[test]
    fn missing_program_is_a_spawn_error() {
        let result = run(Path::new("Z:\\definitely\\missing.exe"), ["--version"], &Launch::default(), Duration::from_secs(1));
        assert!(matches!(result, Err(RunError::Spawn(_))));
    }
}
