use std::collections::HashSet;

use include_dir::{Dir, include_dir};
use rusqlite::{OptionalExtension, params};

use super::database::Database;
use super::{StorageError, StorageResult};

static MIGRATIONS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/src/infra/storage/migrations");

const HISTORY_TABLE: &str = "sys_migration_history";

/// A migration script parsed from `<semver>_<seq>__<name>.sql`.
#[derive(Debug, Clone)]
pub struct Script {
    pub version: String,
    pub seq: u32,
    pub name: String,
    pub sql: String,
    sort_key: ((u64, u64, u64), u32),
}

impl Script {
    fn parse(file_name: &str, sql: &str) -> StorageResult<Self> {
        let invalid = || StorageError::InvalidScript(file_name.to_owned());

        let stem = file_name.strip_suffix(".sql").ok_or_else(invalid)?;
        let (head, name) = stem.split_once("__").ok_or_else(invalid)?;
        let (version, seq) = head.rsplit_once('_').ok_or_else(invalid)?;
        let seq: u32 = seq.parse().map_err(|_| invalid())?;

        let mut parts = version.split('.').map(str::parse::<u64>);
        let semver = match (parts.next(), parts.next(), parts.next(), parts.next()) {
            (Some(Ok(major)), Some(Ok(minor)), Some(Ok(patch)), None) => (major, minor, patch),
            _ => return Err(invalid()),
        };
        if name.is_empty() {
            return Err(invalid());
        }

        Ok(Self {
            version: version.to_owned(),
            seq,
            name: name.to_owned(),
            sql: sql.to_owned(),
            sort_key: (semver, seq),
        })
    }
}

/// Applies the embedded migration scripts in `(version, seq)` order.
pub struct Migrator {
    scripts: Vec<Script>,
}

impl Migrator {
    pub fn new() -> Self {
        Self { scripts: Vec::new() }
    }

    fn load(&mut self) -> StorageResult<()> {
        let mut scripts = Vec::new();
        for file in MIGRATIONS.files() {
            let file_name = file
                .path()
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| StorageError::InvalidScript(file.path().display().to_string()))?;
            let sql = file
                .contents_utf8()
                .ok_or_else(|| StorageError::InvalidScript(file_name.to_owned()))?;
            scripts.push(Script::parse(file_name, sql)?);
        }
        scripts.sort_by_key(|s| s.sort_key);
        self.scripts = scripts;
        Ok(())
    }

    /// Runs every pending script inside a single transaction; rolls back on any failure.
    pub fn migrate(mut self, database: &mut Database) -> StorageResult<usize> {
        self.load()?;

        let connection = database.connection_mut();
        let applied = applied_migrations(connection)?;

        let known: HashSet<(&str, u32)> = self
            .scripts
            .iter()
            .map(|s| (s.version.as_str(), s.seq))
            .collect();
        if let Some((version, _)) = applied
            .iter()
            .find(|(version, seq)| !known.contains(&(version.as_str(), *seq)))
        {
            return Err(StorageError::NewerVersion(version.clone()));
        }

        let pending: Vec<&Script> = self
            .scripts
            .iter()
            .filter(|s| !applied.contains(&(s.version.clone(), s.seq)))
            .collect();
        if pending.is_empty() {
            return Ok(0);
        }

        let tx = connection.transaction()?;
        for script in &pending {
            let to_error = |source| StorageError::Migration {
                version: script.version.clone(),
                seq: script.seq,
                name: script.name.clone(),
                source,
            };
            tx.execute_batch(&script.sql).map_err(to_error)?;
            tx.execute(
                &format!(
                    "INSERT INTO {HISTORY_TABLE} (version, seq, name, applied_at) VALUES (?1, ?2, ?3, ?4)"
                ),
                params![
                    script.version,
                    script.seq,
                    script.name,
                    chrono::Utc::now().to_rfc3339()
                ],
            )
            .map_err(to_error)?;
        }
        tx.commit()?;
        Ok(pending.len())
    }
}

/// Returns the `(version, seq)` pairs already applied, or an empty set when history is missing.
fn applied_migrations(connection: &rusqlite::Connection) -> StorageResult<HashSet<(String, u32)>> {
    let has_history: Option<String> = connection
        .query_row(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [HISTORY_TABLE],
            |row| row.get(0),
        )
        .optional()?;
    if has_history.is_none() {
        return Ok(HashSet::new());
    }

    let mut statement = connection.prepare(&format!("SELECT version, seq FROM {HISTORY_TABLE}"))?;
    let rows = statement.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?)))?;
    rows.collect::<Result<_, _>>().map_err(Into::into)
}
