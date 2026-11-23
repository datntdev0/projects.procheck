//! One chat turn: records the user's message, runs the CLI from the scratch folder with its
//! Procheck home (resuming the chat's CLI session), streams the answer and records it.
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};

use serde::Serialize;

use super::store::{ChatStore, ChatStoreError};
use super::{ChatMessage, ChatSummary, ContextUsage, MessageStatus, Role, TokenTotals, TurnError, UsageLimits, claude, codex, now, title_from};
use crate::features::agents::{self, AgentError, AgentId};
use crate::features::settings::AgentSettings;
use crate::infra::process::{self, KillSwitch, StreamingChild};

#[derive(Debug, Clone, PartialEq)]
pub enum Signal {
    Session { id: String, model: Option<String> },
    Delta(String),
}

#[derive(Debug, Default)]
pub struct TurnOutcome {
    pub session_id: Option<String>,
    pub model: Option<String>,
    pub text: String,
    pub context: Option<ContextUsage>,
    pub totals: TokenTotals,
    pub cost_usd: Option<f64>,
    pub limits: Option<UsageLimits>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ChatEvent {
    UserMessage { chat: ChatSummary, message: ChatMessage },
    Started { session_id: String, model: Option<String> },
    Delta { text: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnResult {
    pub chat: ChatSummary,
    pub message: ChatMessage,
    pub limits: Vec<UsageLimits>,
}

#[derive(Debug)]
pub enum ChatRunError {
    Empty,
    Busy,
    Store(ChatStoreError),
}

impl ChatRunError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Empty => "empty",
            Self::Busy => "busy",
            Self::Store(e) => e.code(),
        }
    }
}

impl std::fmt::Display for ChatRunError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Empty => write!(f, "the message is empty"),
            Self::Busy => write!(f, "this chat is still answering"),
            Self::Store(e) => write!(f, "{e}"),
        }
    }
}

impl std::error::Error for ChatRunError {}

impl From<ChatStoreError> for ChatRunError {
    fn from(e: ChatStoreError) -> Self {
        Self::Store(e)
    }
}

#[derive(Debug, Default)]
struct RunSlot {
    switch: Option<Arc<KillSwitch>>,
    stop_requested: bool,
}

/// Turns in progress, one per chat, so a turn can be stopped from another command.
#[derive(Debug, Default)]
pub struct ChatRuns {
    slots: Mutex<HashMap<String, RunSlot>>,
}

impl ChatRuns {
    pub fn stop(&self, chat_id: &str) -> bool {
        let mut slots = self.lock();
        let Some(slot) = slots.get_mut(chat_id) else {
            return false;
        };
        slot.stop_requested = true;
        if let Some(switch) = &slot.switch {
            switch.kill();
        }
        log::info!("stopping the turn of chat {chat_id}");
        true
    }

    pub fn running(&self) -> Vec<String> {
        self.lock().keys().cloned().collect()
    }

    fn claim(&self, chat_id: &str) -> Result<RunGuard<'_>, ChatRunError> {
        let mut slots = self.lock();
        if slots.contains_key(chat_id) {
            return Err(ChatRunError::Busy);
        }
        slots.insert(chat_id.to_owned(), RunSlot::default());
        Ok(RunGuard {
            runs: self,
            chat_id: chat_id.to_owned(),
        })
    }

    fn attach(&self, chat_id: &str, switch: Arc<KillSwitch>) {
        let mut slots = self.lock();
        let Some(slot) = slots.get_mut(chat_id) else {
            return;
        };
        if slot.stop_requested {
            switch.kill();
        }
        slot.switch = Some(switch);
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<String, RunSlot>> {
        self.slots.lock().unwrap_or_else(|e| e.into_inner())
    }
}

struct RunGuard<'a> {
    runs: &'a ChatRuns,
    chat_id: String,
}

impl Drop for RunGuard<'_> {
    fn drop(&mut self) {
        self.runs.lock().remove(&self.chat_id);
    }
}

/// Where a turn runs: the CLI settings, the Procheck CLI home of each CLI and the working folder.
pub struct TurnContext<'a> {
    pub store: &'a ChatStore,
    pub runs: &'a ChatRuns,
    pub claude: AgentSettings,
    pub codex: AgentSettings,
    pub cli_dir: PathBuf,
    pub cwd: PathBuf,
}

