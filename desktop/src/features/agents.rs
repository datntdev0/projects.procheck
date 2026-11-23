//! Agent integration: the AI CLI tools Procheck drives (Claude Code, Codex CLI).
//!
//! Every CLI runs with its own home folder in the application data directory
//! (`<data dir>\cli\claude`, `<data dir>\cli\codex`), set through the CLI's home variable
//! (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`). Sign-in, config, sessions and history therefore stay
//! apart from the user's own profile (`~/.claude`, `~/.codex`): signing in or out here never
//! touches the CLI outside Procheck. `HOME` / `USERPROFILE` are left alone so git, ssh and
//! package managers keep working. The sign-in is shared by every project.
//!
//! This module finds the executable, reads its version and sign-in state, runs a one-turn
//! connection test and starts sign-in / sign-out.
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::infra::process::{self, Launch, Output, RunError};

const VERSION_TIMEOUT: Duration = Duration::from_secs(15);
const AUTH_TIMEOUT: Duration = Duration::from_secs(20);
const TEST_TIMEOUT: Duration = Duration::from_secs(120);
const SIGN_OUT_TIMEOUT: Duration = Duration::from_secs(30);
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(600);
const MODELS_TIMEOUT: Duration = Duration::from_secs(30);

/// Prompt of the connection test: one short turn, no tools.
const TEST_PROMPT: &str = "Reply with the single word OK.";

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentId {
    #[default]
    Claude,
    Codex,
}

impl AgentId {
    pub const ALL: [AgentId; 2] = [AgentId::Claude, AgentId::Codex];

    /// Stable key, also the folder name of the CLI home (`cli\\claude`).
    pub fn key(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
        }
    }

    /// Variable that points the CLI at its config / home folder.
    pub fn home_var(self) -> &'static str {
        match self {
            Self::Claude => "CLAUDE_CONFIG_DIR",
            Self::Codex => "CODEX_HOME",
        }
    }

    /// Credentials read from the environment that would bypass the CLI home's sign-in.
    fn credential_vars(self) -> &'static [&'static str] {
        match self {
            Self::Claude => &["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"],
            Self::Codex => &["OPENAI_API_KEY", "CODEX_API_KEY"],
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Self::Claude => "Claude Code",
            Self::Codex => "Codex CLI",
        }
    }

    /// Executable name looked up on `PATH`.
    fn program(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
        }
    }

    /// Install locations checked when the CLI is not on `PATH` (e.g. a PATH change after Procheck started).
    fn known_locations(self) -> Vec<PathBuf> {
        let home = std::env::var_os("USERPROFILE").map(PathBuf::from);
        let appdata = std::env::var_os("APPDATA").map(PathBuf::from);
        let mut paths = Vec::new();
        match self {
            Self::Claude => {
                if let Some(home) = &home {
                    paths.push(home.join(".local").join("bin").join("claude.exe"));
                }
                if let Some(appdata) = &appdata {
                    paths.push(appdata.join("npm").join("claude.cmd"));
                }
            }
            Self::Codex => {
                if let Some(appdata) = &appdata {
                    paths.push(appdata.join("npm").join("codex.cmd"));
                }
            }
        }
        paths
    }
}

/// Where the executable came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BinarySource {
    /// Path set in Settings.
    Custom,
    /// Found on `PATH` or in a known install location.
    Detected,
    /// Nothing found.
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AuthMethod {
    /// Claude.ai / ChatGPT account.
    Subscription,
    ApiKey,
    Other,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub signed_in: bool,
    pub method: Option<AuthMethod>,
    /// Subscription plan when the CLI reports it (e.g. "Max").
    pub plan: Option<String>,
    /// Signed-in account (e-mail) when the CLI reports it.
    pub account: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelOption {
    /// Value passed to `--model` / `-m`.
    pub id: String,
    pub label: String,
}

/// What Settings → Agent Integration shows for one CLI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatus {
    pub agent: AgentId,
    pub name: &'static str,
    /// Executable that was checked (custom or detected).
    pub bin_path: Option<String>,
    pub source: BinarySource,
    /// CLI home folder in the application data directory (sign-in, config, sessions).
    pub home: String,
    /// True when the executable started and reported a version.
    pub installed: bool,
    pub version: Option<String>,
    pub auth: AuthStatus,
    /// Models offered in the "Default model" list.
    pub models: Vec<ModelOption>,
    /// Why the CLI could not be checked (missing file, failed to start, …).
    pub error: Option<String>,
}

