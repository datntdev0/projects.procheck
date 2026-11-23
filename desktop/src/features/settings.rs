//! App settings, persisted as `settings.json` in the application data directory.
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::infra::storage::{StorageError, json_file};

/// Current layout of `settings.json`.
pub const SETTINGS_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    /// Layout version of the file, for future upgrades.
    pub version: u32,
    pub general: GeneralSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            general: GeneralSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GeneralSettings {
    pub theme: ThemePreference,
    pub language: Language,
    /// Starting folder of the folder picker when a project is created; `None` = the OS default.
    pub default_project_dir: Option<String>,
    pub on_startup: StartupView,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemePreference {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    #[default]
    En,
    Vi,
}

/// What Procheck shows when it launches.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StartupView {
    #[default]
    LastProject,
    AllProjects,
}

#[derive(Debug)]
pub enum SettingsError {
    /// `defaultProjectDir` is not an existing directory.
    FolderNotFound(String),
    Storage(StorageError),
}

impl SettingsError {
    /// Stable code the UI can match on.
    pub fn code(&self) -> &'static str {
        match self {
            Self::FolderNotFound(_) => "folderNotFound",
            Self::Storage(_) => "storage",
        }
    }
}

impl fmt::Display for SettingsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::FolderNotFound(path) => write!(f, "folder not found: {path}"),
            Self::Storage(e) => write!(f, "could not save settings: {e}"),
        }
    }
}

impl std::error::Error for SettingsError {}

impl From<StorageError> for SettingsError {
    fn from(e: StorageError) -> Self {
        Self::Storage(e)
    }
}

/// Owns the in-memory settings and writes every change to `settings.json`.
pub struct SettingsStore {
    path: PathBuf,
    current: Mutex<AppSettings>,
}

impl SettingsStore {
    /// Loads `settings.json`, creating it with defaults when missing. A corrupt file is renamed to
    /// `settings.invalid.json` (so nothing is lost) and replaced by defaults.
    pub fn load(path: PathBuf) -> Result<Self, StorageError> {
        let settings = match json_file::read::<AppSettings>(&path) {
            Ok(Some(settings)) => settings,
            Ok(None) => Self::create(&path)?,
            Err(StorageError::Json { .. }) => {
                // Keep the broken file for the user; a failed rename is overwritten below.
                let _ = fs::rename(&path, invalid_backup_path(&path));
                Self::create(&path)?
            }
            Err(e) => return Err(e),
        };
        Ok(Self {
            path,
            current: Mutex::new(settings),
        })
    }

    fn create(path: &Path) -> Result<AppSettings, StorageError> {
        let settings = AppSettings::default();
        json_file::write(path, &settings)?;
        Ok(settings)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn get(&self) -> AppSettings {
        self.lock().clone()
    }

    /// Validates, normalizes and persists `settings`; returns what was stored.
    pub fn save(&self, settings: AppSettings) -> Result<AppSettings, SettingsError> {
        let settings = normalize(settings)?;
        let mut current = self.lock();
        json_file::write(&self.path, &settings)?;
        *current = settings.clone();
        Ok(settings)
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, AppSettings> {
        // A panic while holding the lock cannot leave the settings half-updated.
        self.current.lock().unwrap_or_else(|e| e.into_inner())
    }
}

fn invalid_backup_path(path: &Path) -> PathBuf {
    path.with_extension("invalid.json")
}

fn normalize(mut settings: AppSettings) -> Result<AppSettings, SettingsError> {
    settings.version = SETTINGS_VERSION;
    let dir = settings
        .general
        .default_project_dir
        .take()
        .map(|d| d.trim().to_owned())
        .filter(|d| !d.is_empty());
    if let Some(dir) = &dir {
        if !Path::new(dir).is_dir() {
            return Err(SettingsError::FolderNotFound(dir.clone()));
        }
    }
    settings.general.default_project_dir = dir;
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("procheck-settings-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn missing_file_is_created_with_defaults() {
        let dir = temp_dir("create");
        let path = dir.join("settings.json");

        let store = SettingsStore::load(path.clone()).unwrap();

        assert_eq!(store.get(), AppSettings::default());
        assert!(path.is_file());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn partial_file_fills_in_defaults() {
        let dir = temp_dir("partial");
        let path = dir.join("settings.json");
        fs::write(&path, r#"{ "general": { "theme": "dark" } }"#).unwrap();

        let store = SettingsStore::load(path).unwrap();

        assert_eq!(store.get().general.theme, ThemePreference::Dark);
        assert_eq!(store.get().general.language, Language::En);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn corrupt_file_is_moved_aside() {
        let dir = temp_dir("corrupt");
        let path = dir.join("settings.json");
        fs::write(&path, "{ nope").unwrap();

        let store = SettingsStore::load(path.clone()).unwrap();

        assert_eq!(store.get(), AppSettings::default());
        assert_eq!(fs::read_to_string(dir.join("settings.invalid.json")).unwrap(), "{ nope");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn save_persists_and_validates_the_project_folder() {
        let dir = temp_dir("save");
        let path = dir.join("settings.json");
        let store = SettingsStore::load(path.clone()).unwrap();

        let mut next = store.get();
        next.general.language = Language::Vi;
        next.general.default_project_dir = Some(format!("  {}  ", dir.display()));
        let saved = store.save(next).unwrap();
        assert_eq!(saved.general.default_project_dir, Some(dir.display().to_string()));

        let reloaded = SettingsStore::load(path).unwrap();
        assert_eq!(reloaded.get(), saved);

        let mut bad = saved.clone();
        bad.general.default_project_dir = Some(dir.join("missing").display().to_string());
        assert!(matches!(store.save(bad), Err(SettingsError::FolderNotFound(_))));
        assert_eq!(store.get(), saved);

        let mut blank = saved;
        blank.general.default_project_dir = Some("   ".into());
        assert_eq!(store.save(blank).unwrap().general.default_project_dir, None);
        fs::remove_dir_all(dir).unwrap();
    }
}
