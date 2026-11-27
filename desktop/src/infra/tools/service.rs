//! `ToolsService` (Tauri state): reports what is installed and installs tools one after another,
//! sending an event for every state change and, at most five times a second, for the progress.
//! One install runs at a time; `cancel` stops the download in progress.
use std::collections::HashMap;
use std::fs;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use super::download::{Fetch, FetchStop};
use super::install;
use super::manifest::{self, ManifestItem, ToolId};
use super::models::{ToolError, ToolErrorCode, ToolItem, ToolState, ToolsEvent, ToolsSnapshot};
use super::Layout;
use crate::infra::git;

const PROGRESS_INTERVAL: Duration = Duration::from_millis(200);
const GIT_TIMEOUT: Duration = Duration::from_secs(20);

/// An install is already running.
#[derive(Debug, Clone, Copy)]
pub struct Busy;

pub struct ToolsService {
    layout: Layout,
    cancel: AtomicBool,
    gate: Mutex<()>,
    /// Why the last install of a tool failed, until the next attempt.
    failures: Mutex<HashMap<ToolId, ToolError>>,
}

impl ToolsService {
    pub fn new(layout: Layout) -> Self {
        Self {
            layout,
            cancel: AtomicBool::new(false),
            gate: Mutex::new(()),
            failures: Mutex::new(HashMap::new()),
        }
    }

    /// What is installed. Reads markers only; no process is started.
    pub fn check(&self) -> ToolsSnapshot {
        self.restore_git_config();
        self.snapshot()
    }

    /// Stops the download in progress; `false` when nothing is installing.
    pub fn cancel(&self) -> bool {
        let running = self.gate.try_lock().is_err();
        if running {
            self.cancel.store(true, Ordering::SeqCst);
        }
        running
    }

    /// Installs `ids` in order. A tool that fails is reported in its item and the next one goes on;
    /// cancelling stops the whole list.
    pub fn install(&self, ids: &[ToolId], sink: &dyn Fn(ToolsEvent)) -> Result<ToolsSnapshot, Busy> {
        let Ok(_running) = self.gate.try_lock() else {
            return Err(Busy);
        };
        self.cancel.store(false, Ordering::SeqCst);
        let mut queue: Vec<&ManifestItem> = Vec::new();
        for id in ids {
            let item = manifest::item(*id);
            if !queue.contains(&item) {
                queue.push(item);
            }
        }
        for item in &queue {
            self.failures().remove(&item.id);
            sink(ToolsEvent::Item {
                item: self.view(item, Some(ToolState::Pending)),
            });
        }
        let mut cancelled = false;
        for item in queue {
            if cancelled {
                sink(ToolsEvent::Item { item: self.view(item, None) });
                continue;
            }
            if let Err(error) = self.provide(item, sink) {
                cancelled = error.code == ToolErrorCode::Cancelled;
                self.fail(item, error, sink);
            }
        }
        Ok(self.snapshot())
    }

    fn snapshot(&self) -> ToolsSnapshot {
        ToolsSnapshot {
            items: manifest::all().iter().map(|item| self.view(item, None)).collect(),
            git_ready: install::installed(&self.layout, ToolId::Git).is_some() && self.layout.git_config().is_file(),
            data_dir: self.layout.data_dir.display().to_string(),
        }
    }

    /// The item as the UI sees it; `state` overrides the state worked out from the disk.
    fn view(&self, item: &ManifestItem, state: Option<ToolState>) -> ToolItem {
        let marker = install::installed(&self.layout, item.id);
        // Git keeps whatever version is installed; the CLIs must match the manifest.
        let ready = marker
            .as_ref()
            .is_some_and(|m| item.required() || (m.version == item.version && m.sha256 == item.sha256));
        let base = match (&marker, ready) {
            (_, true) => ToolState::Ready,
            (Some(_), false) => ToolState::Outdated,
            (None, false) => ToolState::Missing,
        };
        let downloads = self.layout.downloads_dir();
        let failure = if ready { None } else { self.failures().get(&item.id).cloned() };
        let state = state.unwrap_or(if failure.is_some() { ToolState::Error } else { base });
        ToolItem {
            id: item.id,
            version: item.version.clone(),
            installed_version: marker.map(|m| m.version),
            size: item.size,
            required: item.required(),
            state,
            received: if ready {
                item.size
            } else {
                Fetch { item, directory: &downloads, cancel: &self.cancel }.received()
            },
            error: if state == ToolState::Error { failure } else { None },
        }
    }