/// Result of a successful connection test.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestResult {
    pub duration_ms: u64,
    /// Model that answered, when the CLI reports it.
    pub model: Option<String>,
    pub reply: String,
}

#[derive(Debug)]
pub enum AgentError {
    NotInstalled(String),
    SignedOut,
    Timeout,
    Failed(String),
}

impl AgentError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::NotInstalled(_) => "notInstalled",
            Self::SignedOut => "signedOut",
            Self::Timeout => "timeout",
            Self::Failed(_) => "failed",
        }
    }
}

impl std::fmt::Display for AgentError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotInstalled(why) => write!(f, "CLI not found: {why}"),
            Self::SignedOut => write!(f, "not signed in"),
            Self::Timeout => write!(f, "the CLI did not answer in time"),
            Self::Failed(why) => write!(f, "{why}"),
        }
    }
}

impl std::error::Error for AgentError {}

impl From<RunError> for AgentError {
    fn from(e: RunError) -> Self {
        match e {
            RunError::Spawn(e) => Self::NotInstalled(e.to_string()),
            RunError::Timeout(_) => Self::Timeout,
            RunError::Io(e) => Self::Failed(e.to_string()),
        }
    }
}

/// Executable to run: the custom path when set (even if missing, so the UI can report it),
/// otherwise the first match on `PATH` or in a known install location.
pub fn resolve_binary(agent: AgentId, custom: Option<&str>) -> (Option<PathBuf>, BinarySource) {
    if let Some(custom) = custom.map(str::trim).filter(|c| !c.is_empty()) {
        return (Some(PathBuf::from(custom)), BinarySource::Custom);
    }
    let found = process::find_on_path(agent.program())
        .or_else(|| agent.known_locations().into_iter().find(|p| p.is_file()));
    match found {
        Some(path) => (Some(path), BinarySource::Detected),
        None => (None, BinarySource::None),
    }
}

/// Environment of every CLI run: the CLI home, and no credentials inherited from the user's environment.
fn launch<'a>(agent: AgentId, home: &Path, cwd: Option<&'a Path>) -> Result<Launch<'a>, AgentError> {
    fs::create_dir_all(home).map_err(|e| AgentError::Failed(format!("could not create {}: {e}", home.display())))?;
    Ok(Launch {
        cwd,
        env: vec![(agent.home_var(), home.as_os_str().to_owned())],
        unset: agent.credential_vars(),
    })
}

fn require_binary(agent: AgentId, custom: Option<&str>) -> Result<PathBuf, AgentError> {
    match resolve_binary(agent, custom) {
        (Some(path), _) if path.is_file() => Ok(path),
        (Some(path), _) => Err(AgentError::NotInstalled(path.display().to_string())),
        (None, _) => Err(AgentError::NotInstalled(format!("{} is not on PATH", agent.program()))),
    }
}

