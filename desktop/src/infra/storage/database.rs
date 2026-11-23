use std::fs;
use std::path::Path;
use std::time::Duration;

use rusqlite::Connection;

use super::StorageResult;

/// Owns the SQLite connection.
pub struct Database {
    connection: Connection,
}

impl Database {
    /// Opens (creating if needed) the database at `path`.
    pub fn open(path: &Path) -> StorageResult<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let connection = Connection::open(path)?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.busy_timeout(Duration::from_secs(5))?;
        Ok(Self { connection })
    }

    pub fn connection_mut(&mut self) -> &mut Connection {
        &mut self.connection
    }
}