impl TurnContext<'_> {
    fn settings(&self, agent: AgentId) -> &AgentSettings {
        match agent {
            AgentId::Claude => &self.claude,
            AgentId::Codex => &self.codex,
        }
    }
}

pub fn send(ctx: &TurnContext<'_>, chat_id: &str, text: &str, emit: &mut dyn FnMut(ChatEvent)) -> Result<TurnResult, ChatRunError> {
    let prompt = text.trim();
    if prompt.is_empty() {
        return Err(ChatRunError::Empty);
    }
    let _guard = ctx.runs.claim(chat_id)?;
    let (chat, user_message) = record_user_message(ctx.store, chat_id, prompt)?;
    emit(ChatEvent::UserMessage {
        chat: chat.clone(),
        message: user_message,
    });

    let home = ctx.cli_dir.join(chat.agent.key());
    let execution = execute(ctx, &chat, &home, prompt, emit);
    let message = assistant_message(ctx.store, &execution);
    ctx.store.append(chat_id, &message)?;
    let chat = ctx.store.update(chat_id, |c| apply_outcome(c, &execution.outcome))?;
    if let Some(limits) = execution.outcome.limits.clone() {
        if let Err(e) = ctx.store.save_limits(limits) {
            log::warn!("could not save usage limits: {e}");
        }
    }
    log::info!("chat {chat_id} turn ended: {:?}", message.status);
    Ok(TurnResult {
        chat,
        message,
        limits: ctx.store.limits(),
    })
}

fn record_user_message(store: &ChatStore, chat_id: &str, prompt: &str) -> Result<(ChatSummary, ChatMessage), ChatRunError> {
    let existing = store.get(chat_id)?;
    if existing.title.trim().is_empty() {
        let title = title_from(prompt);
        store.update(chat_id, |c| c.title = title)?;
    }
    let message = ChatMessage {
        id: store.new_message_id(),
        role: Role::User,
        at: now(),
        text: prompt.to_owned(),
        status: MessageStatus::Complete,
        error: None,
    };
    let chat = store.append(chat_id, &message)?;
    Ok((chat, message))
}

struct Execution {
    outcome: TurnOutcome,
    killed: bool,
    failure: Option<TurnError>,
}

impl Execution {
    fn failed(error: AgentError) -> Self {
        Self {
            outcome: TurnOutcome::default(),
            killed: false,
            failure: Some(turn_error(&error)),
        }
    }
}

enum Parser {
    Claude(claude::ClaudeTurn),
    Codex(codex::CodexTurn),
}

impl Parser {
    fn for_agent(agent: AgentId) -> Self {
        match agent {
            AgentId::Claude => Self::Claude(Default::default()),
            AgentId::Codex => Self::Codex(Default::default()),
        }
    }

    fn feed(&mut self, line: &str) -> Option<Signal> {
        match self {
            Self::Claude(turn) => turn.feed(line),
            Self::Codex(turn) => turn.feed(line),
        }
    }

    fn finish(self, home: &Path) -> TurnOutcome {
        match self {
            Self::Claude(turn) => turn.finish(),
            Self::Codex(turn) => {
                let mut outcome = turn.finish();
                codex::apply_rollout(&mut outcome, home);
                outcome
            }
        }
    }
}

fn execute(ctx: &TurnContext<'_>, chat: &ChatSummary, home: &Path, prompt: &str, emit: &mut dyn FnMut(ChatEvent)) -> Execution {
    let settings = ctx.settings(chat.agent);
    let bin = match agents::require_binary(chat.agent, settings.bin_path.as_deref()) {
        Ok(bin) => bin,
        Err(e) => return Execution::failed(e),
    };
    let launch = match agents::launch(chat.agent, home, Some(&ctx.cwd)) {
        Ok(launch) => launch,
        Err(e) => return Execution::failed(e),
    };
    let model = chat.selected_model.as_deref().or(settings.model.as_deref());
    let session = chat.session_id.as_deref();
    let args = match chat.agent {
        AgentId::Claude => claude::args(model, session),
        AgentId::Codex => codex::args(model, session),
    };
    log::info!("chat {}: {} turn ({})", chat.id, chat.agent.name(), if session.is_some() { "resume" } else { "new session" });
    let child = match process::spawn_streaming(&bin, &args, &launch, prompt) {
        Ok(child) => child,
        Err(e) => return Execution::failed(e.into()),
    };
    ctx.runs.attach(&chat.id, child.kill_switch());
    stream(child, Parser::for_agent(chat.agent), home, emit)
}