/// Finds the CLI and reads its version, sign-in state and models, using the CLI home `home`.
pub fn status(agent: AgentId, custom: Option<&str>, home: &Path) -> AgentStatus {
    let (bin, source) = resolve_binary(agent, custom);
    let mut status = AgentStatus {
        agent,
        name: agent.name(),
        bin_path: bin.as_ref().map(|p| p.display().to_string()),
        source,
        home: home.display().to_string(),
        installed: false,
        version: None,
        auth: AuthStatus::default(),
        models: Vec::new(),
        error: None,
    };
    let Some(bin) = bin else {
        return status;
    };
    if !bin.is_file() {
        status.error = Some(format!("file not found: {}", bin.display()));
        return status;
    }
    let env = match launch(agent, home, None) {
        Ok(env) => env,
        Err(e) => {
            status.error = Some(e.to_string());
            return status;
        }
    };

    match process::run(&bin, ["--version"], &env, VERSION_TIMEOUT) {
        Ok(out) if out.success() => match parse_version(&out.stdout) {
            Some(version) => {
                status.installed = true;
                status.version = Some(version);
            }
            None => status.error = Some(format!("unexpected --version output: {}", first_line(&out.stdout))),
        },
        Ok(out) => status.error = Some(failure_reason(&out)),
        Err(e) => status.error = Some(e.to_string()),
    }
    if !status.installed {
        log::warn!("{} at {} could not be checked: {}", agent.name(), bin.display(), status.error.as_deref().unwrap_or("?"));
        return status;
    }

    match read_auth(agent, &bin, &env) {
        Ok(auth) => status.auth = auth,
        Err(e) => status.error = Some(format!("could not read the sign-in state: {e}")),
    }
    status.models = models(agent, &bin, &env);
    log::debug!("agent status: {status:?}");
    status
}

fn read_auth(agent: AgentId, bin: &Path, env: &Launch<'_>) -> Result<AuthStatus, AgentError> {
    match agent {
        AgentId::Claude => {
            // Exit code 1 when signed out; the JSON is printed either way.
            let out = process::run(bin, ["auth", "status", "--json"], env, AUTH_TIMEOUT)?;
            parse_claude_auth(&out.stdout).ok_or_else(|| AgentError::Failed(failure_reason(&out)))
        }
        AgentId::Codex => {
            // Prints to stderr; exit code 1 when signed out.
            let out = process::run(bin, ["login", "status"], env, AUTH_TIMEOUT)?;
            Ok(parse_codex_auth(&format!("{}\n{}", out.stdout, out.stderr), out.success()))
        }
    }
}

/// Sends one short prompt from `cwd` (an empty scratch folder) and waits for the answer.
/// No session is kept and no MCP servers are loaded.
pub fn test(agent: AgentId, custom: Option<&str>, model: Option<&str>, home: &Path, cwd: &Path) -> Result<TestResult, AgentError> {
    let bin = require_binary(agent, custom)?;
    let model = model.map(str::trim).filter(|m| !m.is_empty());
    let mut args: Vec<String> = match agent {
        AgentId::Claude => vec![
            "-p".into(),
            TEST_PROMPT.into(),
            "--output-format".into(),
            "json".into(),
            "--no-session-persistence".into(),
            "--strict-mcp-config".into(),
        ],
        AgentId::Codex => vec![
            "exec".into(),
            "--json".into(),
            "--ephemeral".into(),
            "--skip-git-repo-check".into(),
            "--sandbox".into(),
            "read-only".into(),
        ],
    };
    if let Some(model) = model {
        args.push(if agent == AgentId::Claude { "--model" } else { "-m" }.into());
        args.push(model.into());
    }
    if agent == AgentId::Codex {
        args.push(TEST_PROMPT.into());
    }

    log::info!("testing {} ({}) with model {}", agent.name(), bin.display(), model.unwrap_or("default"));
    let out = process::run(&bin, &args, &launch(agent, home, Some(cwd))?, TEST_TIMEOUT)
        .inspect_err(|e| log::warn!("{} test failed: {e}", agent.name()))?;
    let result = match agent {
        AgentId::Claude => parse_claude_test(&out),
        AgentId::Codex => parse_codex_test(&out),
    };
    match &result {
        Ok(r) => log::info!("{} answered in {} ms", agent.name(), r.duration_ms),
        Err(e) => log::warn!("{} test failed: {e}", agent.name()),
    }
    result.map(|mut r| {
        r.model = r.model.or_else(|| model.map(str::to_owned));
        r
    })
}

