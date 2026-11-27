//! Agent integration: the AI CLI tools Procheck drives (Claude Code, Codex CLI).
//!
//! Every CLI runs with its own home folder in the application data directory
//! (`<data dir>\cli\claude`, `<data dir>\cli\codex`), set through the CLI's home variable
//! (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`). Sign-in, config, sessions and history therefore stay
//! apart from the user's own profile (`~/.claude`, `~/.codex`): signing in or out here never
//! touches the CLI outside Procheck. `HOME` / `USERPROFILE` are left alone so git, ssh and
//! package managers keep working. The sign-in is shared by every project.
//!
//! The executables are the ones Procheck downloaded (`infra::tools`); nothing on the user's `PATH`
//! is used. This module reads the installed version and sign-in state, runs a one-turn connection
//! test and starts sign-in / sign-out.
use std::fs;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::infra::process::{self, Launch, Output, RunError};
use crate::infra::tools::{self, install, manifest::{self, ToolId}};

const CODEX_AUTH_FILE: &str = "auth.json";
const CLAUDE_CREDENTIALS_FILE: &str = ".credentials.json";
const CLAUDE_CONFIG_FILE: &str = ".claude.json";
const OPENAI_AUTH_CLAIM: &str = "https://api.openai.com/auth";

const TEST_TIMEOUT: Duration = Duration::from_secs(120);
const SIGN_OUT_TIMEOUT: Duration = Duration::from_secs(30);
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(600);
const MODELS_TIMEOUT: Duration = Duration::from_secs(30);

