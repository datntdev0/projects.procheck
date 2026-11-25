//! `codex exec --json`, one event per line: `thread.started` (session) · `item.completed`
//! (`agent_message`, whole text — Codex sends no text deltas) · `turn.completed` (usage) ·
//! `turn.failed` / `error`. The context window and the usage limits are read afterwards from the
//! last `token_count` event of the thread's rollout file in the Procheck CLI home
//! (`<home>\sessions\YYYY\MM\DD\rollout-…-<thread id>.jsonl`).
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use super::runner::{Signal, TurnOutcome};
use super::{ContextUsage, LimitKind, LimitWindow, TokenTotals, ToolAccess, UsageLimits, from_epoch_seconds, now};
use crate::features::agents::AgentId;

const SESSIONS_DIR: &str = "sessions";
const WINDOWS_SANDBOX: &str = "windows.sandbox=\"unelevated\"";

pub fn args(model: Option<&str>, session_id: Option<&str>, access: ToolAccess) -> Vec<String> {
    let sandbox = match access {
        ToolAccess::None => "read-only",
        ToolAccess::ProjectFiles => "workspace-write",
    };
    let mut args: Vec<String> = vec!["exec".into(), "--sandbox".into(), sandbox.into()];
    if cfg!(windows) {
        args.extend(["-c".into(), WINDOWS_SANDBOX.into()]);
    }
    if session_id.is_some() {
        args.push("resume".into());
    }
    args.extend(["--json".into(), "--skip-git-repo-check".into()]);
    if let Some(model) = model {
        args.extend(["-m".into(), model.into()]);
    }
    if let Some(session_id) = session_id {
        args.push(session_id.into());
    }
    args.push("-".into());
    args
}

#[derive(Debug, Default)]
pub struct CodexTurn {
    outcome: TurnOutcome,
}

impl CodexTurn {
    pub fn feed(&mut self, line: &str) -> Option<Signal> {
        let event: Value = serde_json::from_str(line.trim()).ok()?;
        match text(&event, "type")? {
            "thread.started" => {
                let id = text(&event, "thread_id")?.to_owned();
                self.outcome.session_id = Some(id.clone());
                Some(Signal::Session { id, model: None })
            }
            "item.completed" => self.on_item(&event),
            "turn.completed" => {
                self.on_usage(event.get("usage")?);
                None
            }
            "turn.failed" | "error" => {
                self.outcome.error = Some(error_message(&event));
                None
            }
            _ => None,
        }
    }

    pub fn finish(self) -> TurnOutcome {
        self.outcome
    }

    fn on_item(&mut self, event: &Value) -> Option<Signal> {
        let item = event.get("item")?;
        if text(item, "type")? != "agent_message" {
            return None;
        }
        let message = text(item, "text")?;
        let chunk = if self.outcome.text.is_empty() { message.to_owned() } else { format!("\n\n{message}") };
        self.outcome.text.push_str(&chunk);
        Some(Signal::Delta(chunk))
    }

    fn on_usage(&mut self, usage: &Value) {
        let count = |key: &str| usage.get(key).and_then(Value::as_u64).unwrap_or(0);
        let cached = count("cached_input_tokens");
        let new_input = count("input_tokens").saturating_sub(cached);
        let output = count("output_tokens");
        self.outcome.context = Some(ContextUsage {
            cache_read: cached,
            new_input,
            output,
            window: None,
            at: Some(now()),
        });
        self.outcome.totals = TokenTotals {
            input: new_input,
            output,
            cache_read: cached,
        };
    }
}

/// Fills the context window and the usage limits from the thread's rollout file, when it exists.
pub fn apply_rollout(outcome: &mut TurnOutcome, home: &Path) {
    let Some(thread_id) = outcome.session_id.clone() else {
        return;
    };
    let Some(file) = find_rollout(&home.join(SESSIONS_DIR), &thread_id) else {
        log::debug!("no rollout file for codex thread {thread_id}");
        return;
    };
    let Some(token_count) = last_token_count(&file) else {
        return;
    };
    apply_token_count(outcome, &token_count);
}

