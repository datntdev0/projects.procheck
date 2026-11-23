pub mod database;
pub mod migrator;

use std::fmt;

/// Errors raised by the storage layer.
#[derive(Debug)]
pub enum StorageError {
    Io(std::io::Error),
    Db(rusqlite::Error),
    /// A migration file name or content is malformed.
    InvalidScript(String),
    /// A migration script failed to apply.
    Migration {
        version: String,
        seq: u32,
        name: String,
        source: rusqlite::Error,
    },
    /// The database was migrated by a newer app version.
    NewerVersion(String),
}

pub type StorageResult<T> = Result<T, StorageError>;

impl fmt::Display for StorageError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(e) => write!(f, "I/O error: {e}"),
            Self::Db(e) => write!(f, "database error: {e}"),
            Self::InvalidScript(name) => write!(f, "invalid migration script: {name}"),
            Self::Migration {
                version,
                seq,
                name,
                source,
            } => write!(f, "migration {version}_{seq}__{name} failed: {source}"),
            Self::NewerVersion(version) => write!(
                f,
                "database was created by a newer version ({version}) of the app"
            ),
        }
    }
}

impl std::error::Error for StorageError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(e) => Some(e),
            Self::Db(e) => Some(e),
            Self::Migration { source, .. } => Some(source),
            _ => None,
        }
    }
}

impl From<std::io::Error> for StorageError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}

impl From<rusqlite::Error> for StorageError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Db(e)
    }
}
