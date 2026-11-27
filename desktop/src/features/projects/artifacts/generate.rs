//! One generation run: a single agent session for a whole step. The CLI of the project reads the
//! sources and templates and writes the artifact files itself; Procheck prepares the repository
//! before, checks for changes outside `artifacts/initial/` after, and commits a successful run.
//! A stopped or failed run is neither committed nor undone: its files stay in the work tree and
//! are committed as the user's before the next run.
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Instant;

use serde::{Deserialize, Serialize};

use super::catalog::{self, RunningStep};
use super::history;
use super::prompt::{self, PromptInput, is_unreadable};
use super::{ArtifactsError, INITIAL_DIR, Loaded, load};
use crate::features::agents::{self, AgentId};
use crate::features::chats::runner::{self, CliRun, Signal};
use crate::features::chats::{ToolAccess, now};
use crate::features::projects::registry::ProjectRegistry;
use crate::features::projects::layout::ProjectDirectories;
use crate::features::projects::sources::reconcile;
use crate::features::settings::AgentSettings;
use crate::infra::process::KillSwitch;
use crate::infra::storage::json_file;

/// Warnings listing changed paths stop after this many; the rest is counted.
const MAX_WARNING_PATHS: usize = 8;
/// Longest shell command shown as the current activity.
const MAX_COMMAND_CHARS: usize = 160;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum GenerateEvent {
    Started { run_id: String, step_id: String },
    /// The agent works on a file: `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash` …
    Activity { tool: String, path: Option<String> },
    /// Text the agent says.
    Text { text: String },
    Finished { result: GenerateResult },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Outcome {
    Completed,
    Stopped,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RunError {
    pub code: String,
    pub message: String,
}

/// Something the user should know about a run. The UI words it (in its own language); the paths are
/// capped and `more` counts the rest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum GenerateWarning {
    /// Changes outside `artifacts/initial/`; they are left as they are.
    OutsideChanges { paths: Vec<String>, more: usize },
    /// A large source (kept out of git) changed or was removed.
    LargeSourceChanged { paths: Vec<String>, more: usize },
    /// Sources the agent cannot read.
    UnreadableSources { count: usize },
    /// The run completed without changing any file, so the step is not marked generated.
    NoChanges,
}

impl GenerateWarning {
    fn outside_changes(paths: Vec<String>) -> Self {
        let (paths, more) = capped(paths);
        Self::OutsideChanges { paths, more }
    }

    fn large_source_changed(paths: Vec<String>) -> Self {
        let (paths, more) = capped(paths);
        Self::LargeSourceChanged { paths, more }
    }
}

fn capped(mut paths: Vec<String>) -> (Vec<String>, usize) {
    let more = paths.len().saturating_sub(MAX_WARNING_PATHS);
    paths.truncate(MAX_WARNING_PATHS);
    (paths, more)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateResult {
    pub run_id: String,
    pub step_id: String,
    pub outcome: Outcome,
    /// Short hash of the commit made for a successful run.
    pub commit: Option<String>,
    /// Files below `artifacts/initial/` the run wrote or changed.
    pub changed: Vec<String>,
    /// The agent's closing message.
    pub summary: String,
    pub warnings: Vec<GenerateWarning>,
    pub error: Option<RunError>,
}

#[derive(Debug)]
struct RunSlot {
    run_id: String,
    step_id: String,
    switch: Option<Arc<KillSwitch>>,
    stop_requested: bool,
}

/// Runs in progress, one per project, so a run can be stopped from another command.
#[derive(Debug, Default)]
pub struct GenerationRuns {
    slots: Mutex<HashMap<String, RunSlot>>,
}

impl GenerationRuns {
    pub fn running(&self, project_id: &str) -> Option<RunningStep> {
        self.lock().get(project_id).map(|slot| RunningStep {
            run_id: slot.run_id.clone(),
            step_id: slot.step_id.clone(),
        })
    }

    pub fn stop(&self, project_id: &str) -> bool {
        let mut slots = self.lock();
        let Some(slot) = slots.get_mut(project_id) else {
            return false;
        };
        slot.stop_requested = true;
        if let Some(switch) = &slot.switch {
            switch.kill();
        }
        log::info!("stopping run {} of project {project_id}", slot.run_id);
        true
    }

    fn claim(&self, project_id: &str, run_id: &str, step_id: &str) -> Result<RunGuard<'_>, ArtifactsError> {
        let mut slots = self.lock();
        if slots.contains_key(project_id) {
            return Err(ArtifactsError::Busy);
        }
        slots.insert(
            project_id.to_owned(),
            RunSlot {
                run_id: run_id.to_owned(),
                step_id: step_id.to_owned(),
                switch: None,
                stop_requested: false,
            },
        );
        Ok(RunGuard {
            runs: self,
            project_id: project_id.to_owned(),
        })
    }

    fn attach(&self, project_id: &str, switch: Arc<KillSwitch>) {
        let mut slots = self.lock();
        let Some(slot) = slots.get_mut(project_id) else {
            return;
        };
        if slot.stop_requested {
            switch.kill();
        }
        slot.switch = Some(switch);
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<String, RunSlot>> {
        self.slots.lock().unwrap_or_else(|e| e.into_inner())
    }
}

struct RunGuard<'a> {
    runs: &'a GenerationRuns,
    project_id: String,
}

impl Drop for RunGuard<'_> {
    fn drop(&mut self) {
        self.runs.lock().remove(&self.project_id);
    }
}