fn find_rollout(dir: &Path, thread_id: &str) -> Option<PathBuf> {
    let suffix = format!("-{thread_id}.jsonl");
    let mut newest: Option<(std::time::SystemTime, PathBuf)> = None;
    for entry in fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        let candidate = if path.is_dir() {
            find_rollout(&path, thread_id)
        } else {
            path.file_name().and_then(|n| n.to_str()).filter(|n| n.ends_with(&suffix)).map(|_| path.clone())
        };
        if let Some(candidate) = candidate {
            let modified = fs::metadata(&candidate).and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
            if newest.as_ref().is_none_or(|(time, _)| modified > *time) {
                newest = Some((modified, candidate));
            }
        }
    }
    newest.map(|(_, path)| path)
}

fn last_token_count(file: &Path) -> Option<Value> {
    let content = fs::read_to_string(file).ok()?;
    content
        .lines()
        .rev()
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .filter_map(|l| l.get("payload").cloned())
        .find(|p| text(p, "type") == Some("token_count"))
}

fn apply_token_count(outcome: &mut TurnOutcome, payload: &Value) {
    if let Some(info) = payload.get("info").filter(|i| !i.is_null()) {
        let window = info.get("model_context_window").and_then(Value::as_u64);
        if let Some(last) = info.get("last_token_usage") {
            let count = |key: &str| last.get(key).and_then(Value::as_u64).unwrap_or(0);
            let cached = count("cached_input_tokens");
            outcome.context = Some(ContextUsage {
                cache_read: cached,
                new_input: count("input_tokens").saturating_sub(cached),
                output: count("output_tokens"),
                window,
                at: Some(now()),
            });
        } else if let Some(context) = outcome.context.as_mut() {
            context.window = window;
        }
    }
    outcome.limits = payload.get("rate_limits").and_then(limits);
}

fn limits(rate_limits: &Value) -> Option<UsageLimits> {
    let windows: Vec<LimitWindow> = ["primary", "secondary"]
        .into_iter()
        .filter_map(|key| rate_limits.get(key).filter(|w| !w.is_null()))
        .filter_map(limit_window)
        .collect();
    (!windows.is_empty()).then(|| UsageLimits {
        agent: AgentId::Codex,
        plan: text(rate_limits, "plan_type").map(str::to_owned),
        at: now(),
        windows,
    })
}

fn limit_window(window: &Value) -> Option<LimitWindow> {
    let resets_at = window
        .get("resets_at")
        .and_then(Value::as_i64)
        .or_else(|| {
            let seconds = window.get("resets_in_seconds").and_then(Value::as_i64)?;
            Some(chrono::Local::now().timestamp() + seconds)
        })
        .and_then(from_epoch_seconds);
    Some(LimitWindow {
        kind: window.get("window_minutes").and_then(Value::as_u64).map_or(LimitKind::Other, LimitKind::from_minutes),
        used_percent: window.get("used_percent")?.as_f64()?.clamp(0.0, 100.0),
        resets_at,
    })
}

fn error_message(event: &Value) -> String {
    event
        .get("error")
        .and_then(|e| e.get("message").or(Some(e)))
        .or_else(|| event.get("message"))
        .map(|m| m.as_str().map(str::to_owned).unwrap_or_else(|| m.to_string()))
        .unwrap_or_else(|| "the CLI reported an error".into())
}

