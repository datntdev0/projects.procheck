//! File-based storage: application data is kept as plain files (JSON documents,
//! log files) under the data directory. No database.
pub mod disk;
pub mod json_file;

use std::fmt;
use std::path::PathBuf;

/// Errors raised by the storage layer.
#[derive(Debug)]
pub enum StorageError {
    Io(std::io::Error),
    /// A JSON document could not be parsed or serialized.
    Json {
        path: PathBuf,
        source: serde_json::Error,
    },
}

pub type StorageResult<T> = Result<T, StorageError>;

impl fmt::Display for StorageError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(e) => write!(f, "I/O error: {e}"),
            Self::Json { path, source } => write!(f, "invalid JSON in {}: {source}", path.display()),
        }
    }
}

impl std::error::Error for StorageError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(e) => Some(e),
            Self::Json { source, .. } => Some(source),
        }
    }
}

impl From<std::io::Error> for StorageError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}
