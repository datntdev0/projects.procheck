//! General chats: Q&A with an agent CLI that belongs to no project. History is kept in the
//! application data directory (`<data dir>\chats`) and every turn runs from the empty scratch
//! folder with the CLI's Procheck home, resuming the CLI session recorded for the chat.
mod claude;
mod codex;
pub mod runner;
pub mod store;

use serde::{Deserialize, Serialize};

use crate::features::agents::AgentId;

pub const TITLE_MAX_CHARS: usize = 52;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSummary {
    pub id: String,
    pub title: String,
    pub agent: AgentId,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub selected_model: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub message_count: u32,
    #[serde(default)]
    pub usage: ChatUsage,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageStatus {
    #[default]
    Complete,
    Stopped,
    Error,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub role: Role,
    pub at: String,
    pub text: String,
    #[serde(default)]
    pub status: MessageStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<TurnError>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnError {
    pub code: String,
    pub message: String,
}

/// Context window of the last reply: what the next prompt will carry.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ContextUsage {
    pub cache_read: u64,
    pub new_input: u64,
    pub output: u64,
    pub window: Option<u64>,
    pub at: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TokenTotals {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
}

impl TokenTotals {
    pub fn add(&mut self, other: TokenTotals) {
        self.input += other.input;
        self.output += other.output;
        self.cache_read += other.cache_read;
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChatUsage {
    pub context: Option<ContextUsage>,
    pub totals: TokenTotals,
    pub cost_usd: Option<f64>,
}

/// Account-wide usage limits of one CLI, as reported after its last reply.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageLimits {
    pub agent: AgentId,
    pub plan: Option<String>,
    pub at: String,
    pub windows: Vec<LimitWindow>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LimitWindow {
    pub kind: LimitKind,
    pub used_percent: f64,
    pub resets_at: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LimitKind {
    FiveHour,
    Weekly,
    Monthly,
    Other,
}

impl LimitKind {
    pub fn from_minutes(minutes: u64) -> Self {
        match minutes {
            300 => Self::FiveHour,
            10_080 => Self::Weekly,
            43_200 => Self::Monthly,
            _ => Self::Other,
        }
    }
}

/// Title of a new chat: the first line of the first message, shortened.
pub fn title_from(text: &str) -> String {
    let line = text.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or_default();
    let mut title: String = line.chars().take(TITLE_MAX_CHARS).collect();
    if line.chars().count() > TITLE_MAX_CHARS {
        title = title.trim_end().to_owned();
        title.push('…');
    }
    title
}

pub fn now() -> String {
    chrono::Local::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, false)
}

pub fn from_epoch_seconds(seconds: i64) -> Option<String> {
    chrono::DateTime::from_timestamp(seconds, 0)
        .map(|t| t.with_timezone(&chrono::Local).to_rfc3339_opts(chrono::SecondsFormat::Secs, false))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn titles_use_the_first_line_and_are_shortened() {
        assert_eq!(title_from("\n  Hello there  \nsecond"), "Hello there");
        let long = "a".repeat(60);
        let title = title_from(&long);
        assert_eq!(title.chars().count(), TITLE_MAX_CHARS + 1);
        assert!(title.ends_with('…'));
        assert_eq!(title_from("   "), "");
    }

    #[test]
    fn limit_kinds_follow_the_window_length() {
        assert_eq!(LimitKind::from_minutes(300), LimitKind::FiveHour);
        assert_eq!(LimitKind::from_minutes(10_080), LimitKind::Weekly);
        assert_eq!(LimitKind::from_minutes(43_200), LimitKind::Monthly);
        assert_eq!(LimitKind::from_minutes(60), LimitKind::Other);
    }
}