/// Opens the CLI's sign-in (into the CLI home) in a console window and waits until the window closes.
pub fn sign_in(agent: AgentId, custom: Option<&str>, home: &Path, cwd: &Path) -> Result<AgentStatus, AgentError> {
    let bin = require_binary(agent, custom)?;
    let args: &[&str] = match agent {
        AgentId::Claude => &["auth", "login"],
        AgentId::Codex => &["login"],
    };
    log::info!("starting sign-in for {}", agent.name());
    let exit = process::run_in_console(&bin, args, &launch(agent, home, Some(cwd))?, SIGN_IN_TIMEOUT)?;
    log::info!("{} sign-in window closed ({exit})", agent.name());
    Ok(status(agent, custom, home))
}

/// Signs the CLI out of its Procheck home. The user's own CLI sign-in is not affected.
pub fn sign_out(agent: AgentId, custom: Option<&str>, home: &Path) -> Result<AgentStatus, AgentError> {
    let bin = require_binary(agent, custom)?;
    let args: &[&str] = match agent {
        AgentId::Claude => &["auth", "logout"],
        AgentId::Codex => &["logout"],
    };
    let out = process::run(&bin, args, &launch(agent, home, None)?, SIGN_OUT_TIMEOUT)?;
    if !out.success() {
        return Err(AgentError::Failed(failure_reason(&out)));
    }
    log::info!("signed out of {}", agent.name());
    Ok(status(agent, custom, home))
}

/// Models offered for the CLI.
/// Claude: the aliases Claude Code resolves to the latest model of each family, then the
/// current model ids (all verified with `claude -p --model …`).
/// Codex: the catalog the CLI reports for the signed-in account (`codex debug models`).
fn models(agent: AgentId, bin: &Path, env: &Launch<'_>) -> Vec<ModelOption> {
    match agent {
        AgentId::Claude => CLAUDE_MODELS.iter().map(|(id, label)| ModelOption { id: (*id).into(), label: (*label).into() }).collect(),
        AgentId::Codex => match process::run(bin, ["debug", "models"], env, MODELS_TIMEOUT) {
            Ok(out) if out.success() => parse_codex_models(&out.stdout),
            Ok(out) => {
                log::warn!("codex debug models failed: {}", failure_reason(&out));
                Vec::new()
            }
            Err(e) => {
                log::warn!("codex debug models failed: {e}");
                Vec::new()
            }
        },
    }
}

/// `--model` values for Claude Code: aliases first, then the full model ids.
const CLAUDE_MODELS: &[(&str, &str)] = &[
    ("fable", "Fable · latest (fable)"),
    ("opus", "Opus · latest (opus)"),
    ("sonnet", "Sonnet · latest (sonnet)"),
    ("haiku", "Haiku · latest (haiku)"),
    ("claude-fable-5-2", "Claude Fable 5.2 (claude-fable-5-2)"),
    ("claude-opus-5-5", "Claude Opus 5.5 (claude-opus-5-5)"),
    ("claude-sonnet-5-5", "Claude Sonnet 5.5 (claude-sonnet-5-5)"),
    ("claude-haiku-5-5", "Claude Haiku 5.5 (claude-haiku-5-5)"),
];

// ---------- Output parsing ----------

/// First whitespace-separated token that starts with a digit: `2.1.330 (Claude Code)`, `codex-cli 0.168.0`.
fn parse_version(stdout: &str) -> Option<String> {
    stdout
        .split_whitespace()
        .find(|t| t.starts_with(|c: char| c.is_ascii_digit()))
        .map(|t| t.trim_end_matches(|c: char| !c.is_ascii_alphanumeric()).to_owned())
}

