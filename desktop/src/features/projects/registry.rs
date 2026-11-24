//! `%LOCALAPPDATA%\Procheck\projects.json`: which project directories Procheck knows about.
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use serde::{Deserialize, Serialize};

use crate::features::chats::now;
use crate::infra::storage::{StorageResult, json_file};

const REGISTRY_VERSION: u32 = 1;

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct RegistryDocument {
    version: u32,
    projects: Vec<RegistryEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryEntry {
    pub id: String,
    pub dir: String,
    pub added_at: String,
    pub last_opened_at: String,
}

impl RegistryEntry {
    pub fn new(id: String, dir: &Path) -> Self {
        let at = now();
        Self {
            id,
            dir: dir.display().to_string(),
            added_at: at.clone(),
            last_opened_at: at,
        }
    }
}

pub struct ProjectRegistry {
    path: PathBuf,
    document: Mutex<RegistryDocument>,
}

impl ProjectRegistry {
    pub fn open(path: PathBuf) -> StorageResult<Self> {
        let document = json_file::read_or_reset::<RegistryDocument>(&path)?;
        Ok(Self {
            path,
            document: Mutex::new(document),
        })
    }

    /// Most recently opened first.
    pub fn entries(&self) -> Vec<RegistryEntry> {
        let mut entries = self.lock().projects.clone();
        entries.sort_by(|a, b| b.last_opened_at.cmp(&a.last_opened_at));
        entries
    }

    /// Adds a project, replacing any entry with the same id or the same directory.
    pub fn add(&self, entry: RegistryEntry) -> StorageResult<()> {
        let mut document = self.lock();
        let mut projects = document.projects.clone();
        projects.retain(|p| p.id != entry.id && !same_dir(&p.dir, &entry.dir));
        projects.push(entry);
        self.save(&mut document, projects)
    }

    pub fn touch(&self, id: &str) -> StorageResult<Option<RegistryEntry>> {
        let mut document = self.lock();
        let mut projects = document.projects.clone();
        let Some(entry) = projects.iter_mut().find(|p| p.id == id) else {
            return Ok(None);
        };
        entry.last_opened_at = now();
        let touched = entry.clone();
        self.save(&mut document, projects)?;
        Ok(Some(touched))
    }

    fn save(&self, document: &mut RegistryDocument, projects: Vec<RegistryEntry>) -> StorageResult<()> {
        let next = RegistryDocument {
            version: REGISTRY_VERSION,
            projects,
        };
        json_file::write(&self.path, &next)?;
        *document = next;
        Ok(())
    }

    fn lock(&self) -> MutexGuard<'_, RegistryDocument> {
        self.document.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

fn same_dir(a: &str, b: &str) -> bool {
    let trim = |s: &str| s.trim_end_matches(['\\', '/']).to_lowercase();
    trim(a) == trim(b)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("procheck-registry-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join("projects.json")
    }

    #[test]
    fn entries_survive_a_reload_and_replace_the_same_directory() {
        let path = temp_file("reload");
        let registry = ProjectRegistry::open(path.clone()).unwrap();
        registry.add(RegistryEntry::new("a".into(), Path::new("D:\\Projects\\one"))).unwrap();
        registry.add(RegistryEntry::new("b".into(), Path::new("D:\\projects\\ONE\\"))).unwrap();
        registry.add(RegistryEntry::new("c".into(), Path::new("D:\\Projects\\two"))).unwrap();

        let reloaded = ProjectRegistry::open(path.clone()).unwrap();
        let ids: Vec<_> = reloaded.entries().into_iter().map(|e| e.id).collect();
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&"b".to_owned()) && ids.contains(&"c".to_owned()));

        assert!(reloaded.touch("a").unwrap().is_none());
        assert!(reloaded.touch("c").unwrap().is_some());
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}