/// What a run needs from the application.
pub struct GenerateContext<'a> {
    pub registry: &'a ProjectRegistry,
    pub runs: &'a GenerationRuns,
    pub claude: AgentSettings,
    pub codex: AgentSettings,
    /// Procheck home folders of the CLIs.
    pub cli_dir: PathBuf,
}

/// Runs the agent for `step_id`. Problems found before the run starts are errors; once it started,
/// every ending (also stopped and failed) is a `GenerateResult`.
pub fn generate(
    ctx: &GenerateContext<'_>,
    project_id: &str,
    step_id: &str,
    emit: &mut dyn FnMut(GenerateEvent),
) -> Result<GenerateResult, ArtifactsError> {
    let Loaded { dirs, manifest, settings } = load(ctx.registry, project_id)?;
    let settings = settings.ok_or(ArtifactsError::NotReady)?;
    let language = manifest.document_language.ok_or(ArtifactsError::NotSupported)?;
    let phase = settings.customization.ok_or(ArtifactsError::NotSupported)?.phases.initial;
    let step = phase.steps.iter().position(|s| s.id == step_id).ok_or(ArtifactsError::NotFound)?;

    let run_id = format!("run-{}", &uuid::Uuid::new_v4().simple().to_string()[..8]);
    let _guard = ctx.runs.claim(project_id, &run_id, step_id)?;

    history::ensure(&dirs)?;
    let agent = settings.cli;
    let agent_settings = match agent {
        AgentId::Claude => &ctx.claude,
        AgentId::Codex => &ctx.codex,
    };
    agents::require_binary(agent)?;
    let home = ctx.cli_dir.join(agent.key());
    if !agents::is_signed_in(agent, &home) {
        return Err(agents::AgentError::SignedOut.into());
    }
    let generated = catalog::generated_steps(&dirs)?;
    if phase.steps[..step].iter().any(|earlier| !generated.contains(&earlier.id)) {
        return Err(ArtifactsError::StepLocked);
    }

    emit(GenerateEvent::Started {
        run_id: run_id.clone(),
        step_id: step_id.to_owned(),
    });
    let started_at = now();
    let clock = Instant::now();
    log::info!("run {run_id}: {} generates step {step_id} of project {project_id}", agent.name());

    // Bring the repository to a clean state, so the run starts from what the user last saw.
    let sources = reconcile::reconcile(&dirs)?.sources;
    history::sync_large_sources(&dirs)?;
    history::commit_outside_artifacts(&dirs, "sync: changes outside Procheck")?;
    let pending = history::pending_artifacts(&dirs)?;
    if !pending.is_empty() {
        let partial = partial_run(&dirs).filter(|run| pending.iter().any(|e| run.changed.contains(&e.path)));
        let subject = format!("initial: changes before run {run_id}");
        history::commit_user_changes(&dirs, &subject, partial.as_ref().map(|run| run.run_id.as_str()))?;
    }

    let files = catalog::files(&dirs, Some(&phase))?;
    let prompt = prompt::build(&PromptInput {
        language,
        project: &manifest.name,
        client: manifest.client.as_deref(),
        phase: &phase,
        step,
        files: &files,
        sources: &sources,
    });
    let model = settings.model.as_deref().or(agent_settings.model.as_deref());
    let run = CliRun {
        agent,
        bin: None,
        home: &home,
        cwd: &dirs.root,
        model,
        session: None,
        access: ToolAccess::Agent { write_dir: INITIAL_DIR },
        prompt: &prompt,
        require_text: false,
    };
    let execution = runner::run_cli(&run, &mut |switch| ctx.runs.attach(project_id, switch), &mut |signal| match signal {
        Signal::Tool { name, path } => {
            let path = path.map(|p| display_path(&dirs.root, &name, &p));
            emit(GenerateEvent::Activity { tool: name, path });
        }
        Signal::Delta(text) => emit(GenerateEvent::Text { text }),
        Signal::Session { .. } => {}
    });

    // Whatever the outcome: what changed, and what changed where it must not.
    let mut warnings = Vec::new();
    let unreadable = sources.iter().filter(|s| !s.missing && is_unreadable(s.kind)).count();
    if unreadable > 0 {
        warnings.push(GenerateWarning::UnreadableSources { count: unreadable });
    }
    let outside = outside_changes(&dirs);
    if !outside.is_empty() {
        log::warn!("run {run_id}: changes outside artifacts/initial/: {}", outside.join(", "));
        warnings.push(GenerateWarning::outside_changes(outside));
    }
    let large = history::changed_large_sources(&dirs);
    if !large.is_empty() {
        warnings.push(GenerateWarning::large_source_changed(large));
    }
    let changed: Vec<String> = history::pending_artifacts(&dirs)
        .unwrap_or_else(|e| {
            log::warn!("could not list the files of run {run_id}: {e}");
            Vec::new()
        })
        .into_iter()
        .map(|e| e.path)
        .filter(|p| p.starts_with(&format!("{INITIAL_DIR}/")))
        .collect();

    let outcome = &execution.outcome;
    let model_label = outcome.model.clone().or_else(|| model.map(str::to_owned)).unwrap_or_else(|| "default".into());
    let mut result = GenerateResult {
        run_id: run_id.clone(),
        step_id: step_id.to_owned(),
        outcome: Outcome::Completed,
        commit: None,
        changed,
        summary: outcome.text.trim().to_owned(),
        warnings,
        error: None,
    };
    if execution.killed {
        result.outcome = Outcome::Stopped;
    } else if let Some(failure) = &execution.failure {
        result.outcome = Outcome::Failed;
        result.error = Some(RunError {
            code: failure.code.clone(),
            message: failure.message.clone(),
        });
    } else {
        let subject = format!("initial/{step_id}: {} · {model_label} · run {run_id}", agent.key());
        let trailers = [
            ("Procheck-Run", run_id.as_str()),
            ("Procheck-Step", step_id),
            ("Procheck-By", "agent"),
            ("Procheck-Cli", agent.key()),
            ("Procheck-Model", model_label.as_str()),
        ];
        match history::commit(&dirs, &[INITIAL_DIR], &subject, &trailers) {
            Ok(Some(hash)) => result.commit = Some(history::short(&hash).to_owned()),
            Ok(None) => result.warnings.push(GenerateWarning::NoChanges),
            Err(e) => {
                result.outcome = Outcome::Failed;
                result.error = Some(RunError {
                    code: "git".into(),
                    message: e.to_string(),
                });
            }
        }
    }
    log::info!("run {run_id} ended: {:?}", result.outcome);

    write_log(&dirs.runs_dir(), &RunLog {
        run_id: &run_id,
        step_id,
        cli: agent.key(),
        model: &model_label,
        session_id: outcome.session_id.as_deref(),
        started_at: &started_at,
        finished_at: &now(),
        duration_ms: u64::try_from(clock.elapsed().as_millis()).unwrap_or(u64::MAX),
        outcome: result.outcome,
        commit: result.commit.as_deref(),
        changed: &result.changed,
        summary: &result.summary,
        input_tokens: outcome.totals.input,
        output_tokens: outcome.totals.output,
        cache_read_tokens: outcome.totals.cache_read,
        cost_usd: outcome.cost_usd,
        warnings: &result.warnings,
        error: result.error.as_ref(),
    });
    emit(GenerateEvent::Finished { result: result.clone() });
    Ok(result)
}