fn stream(mut child: StreamingChild, mut parser: Parser, home: &Path, emit: &mut dyn FnMut(ChatEvent)) -> Execution {
    while let Some(line) = child.next_line() {
        match parser.feed(&line) {
            Some(Signal::Session { id, model }) => emit(ChatEvent::Started { session_id: id, model }),
            Some(Signal::Delta(text)) => emit(ChatEvent::Delta { text }),
            None => {}
        }
    }
    let end = child.finish();
    let outcome = parser.finish(home);
    let (killed, failure) = match end {
        Err(e) => (false, Some(turn_error(&e.into()))),
        Ok(end) if end.killed => (true, None),
        Ok(end) => (false, failure_of(&outcome, end.status.success(), &end.stderr)),
    };
    Execution { outcome, killed, failure }
}

fn failure_of(outcome: &TurnOutcome, success: bool, stderr: &str) -> Option<TurnError> {
    if let Some(error) = &outcome.error {
        return Some(classify(error));
    }
    if success && !outcome.text.trim().is_empty() {
        return None;
    }
    let reason = stderr
        .lines()
        .rev()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| "the CLI returned no answer".into());
    Some(classify(&reason))
}

fn classify(reason: &str) -> TurnError {
    let error = if agents::looks_signed_out(reason) {
        AgentError::SignedOut
    } else {
        AgentError::Failed(reason.to_owned())
    };
    turn_error(&error)
}

fn turn_error(error: &AgentError) -> TurnError {
    TurnError {
        code: error.code().to_owned(),
        message: error.to_string(),
    }
}

fn assistant_message(store: &ChatStore, execution: &Execution) -> ChatMessage {
    let status = if execution.killed {
        MessageStatus::Stopped
    } else if execution.failure.is_some() {
        MessageStatus::Error
    } else {
        MessageStatus::Complete
    };
    ChatMessage {
        id: store.new_message_id(),
        role: Role::Assistant,
        at: now(),
        text: execution.outcome.text.clone(),
        status,
        error: execution.failure.clone(),
    }
}

fn apply_outcome(chat: &mut ChatSummary, outcome: &TurnOutcome) {
    if let Some(session_id) = &outcome.session_id {
        chat.session_id = Some(session_id.clone());
    }
    if let Some(model) = &outcome.model {
        chat.model = Some(model.clone());
    }
    if let Some(context) = &outcome.context {
        chat.usage.context = Some(context.clone());
    }
    chat.usage.totals.add(outcome.totals);
    if let Some(cost) = outcome.cost_usd {
        chat.usage.cost_usd = Some(chat.usage.cost_usd.unwrap_or(0.0) + cost);
    }
}

#[cfg(all(test, windows))]
mod tests {
    use std::fs;

    use super::*;

    struct Fixture {
        dir: PathBuf,
        store: ChatStore,
        runs: ChatRuns,
    }

    impl Fixture {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("procheck-runner-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(dir.join("scratch")).unwrap();
            let store = ChatStore::open(dir.join("chats")).unwrap();
            Self { dir, store, runs: ChatRuns::default() }
        }

        fn fake_cli(&self, name: &str, stdout: &str, exit: i32) -> String {
            fs::write(self.dir.join(format!("{name}.jsonl")), stdout).unwrap();
            let script = self.dir.join(format!("{name}.cmd"));
            fs::write(&script, format!("@echo off\r\necho %* > \"%~dp0{name}.args\"\r\nmore > \"%~dp0{name}.stdin\"\r\ntype \"%~dp0{name}.jsonl\"\r\nexit /b {exit}\r\n")).unwrap();
            script.display().to_string()
        }