fn parse_claude_auth(stdout: &str) -> Option<AuthStatus> {
    let json: Value = serde_json::from_str(stdout.trim()).ok()?;
    let signed_in = json.get("loggedIn")?.as_bool()?;
    if !signed_in {
        return Some(AuthStatus::default());
    }
    let text = |key: &str| json.get(key).and_then(Value::as_str).filter(|s| !s.is_empty()).map(str::to_owned);
    let plan = text("subscriptionType").map(|p| capitalize(&p));
    let method = match text("authMethod").as_deref() {
        Some("claude.ai") => AuthMethod::Subscription,
        Some(m) if m.contains("api") || m.contains("console") || m.contains("key") => AuthMethod::ApiKey,
        _ if plan.is_some() => AuthMethod::Subscription,
        _ => AuthMethod::Other,
    };
    Some(AuthStatus {
        signed_in,
        method: Some(method),
        plan,
        account: text("email"),
    })
}

fn parse_codex_auth(output: &str, success: bool) -> AuthStatus {
    let lower = output.to_lowercase();
    if !success || lower.contains("not logged in") {
        return AuthStatus::default();
    }
    let method = if lower.contains("api key") {
        AuthMethod::ApiKey
    } else if lower.contains("chatgpt") {
        AuthMethod::Subscription
    } else {
        AuthMethod::Other
    };
    AuthStatus {
        signed_in: true,
        method: Some(method),
        plan: None,
        account: None,
    }
}

fn parse_codex_models(text: &str) -> Vec<ModelOption> {
    let Ok(json) = serde_json::from_str::<Value>(text) else {
        return Vec::new();
    };
    json.get("models")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|m| m.get("visibility").and_then(Value::as_str) == Some("list"))
        .filter_map(|m| {
            let id = m.get("slug")?.as_str()?.to_owned();
            let label = m.get("display_name").and_then(Value::as_str).unwrap_or(&id).to_owned();
            Some(ModelOption { id, label })
        })
        .collect()
}

/// `claude -p --output-format json` prints one result object.
fn parse_claude_test(out: &Output) -> Result<TestResult, AgentError> {
    let json: Value = serde_json::from_str(out.stdout.trim()).map_err(|_| classify_failure(out))?;
    let reply = json.get("result").and_then(Value::as_str).unwrap_or_default().trim().to_owned();
    if json.get("is_error").and_then(Value::as_bool).unwrap_or(!out.success()) {
        return Err(if looks_signed_out(&reply) {
            AgentError::SignedOut
        } else {
            AgentError::Failed(if reply.is_empty() { failure_reason(out) } else { reply })
        });
    }
    let model = json
        .get("modelUsage")
        .and_then(Value::as_object)
        .and_then(|usage| usage.keys().next().cloned());
    Ok(TestResult {
        duration_ms: elapsed_ms(out),
        model,
        reply,
    })
}

/// `codex exec --json` prints one event per line; the answer is the last `agent_message`.
fn parse_codex_test(out: &Output) -> Result<TestResult, AgentError> {
    let mut reply = None;
    let mut error = None;
    let mut completed = false;
    for event in out.stdout.lines().filter_map(|l| serde_json::from_str::<Value>(l).ok()) {
        match event.get("type").and_then(Value::as_str) {
            Some("item.completed") => {
                let item = event.get("item");
                if item.and_then(|i| i.get("type")).and_then(Value::as_str) == Some("agent_message") {
                    reply = item.and_then(|i| i.get("text")).and_then(Value::as_str).map(str::to_owned);
                }
            }
            Some("turn.completed") => completed = true,
            Some("turn.failed") | Some("error") => {
                error = event
                    .get("error")
                    .and_then(|e| e.get("message").or(Some(e)))
                    .or_else(|| event.get("message"))
                    .map(|m| m.as_str().map(str::to_owned).unwrap_or_else(|| m.to_string()));
            }
            _ => {}
        }
    }
    match (completed, reply) {
        (true, Some(reply)) => Ok(TestResult {
            duration_ms: elapsed_ms(out),
            model: None,
            reply: reply.trim().to_owned(),
        }),
        _ => match error {
            Some(e) if looks_signed_out(&e) => Err(AgentError::SignedOut),
            Some(e) => Err(AgentError::Failed(e)),
            None => Err(classify_failure(out)),
        },
    }
}