/// Paths changed outside `artifacts/initial/`; they are left as they are.
fn outside_changes(dirs: &ProjectDirectories) -> Vec<String> {
    match history::changes_outside_initial(dirs) {
        Ok(entries) => entries.into_iter().map(|e| e.path).collect(),
        Err(e) => {
            log::warn!("could not check for changes outside the artifacts: {e}");
            Vec::new()
        }
    }
}

/// A path the CLI reports, relative to the project with forward slashes; commands are only shortened.
fn display_path(root: &Path, tool: &str, path: &str) -> String {
    if tool == "Bash" {
        return path.chars().take(MAX_COMMAND_CHARS).collect();
    }
    let path = path.replace('\\', "/");
    let root = root.display().to_string().replace('\\', "/");
    let root = root.trim_end_matches('/');
    match path.get(..root.len()) {
        Some(head) if head.eq_ignore_ascii_case(root) && path[root.len()..].starts_with('/') => path[root.len() + 1..].to_owned(),
        _ => path,
    }
}

/// What a past run log says, to recognise leftovers of a stopped or failed run.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PastRun {
    run_id: String,
    started_at: String,
    outcome: Outcome,
    #[serde(default)]
    commit: Option<String>,
    #[serde(default)]
    changed: Vec<String>,
}

/// The latest run, when it did not complete: its files are in the work tree, uncommitted.
fn partial_run(dirs: &ProjectDirectories) -> Option<PastRun> {
    let latest = fs::read_dir(dirs.runs_dir())
        .ok()?
        .flatten()
        .filter_map(|entry| json_file::read::<PastRun>(&entry.path()).ok().flatten())
        .max_by(|a, b| a.started_at.cmp(&b.started_at))?;
    (latest.outcome != Outcome::Completed && latest.commit.is_none()).then_some(latest)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunLog<'a> {
    run_id: &'a str,
    step_id: &'a str,
    cli: &'a str,
    model: &'a str,
    session_id: Option<&'a str>,
    started_at: &'a str,
    finished_at: &'a str,
    duration_ms: u64,
    outcome: Outcome,
    commit: Option<&'a str>,
    changed: &'a [String],
    summary: &'a str,
    input_tokens: u64,
    output_tokens: u64,
    cache_read_tokens: u64,
    cost_usd: Option<f64>,
    warnings: &'a [GenerateWarning],
    error: Option<&'a RunError>,
}

/// `.procheck\runs\<run id>.json`; failing to write it does not fail the run.
fn write_log(runs_dir: &Path, log: &RunLog<'_>) {
    if let Err(e) = json_file::write(&runs_dir.join(format!("{}.json", log.run_id)), log) {
        log::warn!("could not write the log of run {}: {e}", log.run_id);
    }
}