    fn provide(&self, item: &ManifestItem, sink: &dyn Fn(ToolsEvent)) -> Result<(), ToolError> {
        let downloads = self.layout.downloads_dir();
        let fetch = Fetch {
            item,
            directory: &downloads,
            cancel: &self.cancel,
        };
        let emit = |state| sink(ToolsEvent::Item { item: self.view(item, Some(state)) });
        emit(ToolState::Downloading);
        let mut meter = ProgressMeter::new(item, fetch.received(), sink);
        match fetch.download(&mut |received| meter.update(received)) {
            Ok(()) => {}
            Err(FetchStop::Cancelled) => return Err(ToolError::new(ToolErrorCode::Cancelled, "the download was cancelled")),
            Err(FetchStop::Failed(error)) => return Err(error),
        }
        emit(ToolState::Verifying);
        let archive = fetch.verify()?;
        emit(ToolState::Extracting);
        install::install(&self.layout, item, &archive)?;
        if item.id == ToolId::Git {
            emit(ToolState::Configuring);
            if let Err(error) = self.configure_git() {
                // Not usable without its configuration: install again (from the kept archive) next time.
                install::uninstall(&self.layout, ToolId::Git);
                return Err(error);
            }
        }
        if let Err(e) = fs::remove_file(&archive) {
            log::warn!("could not delete {}: {e}", archive.display());
        }
        log::info!("{} {} installed", item.id.key(), item.version);
        sink(ToolsEvent::Item { item: self.view(item, None) });
        Ok(())
    }

    /// Writes Procheck's git configuration and checks that git runs and reads it.
    fn configure_git(&self) -> Result<(), ToolError> {
        git::write_config(&self.layout).map_err(|e| ToolError::io(&e))?;
        let version = git::run(["--version"], GIT_TIMEOUT).map_err(|e| ToolError::new(ToolErrorCode::Io, format!("git does not start: {e}")))?;
        if !version.success() {
            return Err(ToolError::new(ToolErrorCode::Io, format!("git --version failed: {}", version.stderr.trim())));
        }
        let name = git::run(["config", "--global", "--get", "user.name"], GIT_TIMEOUT)
            .map_err(|e| ToolError::new(ToolErrorCode::Io, format!("git does not start: {e}")))?;
        if name.stdout.trim() != "Procheck" {
            return Err(ToolError::new(ToolErrorCode::Io, "git does not read the Procheck configuration"));
        }
        log::info!("git configured: {}", version.stdout.trim());
        Ok(())
    }

    /// A git that is installed but lost its configuration file gets it back.
    fn restore_git_config(&self) {
        if install::installed(&self.layout, ToolId::Git).is_some()
            && !self.layout.git_config().is_file()
            && let Err(e) = git::write_config(&self.layout)
        {
            log::warn!("could not restore the git configuration: {e}");
        }
    }

    fn fail(&self, item: &ManifestItem, error: ToolError, sink: &dyn Fn(ToolsEvent)) {
        log::warn!("installing {} failed: {error}", item.id.key());
        self.failures().insert(item.id, error);
        sink(ToolsEvent::Item {
            item: self.view(item, Some(ToolState::Error)),
        });
    }

    fn failures(&self) -> std::sync::MutexGuard<'_, HashMap<ToolId, ToolError>> {
        self.failures.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// Turns the byte counts of a download into progress events: at most one per interval, with the speed.
struct ProgressMeter<'a> {
    id: ToolId,
    total: u64,
    sink: &'a dyn Fn(ToolsEvent),
    last_at: Instant,
    last_received: u64,
}

impl<'a> ProgressMeter<'a> {
    fn new(item: &ManifestItem, received: u64, sink: &'a dyn Fn(ToolsEvent)) -> Self {
        Self {
            id: item.id,
            total: item.size,
            sink,
            last_at: Instant::now(),
            last_received: received,
        }
    }

    fn update(&mut self, received: u64) {
        let elapsed = self.last_at.elapsed();
        if elapsed < PROGRESS_INTERVAL && received < self.total {
            return;
        }
        let gained = received.saturating_sub(self.last_received);
        let speed = (gained as f64 / elapsed.as_secs_f64().max(0.001)) as u64;
        (self.sink)(ToolsEvent::Progress {
            id: self.id,
            received,
            total: self.total,
            speed,
        });
        self.last_at = Instant::now();
        self.last_received = received;
    }
}
