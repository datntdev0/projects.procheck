use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde::de::DeserializeOwned;

use super::{StorageError, StorageResult};

/// Reads and parses a JSON document; `Ok(None)` when the file does not exist.
pub fn read<T: DeserializeOwned>(path: &Path) -> StorageResult<Option<T>> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|source| StorageError::Json {
            path: path.to_owned(),
            source,
        })
}

/// Reads a JSON document, falling back to the default value when it is missing. An unparsable
/// document is renamed to `*.invalid.json` so it is kept for inspection but no longer read.
pub fn read_or_reset<T: DeserializeOwned + Default>(path: &Path) -> StorageResult<T> {
    match read(path) {
        Ok(value) => Ok(value.unwrap_or_default()),
        Err(e @ StorageError::Json { .. }) => {
            log::warn!("{e}; starting over");
            let _ = fs::rename(path, path.with_extension("invalid.json"));
            Ok(T::default())
        }
        Err(e) => Err(e),
    }
}

/// Writes `value` as pretty JSON. The document is written to a sibling temp file
/// first and then renamed over the target, so a crash never leaves a half-written file.
pub fn write<T: Serialize>(path: &Path, value: &T) -> StorageResult<()> {
    let mut json = serde_json::to_vec_pretty(value).map_err(|source| StorageError::Json {
        path: path.to_owned(),
        source,
    })?;
    json.push(b'\n');

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let temp = temp_path(path);
    {
        let mut file = fs::File::create(&temp)?;
        file.write_all(&json)?;
        file.sync_all()?;
    }
    fs::rename(&temp, path).inspect_err(|_| {
        let _ = fs::remove_file(&temp);
    })?;
    Ok(())
}

fn temp_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".tmp");
    path.with_file_name(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, PartialEq, serde::Serialize, serde::Deserialize)]
    struct Doc {
        name: String,
        count: u32,
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("procheck-json-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn missing_file_reads_as_none() {
        let dir = temp_dir("missing");
        assert!(read::<Doc>(&dir.join("nope.json")).unwrap().is_none());
    }

    #[test]
    fn write_then_read_round_trips_and_leaves_no_temp_file() {
        let dir = temp_dir("roundtrip");
        let path = dir.join("nested").join("doc.json");
        let doc = Doc { name: "a".into(), count: 2 };

        write(&path, &doc).unwrap();
        write(&path, &Doc { count: 3, ..doc }).unwrap();

        assert_eq!(read::<Doc>(&path).unwrap(), Some(Doc { name: "a".into(), count: 3 }));
        assert!(!temp_path(&path).exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn invalid_json_is_an_error() {
        let dir = temp_dir("invalid");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("doc.json");
        fs::write(&path, "{ not json").unwrap();

        assert!(matches!(read::<Doc>(&path), Err(StorageError::Json { .. })));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn invalid_json_is_set_aside_and_reset() {
        let dir = temp_dir("reset");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("doc.json");
        fs::write(&path, "{ not json").unwrap();

        assert_eq!(read_or_reset::<Vec<u32>>(&path).unwrap(), Vec::<u32>::new());
        assert!(!path.exists());
        assert!(dir.join("doc.invalid.json").exists());
        fs::remove_dir_all(dir).unwrap();
    }
}
