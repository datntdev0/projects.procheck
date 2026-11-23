//! App settings, persisted as `settings.json` in the application data directory.
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use log::LevelFilter;
use serde::{Deserialize, Serialize};

use crate::features::agents::AgentId;
use crate::infra::storage::{StorageError, json_file};

/// Current layout of `settings.json`.
pub const SETTINGS_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    /// Layout version of the file, for future upgrades.
    pub version: u32,
    pub general: GeneralSettings,
    pub diagnostics: DiagnosticsSettings,
    pub agents: AgentsSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            general: GeneralSettings::default(),
            diagnostics: DiagnosticsSettings::default(),
            agents: AgentsSettings::default(),
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DiagnosticsSettings {
    pub log_level: LogLevel,
    /// Log files older than this are deleted at startup.
    pub log_retention_days: u32,
}

/// Allowed range of `logRetentionDays`.
pub const LOG_RETENTION_DAYS: std::ops::RangeInclusive<u32> = 1..=365;

impl Default for DiagnosticsSettings {
    fn default() -> Self {
        Self {
            log_level: LogLevel::Info,
            log_retention_days: 14,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Error,
    Warn,
    #[default]
    Info,
    Debug,
}

impl From<LogLevel> for LevelFilter {
    fn from(level: LogLevel) -> Self {
        match level {
            LogLevel::Error => LevelFilter::Error,
            LogLevel::Warn => LevelFilter::Warn,
            LogLevel::Info => LevelFilter::Info,
            LogLevel::Debug => LevelFilter::Debug,
        }
    }
}

/// AI CLI tools (Settings → Agent Integration). Projects use these unless they override them.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AgentsSettings {
    /// CLI used when a project does not choose one.
    pub default_agent: AgentId,
    pub claude: AgentSettings,
    pub codex: AgentSettings,
}

impl AgentsSettings {
    fn get_mut(&mut self, agent: AgentId) -> &mut AgentSettings {
        match agent {
            AgentId::Claude => &mut self.claude,
            AgentId::Codex => &mut self.codex,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AgentSettings {
    /// Executable to run; `None` = find it on PATH.
    pub bin_path: Option<String>,
    /// Model passed to the CLI; `None` = the CLI's own default.
    pub model: Option<String>,
}

#[derive(Debug)]
pub enum SettingsError {
    /// `defaultProjectDir` is not an existing directory.
    FolderNotFound(String),
    /// The executable set for an agent CLI does not exist.
    BinaryNotFound(AgentId, String),
    Storage(StorageError),
}

impl SettingsError {
    /// Stable code the UI can match on.
    pub fn code(&self) -> &'static str {
        match self {
            Self::FolderNotFound(_) => "folderNotFound",
            Self::BinaryNotFound(AgentId::Claude, _) => "claudeBinaryNotFound",
            Self::BinaryNotFound(AgentId::Codex, _) => "codexBinaryNotFound",
            Self::Storage(_) => "storage",
        }
    }
}

impl fmt::Display for SettingsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::FolderNotFound(path) => write!(f, "folder not found: {path}"),
            Self::BinaryNotFound(agent, path) => write!(f, "{} executable not found: {path}", agent.name()),
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
            Ok(None) => {
                log::info!("{} not found, writing defaults", path.display());
                Self::create(&path)?
            }
            Err(e @ StorageError::Json { .. }) => {
                // Keep the broken file for the user; a failed rename is overwritten below.
                let backup = invalid_backup_path(&path);
                match fs::rename(&path, &backup) {
                    Ok(()) => log::warn!("{e}; moved to {} and reset to defaults", backup.display()),
                    Err(rename) => log::warn!("{e}; could not keep a copy ({rename}), resetting to defaults"),
                }
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
        let settings = normalize(settings).inspect_err(|e| log::warn!("settings rejected: {e}"))?;
        let mut current = self.lock();
        json_file::write(&self.path, &settings).inspect_err(|e| log::error!("could not write settings: {e}"))?;
        *current = settings.clone();
        log::info!("settings saved to {}", self.path.display());
        log::debug!("settings: {settings:?}");
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
    settings.diagnostics.log_retention_days = settings
        .diagnostics
        .log_retention_days
        .clamp(*LOG_RETENTION_DAYS.start(), *LOG_RETENTION_DAYS.end());
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

    for agent in AgentId::ALL {
        let entry = settings.agents.get_mut(agent);
        entry.bin_path = trimmed(entry.bin_path.take());
        entry.model = trimmed(entry.model.take());
        if let Some(bin) = &entry.bin_path {
            if !Path::new(bin).is_file() {
                return Err(SettingsError::BinaryNotFound(agent, bin.clone()));
            }
        }
    }
    Ok(settings)
}

/// Trims a text field; blank becomes `None`.
fn trimmed(value: Option<String>) -> Option<String> {
    value.map(|v| v.trim().to_owned()).filter(|v| !v.is_empty())
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
        assert_eq!(store.get().diagnostics, DiagnosticsSettings::default());
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

        let mut diagnostics = saved.clone();
        diagnostics.diagnostics = DiagnosticsSettings {
            log_level: LogLevel::Debug,
            log_retention_days: 0,
        };
        let stored = store.save(diagnostics).unwrap().diagnostics;
        assert_eq!((stored.log_level, stored.log_retention_days), (LogLevel::Debug, 1));

        let mut blank = store.get();
        blank.general.default_project_dir = Some("   ".into());
        assert_eq!(store.save(blank).unwrap().general.default_project_dir, None);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn agents_are_normalized_and_binaries_validated() {
        let dir = temp_dir("agents");
        let path = dir.join("settings.json");
        let bin = dir.join("claude.cmd");
        fs::write(&bin, "@echo off").unwrap();
        let store = SettingsStore::load(path.clone()).unwrap();
        assert_eq!(store.get().agents, AgentsSettings::default());

        let mut next = store.get();
        next.agents.default_agent = AgentId::Codex;
        next.agents.claude = AgentSettings {
            bin_path: Some(format!(" {} ", bin.display())),
            model: Some(" sonnet ".into()),
        };
        next.agents.codex.model = Some("   ".into());
        let saved = store.save(next).unwrap().agents;
        assert_eq!(saved.default_agent, AgentId::Codex);
        assert_eq!(saved.claude.bin_path, Some(bin.display().to_string()));
        assert_eq!(saved.claude.model.as_deref(), Some("sonnet"));
        assert_eq!(saved.codex, AgentSettings::default());
        assert_eq!(SettingsStore::load(path).unwrap().get().agents, saved);

        let mut bad = store.get();
        bad.agents.codex.bin_path = Some(dir.join("codex.exe").display().to_string());
        let error = store.save(bad).unwrap_err();
        assert_eq!(error.code(), "codexBinaryNotFound");
        assert_eq!(store.get().agents, saved);
        fs::remove_dir_all(dir).unwrap();
    }
}