        fn context(&self, bin: Option<String>) -> TurnContext<'_> {
            TurnContext {
                store: &self.store,
                runs: &self.runs,
                claude: AgentSettings { bin_path: bin, model: None },
                codex: AgentSettings::default(),
                cli_dir: self.dir.join("cli"),
                cwd: self.dir.join("scratch"),
            }
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.dir);
        }
    }

    const ANSWER: &str = concat!(
        r#"{"type":"system","subtype":"init","session_id":"ses-9","model":"claude-haiku-5-5"}"#, "\r\n",
        r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}}"#, "\r\n",
        r#"{"type":"result","is_error":false,"session_id":"ses-9","result":"Hi","usage":{"input_tokens":5,"cache_read_input_tokens":10,"output_tokens":2},"modelUsage":{"claude-haiku-5-5":{"contextWindow":200000}}}"#, "\r\n",
    );

    #[test]
    fn a_turn_records_both_messages_and_the_session() {
        let fx = Fixture::new("ok");
        let bin = fx.fake_cli("claude", ANSWER, 0);
        let chat = fx.store.create(AgentId::Claude, None).unwrap();
        let mut events = Vec::new();

        let result = send(&fx.context(Some(bin)), &chat.id, "  Hello there\nsecond line ", &mut |e| events.push(e)).unwrap();

        assert_eq!(result.message.text, "Hi");
        assert_eq!(result.message.status, MessageStatus::Complete);
        assert_eq!(result.chat.title, "Hello there");
        assert_eq!(result.chat.session_id.as_deref(), Some("ses-9"));
        assert_eq!(result.chat.message_count, 2);
        assert_eq!(result.chat.usage.context.as_ref().and_then(|c| c.window), Some(200_000));
        assert!(matches!(events[0], ChatEvent::UserMessage { .. }));
        assert!(matches!(&events[1], ChatEvent::Started { session_id, .. } if session_id == "ses-9"));
        assert!(matches!(&events[2], ChatEvent::Delta { text } if text == "Hi"));
        assert_eq!(fs::read_to_string(fx.dir.join("claude.stdin")).unwrap().trim(), "Hello there\r\nsecond line");
        assert_eq!(fx.store.messages(&chat.id).unwrap().len(), 2);
        assert!(fx.runs.running().is_empty());
    }

    #[test]
    fn the_chat_model_wins_over_the_settings_model() {
        let fx = Fixture::new("model");
        let bin = fx.fake_cli("claude", ANSWER, 0);
        let mut ctx = fx.context(Some(bin));
        ctx.claude.model = Some("sonnet".into());
        let chat = fx.store.create(AgentId::Claude, Some("haiku".into())).unwrap();

        send(&ctx, &chat.id, "hi", &mut |_| {}).unwrap();
        let args = fs::read_to_string(fx.dir.join("claude.args")).unwrap();
        assert!(args.contains("--model haiku"), "{args}");

        fx.store.update(&chat.id, |c| c.selected_model = None).unwrap();
        send(&ctx, &chat.id, "again", &mut |_| {}).unwrap();
        let args = fs::read_to_string(fx.dir.join("claude.args")).unwrap();
        assert!(args.contains("--model sonnet") && args.contains("--resume ses-9"), "{args}");
    }

    #[test]
    fn a_missing_cli_is_recorded_as_an_error_reply() {
        let fx = Fixture::new("missing");
        let chat = fx.store.create(AgentId::Claude, None).unwrap();

        let result = send(&fx.context(Some("Z:\\nowhere\\claude.exe".into())), &chat.id, "hi", &mut |_| {}).unwrap();

        assert_eq!(result.message.status, MessageStatus::Error);
        assert_eq!(result.message.error.unwrap().code, "notInstalled");
        assert_eq!(result.chat.session_id, None);
    }

    #[test]
    fn a_failed_turn_keeps_the_previous_session() {
        let fx = Fixture::new("failed");
        let bin = fx.fake_cli("claude", r#"{"type":"result","is_error":true,"result":"Not logged in · Please run /login"}"#, 1);
        let chat = fx.store.create(AgentId::Claude, None).unwrap();
        fx.store.update(&chat.id, |c| c.session_id = Some("old".into())).unwrap();

        let result = send(&fx.context(Some(bin)), &chat.id, "hi", &mut |_| {}).unwrap();

        assert_eq!(result.message.error.unwrap().code, "signedOut");
        assert_eq!(result.chat.session_id.as_deref(), Some("old"));
    }

    #[test]
    fn empty_messages_and_parallel_turns_are_rejected() {
        let fx = Fixture::new("busy");
        let chat = fx.store.create(AgentId::Claude, None).unwrap();
        assert!(matches!(send(&fx.context(None), &chat.id, "  ", &mut |_| {}), Err(ChatRunError::Empty)));

        let _guard = fx.runs.claim(&chat.id).unwrap();
        assert!(matches!(send(&fx.context(None), &chat.id, "hi", &mut |_| {}), Err(ChatRunError::Busy)));
        assert!(fx.runs.stop(&chat.id));
        assert!(!fx.runs.stop("other"));
    }
}
