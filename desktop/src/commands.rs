// Tauri commands (IPC entry points) live here, one module per feature.
pub mod agents;
pub mod diagnostics;
pub mod settings;
pub mod storage;

use serde::Serialize;

/// Error returned to the UI: a stable `code` to match on and a readable `message`.
#[derive(Debug, Serialize)]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
}

impl CommandError {
    pub fn new(code: &'static str, message: impl ToString) -> Self {
        Self {
            code,
            message: message.to_string(),
        }
    }
}

pub type CommandResult<T> = Result<T, CommandError>;
