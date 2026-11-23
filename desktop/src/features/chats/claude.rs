//! `claude -p --output-format stream-json --verbose --include-partial-messages`, one JSON event per line:
//! `system/init` (session, model) · `stream_event` text deltas · `assistant` (whole message) ·
//! `rate_limit_event` (5-hour / weekly utilization, a 0–1 fraction) · `result` (usage, context window, cost).
use serde_json::Value;

use super::runner::{Signal, TurnOutcome};
use super::{ContextUsage, LimitKind, LimitWindow, TokenTotals, UsageLimits, from_epoch_seconds, now};
use crate::features::agents::AgentId;

pub fn args(model: Option<&str>, session_id: Option<&str>) -> Vec<String> {
    let mut args: Vec<String> = [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--tools",
        "",
        "--strict-mcp-config",
    ]
    .map(String::from)
    .into();
    if let Some(model) = model {
        args.extend(["--model".into(), model.into()]);
    }
    if let Some(session_id) = session_id {
        args.extend(["--resume".into(), session_id.into()]);
    }
    args
}

#[derive(Debug, Default)]
pub struct ClaudeTurn {
    outcome: TurnOutcome,
    streamed: String,
    whole: Vec<String>,
    result: Option<String>,
}

impl ClaudeTurn {
    pub fn feed(&mut self, line: &str) -> Option<Signal> {
        let event: Value = serde_json::from_str(line.trim()).ok()?;
        match text(&event, "type")? {
            "system" if text(&event, "subtype") == Some("init") => self.on_init(&event),
            "stream_event" => self.on_stream(&event),
            "assistant" => {
                self.on_assistant(&event);
                None
            }
            "rate_limit_event" => {
                self.outcome.limits = limits(&event);
                None
            }
            "result" => {
                self.on_result(&event);
                None
            }
            _ => None,
        }
    }

    pub fn finish(mut self) -> TurnOutcome {
        let whole = self.whole.join("\n\n");
        self.outcome.text = [self.result.take(), Some(whole), Some(self.streamed)]
            .into_iter()
            .flatten()
            .find(|t| !t.trim().is_empty())
            .unwrap_or_default();
        self.outcome
    }

    fn on_init(&mut self, event: &Value) -> Option<Signal> {
        let id = text(event, "session_id")?.to_owned();
        let model = text(event, "model").map(str::to_owned);
        self.outcome.session_id = Some(id.clone());
        self.outcome.model = model.clone();
        Some(Signal::Session { id, model })
    }

    fn on_stream(&mut self, event: &Value) -> Option<Signal> {
        let inner = event.get("event")?;
        if text(inner, "type")? != "content_block_delta" {
            return None;
        }
        let delta = inner.get("delta")?;
        if text(delta, "type")? != "text_delta" {
            return None;
        }
        let chunk = text(delta, "text")?.to_owned();
        self.streamed.push_str(&chunk);
        Some(Signal::Delta(chunk))
    }

    fn on_assistant(&mut self, event: &Value) {
        let blocks = event.pointer("/message/content").and_then(Value::as_array).into_iter().flatten();
        let joined: String = blocks
            .filter(|b| text(b, "type") == Some("text"))
            .filter_map(|b| text(b, "text"))
            .collect();
        if !joined.trim().is_empty() {
            self.whole.push(joined);
        }
    }

    fn on_result(&mut self, event: &Value) {
        if let Some(id) = text(event, "session_id") {
            self.outcome.session_id = Some(id.to_owned());
        }
        let reply = text(event, "result").map(str::to_owned);
        if event.get("is_error").and_then(Value::as_bool).unwrap_or(false) {
            self.outcome.error = Some(
                reply
                    .filter(|r| !r.trim().is_empty())
                    .or_else(|| text(event, "subtype").map(str::to_owned))
                    .unwrap_or_else(|| "the CLI reported an error".into()),
            );
        } else {
            self.result = reply;
        }
        let model_usage = event.get("modelUsage").and_then(Value::as_object);
        let model = model_usage.and_then(|m| m.keys().next().cloned());
        let window = model_usage
            .and_then(|m| m.values().next())
            .and_then(|m| m.get("contextWindow"))
            .and_then(Value::as_u64);
        if self.outcome.model.is_none() {
            self.outcome.model = model;
        }
        if let Some(usage) = event.get("usage") {
            self.apply_usage(usage, window);
        }
        self.outcome.cost_usd = event.get("total_cost_usd").and_then(Value::as_f64);
    }

    fn apply_usage(&mut self, usage: &Value, window: Option<u64>) {
        let count = |key: &str| usage.get(key).and_then(Value::as_u64).unwrap_or(0);
        let new_input = count("input_tokens") + count("cache_creation_input_tokens");
        let cache_read = count("cache_read_input_tokens");
        let output = count("output_tokens");
        self.outcome.context = Some(ContextUsage {
            cache_read,
            new_input,
            output,
            window,
            at: Some(now()),
        });
        self.outcome.totals = TokenTotals {
            input: new_input,
            output,
            cache_read,
        };
    }
}

