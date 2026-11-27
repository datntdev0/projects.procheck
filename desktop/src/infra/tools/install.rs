//! Installing a downloaded archive: unpacked into a staging folder, which then replaces the install
//! folder, so a failed install never leaves a half-written tool. `.procheck-tool.json` in the install
//! folder is the marker that says what is installed; checking it needs no process.
use std::fs::{self, File};
use std::io;
use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};

use super::Layout;
use super::manifest::{ArchiveFormat, ManifestItem, ToolId};
use super::models::{ToolError, ToolErrorCode, is_disk_full};
use crate::infra::process::{self, Launch};

pub const MARKER_FILE: &str = ".procheck-tool.json";
const STAGING_PREFIX: &str = ".staging-";
const RETIRED_PREFIX: &str = ".retired-";
/// Unpacking PortableGit takes a minute on a slow disk.
const SFX_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallMarker {
    pub id: ToolId,
    pub version: String,
    pub sha256: String,
    pub installed_at: String,
}

/// The marker of `id` when its install is intact (marker readable and the executable present).
/// Any version counts: whether it is the wanted one is for the caller to decide.
pub fn installed(layout: &Layout, id: ToolId) -> Option<InstallMarker> {
    let text = fs::read_to_string(layout.install_dir(id).join(MARKER_FILE)).ok()?;
    let marker: InstallMarker = serde_json::from_str(&text).ok()?;
    (marker.id == id && layout.executable(id).is_file()).then_some(marker)
}

/// Unpacks `archive` and puts the result in the install folder of the item.
pub fn install(layout: &Layout, item: &ManifestItem, archive: &Path) -> Result<(), ToolError> {
    let tools = layout.tools_dir();
    let staging = tools.join(format!("{STAGING_PREFIX}{}", item.id.key()));
    reset_dir(&staging).map_err(|e| ToolError::io(&e))?;
    if let Err(error) = prepare(item, archive, &staging) {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    swap(layout, item, &staging)
}

fn prepare(item: &ManifestItem, archive: &Path, staging: &Path) -> Result<(), ToolError> {
    extract(item, archive, staging)?;
    if !staging.join(&item.entry).is_file() {
        return Err(ToolError::new(ToolErrorCode::Extract, format!("{} was not found in {}", item.entry, item.file)));
    }
    let marker = InstallMarker {
        id: item.id,
        version: item.version.clone(),
        sha256: item.sha256.clone(),
        installed_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
    };
    let text = serde_json::to_string_pretty(&marker).map_err(|e| ToolError::new(ToolErrorCode::Io, e.to_string()))?;
    fs::write(staging.join(MARKER_FILE), text).map_err(|e| ToolError::io(&e))
}

/// The old install (if any) is moved aside first and deleted only once the new one is in place.
fn swap(layout: &Layout, item: &ManifestItem, staging: &Path) -> Result<(), ToolError> {
    let target = layout.install_dir(item.id);
    let retired = layout.tools_dir().join(format!("{RETIRED_PREFIX}{}", item.id.key()));
    let _ = fs::remove_dir_all(&retired);
    if target.exists() {
        fs::rename(&target, &retired).map_err(|e| ToolError::io(&e))?;
    }
    if let Err(e) = fs::rename(staging, &target) {
        if retired.exists() {
            let _ = fs::rename(&retired, &target);
        }
        return Err(ToolError::io(&e));
    }
    let _ = fs::remove_dir_all(&retired);
    Ok(())
}

fn reset_dir(path: &Path) -> io::Result<()> {
    if path.exists() {
        fs::remove_dir_all(path)?;
    }
    fs::create_dir_all(path)
}

fn extract(item: &ManifestItem, archive: &Path, target: &Path) -> Result<(), ToolError> {
    let result = match item.format {
        ArchiveFormat::Raw => copy_raw(item, archive, target),
        ArchiveFormat::Zip => extract_zip(archive, target),
        ArchiveFormat::TarGz => extract_tar(archive, target),
        ArchiveFormat::SevenZipSfx => return run_sfx(archive, target),
    };
    result.map_err(|e| {
        let code = if is_disk_full(&e) { ToolErrorCode::DiskFull } else { ToolErrorCode::Extract };
        ToolError::new(code, e.to_string())
    })
}

fn copy_raw(item: &ManifestItem, archive: &Path, target: &Path) -> io::Result<()> {
    let destination = target.join(&item.entry);
    create_parent(&destination)?;
    fs::copy(archive, destination).map(drop)
}

/// A path inside an archive that stays inside the target folder; `None` for `..`, drive letters, …
fn safe_entry(name: &Path) -> Option<PathBuf> {
    let safe = name.components().all(|c| matches!(c, Component::Normal(_)));
    (safe && name.components().next().is_some()).then(|| name.to_path_buf())
}

fn extract_tar(archive: &Path, target: &Path) -> io::Result<()> {
    let mut tar = tar::Archive::new(GzDecoder::new(File::open(archive)?));
    for entry in tar.entries()? {
        let mut entry = entry?;
        let Some(relative) = safe_entry(&entry.path()?) else { continue };
        let destination = target.join(relative);
        let kind = entry.header().entry_type();
        if kind.is_dir() {
            fs::create_dir_all(&destination)?;
        } else if kind.is_file() {
            create_parent(&destination)?;
            entry.unpack(&destination)?;
        }
    }
    Ok(())
}

fn extract_zip(archive: &Path, target: &Path) -> io::Result<()> {
    let mut zip = zip::ZipArchive::new(File::open(archive)?).map_err(io::Error::other)?;
    for index in 0..zip.len() {
        let mut file = zip.by_index(index).map_err(io::Error::other)?;
        let Some(relative) = file.enclosed_name().and_then(|name| safe_entry(&name)) else { continue };
        let destination = target.join(relative);
        if file.is_dir() {
            fs::create_dir_all(&destination)?;
        } else {
            create_parent(&destination)?;
            io::copy(&mut file, &mut File::create(&destination)?)?;
        }
    }
    Ok(())
}

/// PortableGit is a self-extracting 7-Zip archive: run it hidden, with `-y` (assume yes) and `-o`.
fn run_sfx(archive: &Path, target: &Path) -> Result<(), ToolError> {
    let out = format!("-o{}", target.display());
    let output = process::run(archive, ["-y", out.as_str()], &Launch::default(), SFX_TIMEOUT)
        .map_err(|e| ToolError::new(ToolErrorCode::Extract, e.to_string()))?;
    if output.success() {
        return Ok(());
    }
    let reason = output.stderr.lines().chain(output.stdout.lines()).rev().map(str::trim).find(|l| !l.is_empty()).unwrap_or("no output");
    Err(ToolError::new(ToolErrorCode::Extract, format!("{} exited with {}: {reason}", archive.display(), output.status)))
}

fn create_parent(path: &Path) -> io::Result<()> {
    path.parent().map_or(Ok(()), fs::create_dir_all)
}

/// Removes the install folder of `id`.
pub fn uninstall(layout: &Layout, id: ToolId) {
    if let Err(e) = fs::remove_dir_all(layout.install_dir(id)) {
        log::warn!("could not remove {}: {e}", layout.install_dir(id).display());
    }
}