fn classify_failure(out: &Output) -> AgentError {
    let reason = failure_reason(out);
    if looks_signed_out(&reason) {
        AgentError::SignedOut
    } else {
        AgentError::Failed(reason)
    }
}

fn looks_signed_out(text: &str) -> bool {
    let lower = text.to_lowercase();
    ["not logged in", "please run /login", "login required", "not signed in", "unauthorized", "401"]
        .iter()
        .any(|needle| lower.contains(needle))
}

/// Last meaningful line of stderr (or stdout), with the exit code when there is nothing else.
fn failure_reason(out: &Output) -> String {
    let line = |text: &str| text.lines().rev().map(str::trim).find(|l| !l.is_empty()).map(str::to_owned);
    line(&out.stderr)
        .or_else(|| line(&out.stdout))
        .unwrap_or_else(|| format!("exited with {}", out.status))
}

fn first_line(text: &str) -> &str {
    text.lines().next().unwrap_or_default().trim()
}

fn elapsed_ms(out: &Output) -> u64 {
    u64::try_from(out.elapsed.as_millis()).unwrap_or(u64::MAX)
}

fn capitalize(text: &str) -> String {
    let mut chars = text.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    fn output(code: i32, stdout: &str, stderr: &str) -> Output {
        use std::os::windows::process::ExitStatusExt;
        Output {
            status: std::process::ExitStatus::from_raw(code as u32),
            stdout: stdout.into(),
            stderr: stderr.into(),
            elapsed: Duration::from_millis(812),
        }
    }

    #[test]
    fn versions() {
        assert_eq!(parse_version("2.1.330 (Claude Code)\n").as_deref(), Some("2.1.330"));
        assert_eq!(parse_version("codex-cli 0.168.0\r\n").as_deref(), Some("0.168.0"));
        assert_eq!(parse_version("usage: foo"), None);
    }

    #[test]
    fn claude_auth() {
        let signed_in = r#"{ "loggedIn": true, "authMethod": "claude.ai", "email": "me@example.com", "subscriptionType": "max" }"#;
        assert_eq!(
            parse_claude_auth(signed_in),
            Some(AuthStatus {
                signed_in: true,
                method: Some(AuthMethod::Subscription),
                plan: Some("Max".into()),
                account: Some("me@example.com".into()),
            })
        );
        let key = r#"{ "loggedIn": true, "authMethod": "api_key" }"#;
        assert_eq!(parse_claude_auth(key).unwrap().method, Some(AuthMethod::ApiKey));
        let out = r#"{ "loggedIn": false, "authMethod": "none" }"#;
        assert_eq!(parse_claude_auth(out), Some(AuthStatus::default()));
        assert_eq!(parse_claude_auth("error: unknown command"), None);
    }

    #[test]
    fn codex_auth() {
        assert_eq!(parse_codex_auth("\nLogged in using ChatGPT\n", true).method, Some(AuthMethod::Subscription));
        assert_eq!(parse_codex_auth("Logged in using an API key - sk-***", true).method, Some(AuthMethod::ApiKey));
        assert!(!parse_codex_auth("Not logged in", false).signed_in);
    }

    #[test]
    fn codex_models_lists_visible_models_only() {
        let text = r#"{ "models": [
            { "slug": "gpt-6-luna", "display_name": "GPT-6-Luna", "visibility": "list" },
            { "slug": "internal", "display_name": "Internal", "visibility": "hide" }
        ] }"#;
        assert_eq!(parse_codex_models(text), vec![ModelOption { id: "gpt-6-luna".into(), label: "GPT-6-Luna".into() }]);
        assert!(parse_codex_models("nope").is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn claude_test_result() {
        let ok = r#"{"type":"result","is_error":false,"result":"OK","modelUsage":{"claude-haiku-5-5":{}}}"#;
        let result = parse_claude_test(&output(0, ok, "")).unwrap();
        assert_eq!((result.reply.as_str(), result.model.as_deref(), result.duration_ms), ("OK", Some("claude-haiku-5-5"), 812));

        let signed_out = r#"{"type":"result","is_error":true,"result":"Not logged in · Please run /login"}"#;
        assert!(matches!(parse_claude_test(&output(1, signed_out, "")), Err(AgentError::SignedOut)));
        assert!(matches!(parse_claude_test(&output(1, "", "boom")), Err(AgentError::Failed(m)) if m == "boom"));
    }

    #[cfg(windows)]
    #[test]
    fn codex_test_result() {
        let ok = concat!(
            r#"{"type":"thread.started","thread_id":"t"}"#, "\n",
            r#"{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"OK"}}"#, "\n",
            r#"{"type":"turn.completed","usage":{}}"#, "\n",
        );
        assert_eq!(parse_codex_test(&output(0, ok, "Reading additional input from stdin...")).unwrap().reply, "OK");

        let failed = r#"{"type":"turn.failed","error":{"message":"model not found"}}"#;
        assert!(matches!(parse_codex_test(&output(1, failed, "")), Err(AgentError::Failed(m)) if m == "model not found"));
        let unauthorized = r#"{"type":"error","message":"401 Unauthorized"}"#;
        assert!(matches!(parse_codex_test(&output(1, unauthorized, "")), Err(AgentError::SignedOut)));
    }

    #[test]
    fn custom_path_wins_and_missing_file_is_reported() {
        let missing = "Z:\\nowhere\\claude.exe";
        let home = std::env::temp_dir().join("procheck-agents-missing");
        assert_eq!(resolve_binary(AgentId::Claude, Some(missing)), (Some(PathBuf::from(missing)), BinarySource::Custom));
        let status = status(AgentId::Claude, Some(missing), &home);
        assert!(!status.installed);
        assert!(status.error.unwrap().contains("file not found"));
        assert!(matches!(test(AgentId::Codex, Some(missing), None, &home, Path::new(".")), Err(AgentError::NotInstalled(_))));
    }

    /// The CLI runs with its home variable pointing at the Procheck home, without inherited credentials.
    #[cfg(windows)]
    #[test]
    fn cli_runs_with_its_procheck_home() {
        let dir = std::env::temp_dir().join(format!("procheck-agents-home-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let bin = dir.join("claude.cmd");
        fs::write(
            &bin,
            "@echo off\r\nif \"%~1\"==\"--version\" (echo %CLAUDE_CONFIG_DIR%>\"%~dp0seen-home.txt\"& echo [%ANTHROPIC_API_KEY%]>\"%~dp0seen-key.txt\"& echo 1.2.3 ^(Claude Code^)& exit /b 0)\r\necho {\"loggedIn\": false}\r\nexit /b 1\r\n",
        )
        .unwrap();
        let home = dir.join("cli").join("claude");

        let status = status(AgentId::Claude, Some(bin.to_str().unwrap()), &home);

        assert_eq!(status.version.as_deref(), Some("1.2.3"));
        assert!(home.is_dir());
        assert_eq!(status.home, home.display().to_string());
        assert_eq!(fs::read_to_string(dir.join("seen-home.txt")).unwrap().trim(), home.display().to_string());
        assert_eq!(fs::read_to_string(dir.join("seen-key.txt")).unwrap().trim(), "[]");
        assert!(!status.auth.signed_in);
        assert_eq!(status.models.first().map(|m| m.id.as_str()), Some("fable"));
        fs::remove_dir_all(dir).unwrap();
    }
}
