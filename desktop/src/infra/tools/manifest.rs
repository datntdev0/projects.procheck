//! `tools.manifest.json`: the version, source, hash and layout of each tool, compiled into the app.
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

const MANIFEST_TEXT: &str = include_str!("../../../tools.manifest.json");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolId {
    Git,
    Claude,
    Codex,
}

impl ToolId {
    pub fn key(self) -> &'static str {
        match self {
            Self::Git => "git",
            Self::Claude => "claude",
            Self::Codex => "codex",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum ArchiveFormat {
    /// A single executable, copied as it is.
    #[serde(rename = "raw")]
    Raw,
    #[serde(rename = "zip")]
    Zip,
    #[serde(rename = "tar.gz")]
    TarGz,
    /// A self-extracting 7-Zip archive (PortableGit): run with `-y -o<folder>`.
    #[serde(rename = "7z-sfx")]
    SevenZipSfx,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ManifestItem {
    pub id: ToolId,
    pub version: String,
    /// Name of the downloaded file.
    pub file: String,
    /// Mirrors, tried in order.
    pub urls: Vec<String>,
    pub sha256: String,
    pub size: u64,
    pub format: ArchiveFormat,
    /// The executable, relative to the install folder, with `/` separators.
    pub entry: String,
}

impl ManifestItem {
    /// Git is needed to start the app; the CLIs are optional.
    pub fn required(&self) -> bool {
        self.id == ToolId::Git
    }
}

#[derive(Debug, Deserialize)]
struct Manifest {
    items: Vec<ManifestItem>,
}

fn items() -> &'static [ManifestItem] {
    static ITEMS: OnceLock<Vec<ManifestItem>> = OnceLock::new();
    ITEMS.get_or_init(|| {
        serde_json::from_str::<Manifest>(MANIFEST_TEXT)
            .expect("the bundled tools.manifest.json is valid")
            .items
    })
}

pub fn all() -> &'static [ManifestItem] {
    items()
}

pub fn item(id: ToolId) -> &'static ManifestItem {
    items()
        .iter()
        .find(|item| item.id == id)
        .expect("tools.manifest.json lists every tool")
}