fn text<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    const TURN: &str = concat!(
        r#"{"type":"thread.started","thread_id":"0199-thread"}"#, "\n",
        r#"{"type":"turn.started"}"#, "\n",
        r#"{"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"thinking"}}"#, "\n",
        r#"{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"Hello"}}"#, "\n",
        r#"{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"World"}}"#, "\n",
        r#"{"type":"turn.completed","usage":{"input_tokens":1200,"cached_input_tokens":1000,"output_tokens":30}}"#, "\n",
    );

    fn run(lines: &str) -> (Vec<Signal>, TurnOutcome) {
        let mut turn = CodexTurn::default();
        let signals = lines.lines().filter_map(|l| turn.feed(l)).collect();
        (signals, turn.finish())
    }

    #[test]
    fn args_put_the_sandbox_before_resume() {
        assert_eq!(args(None, None, ToolAccess::None), read_only_args(&["--json", "--skip-git-repo-check", "-"]));
        assert_eq!(
            args(Some("gpt-6-luna"), Some("0199-thread"), ToolAccess::None),
            read_only_args(&["resume", "--json", "--skip-git-repo-check", "-m", "gpt-6-luna", "0199-thread", "-"])
        );
    }

    fn read_only_args(rest: &[&str]) -> Vec<String> {
        let sandbox: &[&str] = if cfg!(windows) { &["-c", WINDOWS_SANDBOX] } else { &[] };
        [&["exec", "--sandbox", "read-only"], sandbox, rest].concat().into_iter().map(str::to_owned).collect()
    }

    #[test]
    fn project_chats_may_write_in_the_workspace() {
        assert_eq!(args(None, None, ToolAccess::ProjectFiles)[..3], ["exec", "--sandbox", "workspace-write"]);
    }

    #[test]
    fn parses_a_turn() {
        let (signals, outcome) = run(TURN);
        assert_eq!(
            signals,
            vec![
                Signal::Session { id: "0199-thread".into(), model: None },
                Signal::Delta("Hello".into()),
                Signal::Delta("\n\nWorld".into()),
            ]
        );
        assert_eq!(outcome.text, "Hello\n\nWorld");
        assert_eq!(outcome.totals, TokenTotals { input: 200, output: 30, cache_read: 1000 });
        assert_eq!(outcome.context.unwrap().window, None);
    }

    #[test]
    fn failures_are_reported() {
        let (_, outcome) = run(r#"{"type":"turn.failed","error":{"message":"model not found"}}"#);
        assert_eq!(outcome.error.as_deref(), Some("model not found"));
    }

    #[test]
    fn rollout_fills_the_window_and_limits() {
        let home = std::env::temp_dir().join(format!("procheck-codex-rollout-{}", std::process::id()));
        let _ = fs::remove_dir_all(&home);
        let day = home.join(SESSIONS_DIR).join("2026").join("11").join("23");
        fs::create_dir_all(&day).unwrap();
        let rollout = concat!(
            r#"{"type":"session_meta","payload":{"id":"0199-thread"}}"#, "\n",
            r#"{"type":"event_msg","payload":{"type":"token_count","info":null,"rate_limits":null}}"#, "\n",
            r#"{"type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":5000,"cached_input_tokens":4000,"output_tokens":50},"model_context_window":258400},"rate_limits":{"primary":{"used_percent":12.0,"window_minutes":300,"resets_at":1795465200},"secondary":{"used_percent":41.5,"window_minutes":10080,"resets_in_seconds":3600},"plan_type":"plus"}}}"#, "\n",
            r#"{"type":"response_item","payload":{"type":"message"}}"#, "\n",
        );
        fs::write(day.join("rollout-2026-11-23T10-00-00-0199-thread.jsonl"), rollout).unwrap();
        fs::write(day.join("rollout-2026-11-23T09-00-00-other.jsonl"), "").unwrap();

        let (_, mut outcome) = run(TURN);
        apply_rollout(&mut outcome, &home);

        let context = outcome.context.unwrap();
        assert_eq!((context.cache_read, context.new_input, context.output, context.window), (4000, 1000, 50, Some(258_400)));
        let limits = outcome.limits.unwrap();
        assert_eq!(limits.plan.as_deref(), Some("plus"));
        assert_eq!(limits.windows.iter().map(|w| w.kind).collect::<Vec<_>>(), [LimitKind::FiveHour, LimitKind::Weekly]);
        assert!(limits.windows.iter().all(|w| w.resets_at.is_some()));
        fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn missing_rollout_keeps_the_stream_usage() {
        let (_, mut outcome) = run(TURN);
        apply_rollout(&mut outcome, Path::new("Z:\\nowhere"));
        assert_eq!(outcome.context.unwrap().cache_read, 1000);
        assert!(outcome.limits.is_none());
    }
}