/// `-c` value that stops Codex looking for a newer version on start (the version is pinned).
pub(crate) const CODEX_NO_UPDATE_CHECK: &str = "check_for_update_on_startup=false";

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

    /// The tool that provides this CLI.
    pub fn tool_id(self) -> ToolId {
        match self {
            Self::Claude => ToolId::Claude,
            Self::Codex => ToolId::Codex,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AuthMethod {
    /// Claude.ai / ChatGPT account.
    Subscription,
    ApiKey,
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
    /// CLI home folder in the application data directory (sign-in, config, sessions).
    pub home: String,
    /// The CLI is downloaded (marker and executable are there).
    pub installed: bool,
    /// The downloaded version.
    pub version: Option<String>,
    /// The version Procheck wants (`tools.manifest.json`).
    pub bundled_version: String,
    /// Downloaded, but not the wanted version.
    pub outdated: bool,
    pub auth: AuthStatus,
    /// Models offered in the "Default model" list.
    pub models: Vec<ModelOption>,
    /// Why the CLI could not be checked (its home cannot be created, …).
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
            Self::NotInstalled(why) => write!(f, "{why}"),
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

/// The CLI Procheck downloaded, when it is installed.
pub fn bundled_binary(agent: AgentId) -> Option<PathBuf> {
    tools::installed_executable(agent.tool_id())
}

pub(crate) fn require_binary(agent: AgentId) -> Result<PathBuf, AgentError> {
    bundled_binary(agent).ok_or_else(|| {
        AgentError::NotInstalled(format!("{} has not been downloaded. Download it in Settings → Agent integration.", agent.name()))
    })
}

/// Environment of every CLI run: the CLI home, no credentials inherited from the user's environment,
/// the downloaded git first on `PATH`, and no self-update (the version is the one Procheck pins).
/// Claude Code also gets the Git Bash it needs on Windows.
pub(crate) fn launch<'a>(agent: AgentId, home: &Path, cwd: Option<&'a Path>) -> Result<Launch<'a>, AgentError> {
    fs::create_dir_all(home).map_err(|e| AgentError::Failed(format!("could not create {}: {e}", home.display())))?;
    let mut env = vec![(agent.home_var(), home.as_os_str().to_owned())];
    if let Some(layout) = tools::layout() {
        env.push(("PATH", path_with_git(layout.git_cmd_dir())));
        if agent == AgentId::Claude {
            env.push(("DISABLE_AUTOUPDATER", "1".into()));
            env.push(("CLAUDE_CODE_GIT_BASH_PATH", layout.git_bash().into_os_string()));
        }
    }
    Ok(Launch {
        cwd,
        env,
        unset: agent.credential_vars(),
    })
}

/// `PATH` with `dir` in front.
fn path_with_git(dir: PathBuf) -> OsString {
    let current = std::env::var_os("PATH").unwrap_or_default();
    std::env::join_paths(std::iter::once(dir).chain(std::env::split_paths(&current))).unwrap_or(current)
}

/// The downloaded version, whether it is the wanted one, the sign-in state and the models.
/// Reads the install marker and the CLI home's files; the CLI is only started to list Codex models.
pub fn status(agent: AgentId, home: &Path) -> AgentStatus {
    let wanted = manifest::item(agent.tool_id());
    let marker = tools::layout().and_then(|layout| install::installed(layout, agent.tool_id()));
    let mut status = AgentStatus {
        agent,
        name: agent.name(),
        home: home.display().to_string(),
        installed: marker.is_some(),
        version: marker.as_ref().map(|m| m.version.clone()),
        bundled_version: wanted.version.clone(),
        outdated: marker.as_ref().is_some_and(|m| m.version != wanted.version || m.sha256 != wanted.sha256),
        auth: AuthStatus::default(),
        models: Vec::new(),
        error: None,
    };
    let Some(bin) = bundled_binary(agent) else {
        return status;
    };
    status.auth = read_auth(agent, home);
    match launch(agent, home, None) {
        Ok(env) => status.models = models(agent, &bin, &env),
        Err(e) => status.error = Some(e.to_string()),
    }
    log::debug!("agent status: {status:?}");
    status
}

/// Whether the CLI home holds a usable sign-in. Reads the CLI's files only; no process is started.
pub fn is_signed_in(agent: AgentId, home: &Path) -> bool {
    read_auth(agent, home).signed_in
}

fn read_auth(agent: AgentId, home: &Path) -> AuthStatus {
    let auth = match agent {
        AgentId::Claude => read_claude_files(home),
        AgentId::Codex => read_codex_file(home),
    };
    auth.unwrap_or_default()
}

fn read_claude_files(home: &Path) -> Option<AuthStatus> {
    let credentials = fs::read_to_string(home.join(CLAUDE_CREDENTIALS_FILE)).ok()?;
    let config = fs::read_to_string(home.join(CLAUDE_CONFIG_FILE)).ok();
    parse_claude_files(&credentials, config.as_deref(), chrono::Utc::now().timestamp_millis())
}

fn parse_claude_files(credentials: &str, config: Option<&str>, now_ms: i64) -> Option<AuthStatus> {
    let credentials: Value = serde_json::from_str(credentials).ok()?;
    let oauth = credentials.get("claudeAiOauth")?;
    json_text(oauth, &["refreshToken"])?;
    let expired = oauth.get("refreshTokenExpiresAt").and_then(Value::as_i64).is_some_and(|at| at <= now_ms);
    if expired {
        return None;
    }
    let account = config
        .and_then(|c| serde_json::from_str::<Value>(c).ok())
        .and_then(|c| json_text(&c, &["oauthAccount", "emailAddress"]));
    Some(AuthStatus {
        signed_in: true,
        method: Some(AuthMethod::Subscription),
        plan: json_text(oauth, &["subscriptionType"]).map(|p| capitalize(&p)),
        account,
    })
}

fn read_codex_file(home: &Path) -> Option<AuthStatus> {
    parse_codex_file(&fs::read_to_string(home.join(CODEX_AUTH_FILE)).ok()?)
}

fn parse_codex_file(auth_json: &str) -> Option<AuthStatus> {
    let json: Value = serde_json::from_str(auth_json).ok()?;
    if json_text(&json, &["OPENAI_API_KEY"]).is_some() {
        return Some(AuthStatus {
            signed_in: true,
            method: Some(AuthMethod::ApiKey),
            plan: None,
            account: None,
        });
    }
    json_text(&json, &["tokens", "refresh_token"])?;
    let claims = codex_id_claims(&json);
    Some(AuthStatus {
        signed_in: true,
        method: Some(AuthMethod::Subscription),
        plan: claims.as_ref().and_then(|c| json_text(c, &[OPENAI_AUTH_CLAIM, "chatgpt_plan_type"])).map(|p| capitalize(&p)),
        account: claims.as_ref().and_then(|c| json_text(c, &["email"])),
    })
}

fn codex_id_claims(json: &Value) -> Option<Value> {
    let token = json.get("tokens")?.get("id_token")?.as_str()?;
    let payload = token.split('.').nth(1)?;
    let bytes = URL_SAFE_NO_PAD.decode(payload.trim_end_matches('=')).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn json_text(value: &Value, path: &[&str]) -> Option<String> {
    path.iter()
        .try_fold(value, |node, key| node.get(*key))?
        .as_str()
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

/// Sends one short prompt from `cwd` (an empty scratch folder) and waits for the answer.
/// No session is kept and no MCP servers are loaded.
pub fn test(agent: AgentId, model: Option<&str>, home: &Path, cwd: &Path) -> Result<TestResult, AgentError> {
    let bin = require_binary(agent)?;
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
            "-c".into(),
            CODEX_NO_UPDATE_CHECK.into(),
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
pub fn sign_in(agent: AgentId, home: &Path, cwd: &Path) -> Result<AgentStatus, AgentError> {
    let bin = require_binary(agent)?;
    let args: &[&str] = match agent {
        AgentId::Claude => &["auth", "login"],
        AgentId::Codex => &["login"],
    };
    log::info!("starting sign-in for {}", agent.name());
    let exit = process::run_in_console(&bin, args, &launch(agent, home, Some(cwd))?, SIGN_IN_TIMEOUT)?;
    log::info!("{} sign-in window closed ({exit})", agent.name());
    Ok(status(agent, home))
}

/// Signs the CLI out of its Procheck home. The user's own CLI sign-in is not affected.
pub fn sign_out(agent: AgentId, home: &Path) -> Result<AgentStatus, AgentError> {
    let bin = require_binary(agent)?;
    let args: &[&str] = match agent {
        AgentId::Claude => &["auth", "logout"],
        AgentId::Codex => &["logout"],
    };
    let out = process::run(&bin, args, &launch(agent, home, None)?, SIGN_OUT_TIMEOUT)?;
    if !out.success() {
        return Err(AgentError::Failed(failure_reason(&out)));
    }
    log::info!("signed out of {}", agent.name());
    Ok(status(agent, home))
}

/// Models offered for the CLI.
/// Claude: the aliases Claude Code resolves to the latest model of each family
/// (verified with `claude -p --model …`).
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

/// `--model` values for Claude Code: the aliases that always resolve to the latest model of each family.
const CLAUDE_MODELS: &[(&str, &str)] = &[
    ("fable", "Fable · latest (fable)"),
    ("opus", "Opus · latest (opus)"),
    ("sonnet", "Sonnet · latest (sonnet)"),
    ("haiku", "Haiku · latest (haiku)"),
];

// ---------- Output parsing ----------

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

pub(crate) fn looks_signed_out(text: &str) -> bool {
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
    fn claude_account_comes_from_the_home_files() {
        let credentials = r#"{"claudeAiOauth":{"refreshToken":"r","refreshTokenExpiresAt":2000,"subscriptionType":"team"}}"#;
        let config = r#"{"oauthAccount":{"emailAddress":"me@example.com"}}"#;
        assert_eq!(
            parse_claude_files(credentials, Some(config), 1000),
            Some(AuthStatus {
                signed_in: true,
                method: Some(AuthMethod::Subscription),
                plan: Some("Team".into()),
                account: Some("me@example.com".into()),
            })
        );
        assert_eq!(parse_claude_files(credentials, None, 1000).unwrap().account, None);
        assert_eq!(parse_claude_files(credentials, Some(config), 2000), None);
        assert_eq!(parse_claude_files("{}", Some(config), 1000), None);
        assert_eq!(parse_claude_files("not json", Some(config), 1000), None);
    }

    #[test]
    fn codex_account_comes_from_the_auth_file() {
        let claims = r#"{"email":"me@example.com","https://api.openai.com/auth":{"chatgpt_plan_type":"plus"}}"#;
        let token = format!("header.{}.signature", URL_SAFE_NO_PAD.encode(claims));
        let chatgpt = serde_json::json!({ "auth_mode": "chatgpt", "OPENAI_API_KEY": null, "tokens": { "id_token": token, "refresh_token": "r" } });
        assert_eq!(
            parse_codex_file(&chatgpt.to_string()),
            Some(AuthStatus {
                signed_in: true,
                method: Some(AuthMethod::Subscription),
                plan: Some("Plus".into()),
                account: Some("me@example.com".into()),
            })
        );
        let no_claims = serde_json::json!({ "tokens": { "id_token": "broken", "refresh_token": "r" } });
        assert_eq!(parse_codex_file(&no_claims.to_string()).map(|a| (a.account, a.plan)), Some((None, None)));
        let key = r#"{"auth_mode":"apikey","OPENAI_API_KEY":"sk-test"}"#;
        assert_eq!(parse_codex_file(key).unwrap().method, Some(AuthMethod::ApiKey));
        assert_eq!(parse_codex_file(r#"{"OPENAI_API_KEY":null,"tokens":null}"#), None);
        assert_eq!(parse_codex_file("not json"), None);
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
    fn a_cli_that_is_not_downloaded_is_reported() {
        let home = std::env::temp_dir().join("procheck-agents-missing");
        let status = status(AgentId::Claude, &home);
        assert!(!status.installed && !status.outdated);
        assert_eq!((status.version, status.bundled_version), (None, manifest::item(ToolId::Claude).version.clone()));
        assert!(matches!(test(AgentId::Codex, None, &home, Path::new(".")), Err(AgentError::NotInstalled(_))));
    }

    /// The CLI runs with its home variable pointing at the Procheck home, without inherited credentials.
    #[test]
    fn cli_runs_with_its_procheck_home() {
        let dir = std::env::temp_dir().join(format!("procheck-agents-home-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let home = dir.join("cli").join("claude");

        let launch = launch(AgentId::Claude, &home, None).unwrap();

        assert!(home.is_dir());
        assert!(launch.env.contains(&("CLAUDE_CONFIG_DIR", home.as_os_str().to_owned())));
        assert!(launch.unset.contains(&"ANTHROPIC_API_KEY"));
        fs::remove_dir_all(dir).unwrap();
    }
}