fn limits(event: &Value) -> Option<UsageLimits> {
    let windows = event.pointer("/rate_limit_info/unifiedWindows")?.as_object()?;
    let windows: Vec<LimitWindow> = [("five_hour", LimitKind::FiveHour), ("seven_day", LimitKind::Weekly)]
        .into_iter()
        .filter_map(|(key, kind)| {
            let window = windows.get(key)?;
            Some(LimitWindow {
                kind,
                used_percent: (window.get("utilization")?.as_f64()? * 100.0).clamp(0.0, 100.0),
                resets_at: window.get("resetsAt").and_then(Value::as_i64).and_then(from_epoch_seconds),
            })
        })
        .collect();
    (!windows.is_empty()).then(|| UsageLimits {
        agent: AgentId::Claude,
        plan: None,
        at: now(),
        windows,
    })
}

fn text<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

#[cfg(test)]
mod tests {
    use super::*;

    const TURN: &str = concat!(
        r#"{"type":"system","subtype":"init","session_id":"ses-1","model":"claude-haiku-5-5","tools":[]}"#, "\n",
        r#"{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}}"#, "\n",
        r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"**Hello!"}}}"#, "\n",
        r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"**\n\n- a"}}}"#, "\n",
        r#"{"type":"assistant","message":{"content":[{"type":"text","text":"**Hello!**\n\n- a"}]}}"#, "\n",
        r#"{"type":"rate_limit_event","rate_limit_info":{"unifiedWindows":{"five_hour":{"utilization":0,"resetsAt":1795465200},"seven_day":{"utilization":0.28,"resetsAt":1795842000}}}}"#, "\n",
        r#"{"type":"result","subtype":"success","is_error":false,"session_id":"ses-1","result":"**Hello!**\n\n- a","total_cost_usd":0.00065,"usage":{"input_tokens":2,"cache_creation_input_tokens":3171,"cache_read_input_tokens":649,"output_tokens":22},"modelUsage":{"claude-haiku-5-5":{"contextWindow":1000000}}}"#, "\n",
    );

    fn run(lines: &str) -> (Vec<Signal>, TurnOutcome) {
        let mut turn = ClaudeTurn::default();
        let signals = lines.lines().filter_map(|l| turn.feed(l)).collect();
        (signals, turn.finish())
    }

    #[test]
    fn args_resume_the_session_and_disable_tools() {
        let first = args(None, None);
        assert!(first.windows(2).any(|w| w == ["--tools", ""]));
        assert!(!first.contains(&"--resume".to_owned()));
        let next = args(Some("haiku"), Some("ses-1"));
        assert!(next.windows(2).any(|w| w == ["--model", "haiku"]));
        assert!(next.windows(2).any(|w| w == ["--resume", "ses-1"]));
    }

    #[test]
    fn parses_a_streamed_turn() {
        let (signals, outcome) = run(TURN);
        assert_eq!(
            signals,
            vec![
                Signal::Session { id: "ses-1".into(), model: Some("claude-haiku-5-5".into()) },
                Signal::Delta("**Hello!".into()),
                Signal::Delta("**\n\n- a".into()),
            ]
        );
        assert_eq!(outcome.text, "**Hello!**\n\n- a");
        assert_eq!(outcome.session_id.as_deref(), Some("ses-1"));
        assert_eq!(outcome.error, None);
        let context = outcome.context.unwrap();
        assert_eq!((context.cache_read, context.new_input, context.output, context.window), (649, 3173, 22, Some(1_000_000)));
        assert_eq!(outcome.totals, TokenTotals { input: 3173, output: 22, cache_read: 649 });
        assert_eq!(outcome.cost_usd, Some(0.00065));
        let limits = outcome.limits.unwrap();
        assert_eq!(limits.windows.len(), 2);
        assert_eq!(limits.windows[1].kind, LimitKind::Weekly);
        assert!((limits.windows[1].used_percent - 28.0).abs() < 1e-9);
        assert!(limits.windows[1].resets_at.is_some());
    }

    #[test]
    fn errors_come_from_the_result() {
        let lines = r#"{"type":"result","subtype":"error_during_execution","is_error":true,"result":"Not logged in · Please run /login"}"#;
        let (_, outcome) = run(lines);
        assert_eq!(outcome.error.as_deref(), Some("Not logged in · Please run /login"));
        assert_eq!(outcome.text, "");
    }

    #[test]
    fn partial_text_is_kept_when_the_turn_is_cut_short() {
        let (_, outcome) = run(&TURN.lines().take(3).collect::<Vec<_>>().join("\n"));
        assert_eq!(outcome.text, "**Hello!");
        assert!(outcome.context.is_none());
    }
}
