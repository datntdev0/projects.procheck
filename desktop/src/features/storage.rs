use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::container::AppDirectories;
use crate::infra::storage::disk;

/// Known entries of the application data directory, in display order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StorageEntry {
    Settings,
    Projects,
    Logs,
    /// Home folders of the AI CLIs (sign-in, config, sessions).
    Cli,
    Cache,
}

impl StorageEntry {
    pub const ALL: [Self; 5] = [Self::Settings, Self::Projects, Self::Logs, Self::Cli, Self::Cache];

    pub fn path(self, directories: &AppDirectories) -> PathBuf {
        match self {
            Self::Settings => directories.settings_file(),
            Self::Projects => directories.projects_file(),
            Self::Logs => directories.logs_dir(),
            Self::Cli => directories.cli_dir(),
            Self::Cache => directories.cache_dir(),
        }
    }

    pub fn is_directory(self) -> bool {
        matches!(self, Self::Logs | Self::Cli | Self::Cache)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageItem {
    pub entry: StorageEntry,
    /// Name relative to the data directory (`settings.json`, `logs\`).
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub exists: bool,
    pub bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageOverview {
    pub root: String,
    /// Size of everything under the data directory, including files Procheck does not list.
    pub total_bytes: u64,
    pub items: Vec<StorageItem>,
}

/// Lists the application data directory with the size of each known entry.
pub fn overview(directories: &AppDirectories) -> StorageOverview {
    let items = StorageEntry::ALL
        .into_iter()
        .map(|entry| {
            let path = entry.path(directories);
            let size = disk::size_of(&path);
            StorageItem {
                entry,
                name: display_name(&path, entry.is_directory()),
                path: path.display().to_string(),
                is_directory: entry.is_directory(),
                exists: size.is_some(),
                bytes: size.unwrap_or(0),
            }
        })
        .collect();

    StorageOverview {
        root: directories.root.display().to_string(),
        total_bytes: disk::size_of(&directories.root).unwrap_or(0),
        items,
    }
}

fn display_name(path: &Path, is_directory: bool) -> String {
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    if is_directory {
        format!("{name}{}", std::path::MAIN_SEPARATOR)
    } else {
        name.into_owned()
    }
}
