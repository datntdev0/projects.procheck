//! What the UI sees of the tools: their state, progress and errors.
use std::io;

use serde::Serialize;

use super::manifest::ToolId;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ToolState {
    Missing,
    /// Installed, but not the version of the manifest (Claude and Codex only).
    Outdated,
    Pending,
    Downloading,
    Verifying,
    Extracting,
    Configuring,
    Ready,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ToolErrorCode {
    Network,
    Checksum,
    DiskFull,
    Extract,
    Io,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ToolError {
    pub code: ToolErrorCode,
    pub message: String,
}

impl ToolError {
    pub fn new(code: ToolErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn io(error: &io::Error) -> Self {
        let code = if is_disk_full(error) { ToolErrorCode::DiskFull } else { ToolErrorCode::Io };
        Self::new(code, error.to_string())
    }
}

impl std::fmt::Display for ToolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}: {}", self.code, self.message)
    }
}

impl std::error::Error for ToolError {}

const ERROR_HANDLE_DISK_FULL: i32 = 39;
const ERROR_DISK_FULL: i32 = 112;

pub fn is_disk_full(error: &io::Error) -> bool {
    error.kind() == io::ErrorKind::StorageFull || matches!(error.raw_os_error(), Some(ERROR_HANDLE_DISK_FULL | ERROR_DISK_FULL))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolItem {
    pub id: ToolId,
    /// Version of the manifest.
    pub version: String,
    pub installed_version: Option<String>,
    /// Bytes to download.
    pub size: u64,
    pub required: bool,
    pub state: ToolState,
    /// Bytes downloaded so far; a download that was interrupted resumes from here.
    pub received: u64,
    pub error: Option<ToolError>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolsSnapshot {
    pub items: Vec<ToolItem>,
    /// Git is installed and configured: the app can start.
    pub git_ready: bool,
    pub data_dir: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ToolsEvent {
    Item { item: ToolItem },
    /// At most five per second.
    Progress { id: ToolId, received: u64, total: u64, speed: u64 },
}
