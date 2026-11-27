use std::path::PathBuf;

use crate::features::agents::AgentId;

const MANIFEST_FILE: &str = "procheck.json";
const SOURCES_DIR: &str = "sources";
const ARTIFACTS_DIR: &str = "artifacts";
const BOARD_DIR: &str = "board";
const PROCHECK_DIR: &str = ".procheck";
const CHATS_DIR: &str = "chats";
const RUNS_DIR: &str = "runs";
const CLI_DIR: &str = "cli";
const WORKTREES_DIR: &str = "worktrees";
const SETTINGS_FILE: &str = "settings.json";
const SOURCES_CATALOG_FILE: &str = "sources.json";
const INDEX_DIR: &str = "index";
const TEMPLATES_DIR: &str = "templates";
const INITIAL_PHASE_DIR: &str = "initial";
const ARTIFACTS_FILE: &str = "artifacts.json";

/// Well-known locations inside a project directory.
#[derive(Debug, Clone)]
pub struct ProjectDirectories {
    pub root: PathBuf,
}

impl ProjectDirectories {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn manifest_file(&self) -> PathBuf {
        self.root.join(MANIFEST_FILE)
    }

    pub fn sources_dir(&self) -> PathBuf {
        self.root.join(SOURCES_DIR)
    }

    pub fn artifacts_dir(&self) -> PathBuf {
        self.root.join(ARTIFACTS_DIR)
    }

    /// Artifacts of the Initial phase, one folder per customization artifact.
    pub fn initial_artifacts_dir(&self) -> PathBuf {
        self.artifacts_dir().join(INITIAL_PHASE_DIR)
    }

    /// Review status of each artifact file.
    pub fn artifacts_file(&self) -> PathBuf {
        self.procheck_dir().join(ARTIFACTS_FILE)
    }

    pub fn board_dir(&self) -> PathBuf {
        self.root.join(BOARD_DIR)
    }

    pub fn procheck_dir(&self) -> PathBuf {
        self.root.join(PROCHECK_DIR)
    }

    pub fn chats_dir(&self) -> PathBuf {
        self.procheck_dir().join(CHATS_DIR)
    }

    pub fn runs_dir(&self) -> PathBuf {
        self.procheck_dir().join(RUNS_DIR)
    }

    /// Project CLI profile (settings, MCP servers, instructions; never credentials).
    pub fn cli_profile(&self, cli: AgentId) -> PathBuf {
        self.procheck_dir().join(CLI_DIR).join(cli.key())
    }

    pub fn worktrees_dir(&self) -> PathBuf {
        self.procheck_dir().join(WORKTREES_DIR)
    }

    pub fn settings_file(&self) -> PathBuf {
        self.procheck_dir().join(SETTINGS_FILE)
    }

    /// Catalog of the files in `sources\`: kind, category, hash and index state.
    pub fn sources_catalog(&self) -> PathBuf {
        self.procheck_dir().join(SOURCES_CATALOG_FILE)
    }

    /// Text and summaries extracted from sources, one folder per source id.
    pub fn index_dir(&self) -> PathBuf {
        self.procheck_dir().join(INDEX_DIR)
    }

    /// Document templates, one folder per phase.
    pub fn templates_dir(&self) -> PathBuf {
        self.procheck_dir().join(TEMPLATES_DIR)
    }

    /// Templates of the Initial phase, one `<artifact id>.md` per artifact.
    pub fn initial_templates_dir(&self) -> PathBuf {
        self.templates_dir().join(INITIAL_PHASE_DIR)
    }

    pub fn template_file(&self, artifact_id: &str) -> PathBuf {
        self.initial_templates_dir().join(format!("{artifact_id}.md"))
    }

    /// Folders every new project starts with.
    pub fn scaffold(&self) -> [PathBuf; 6] {
        [
            self.sources_dir(),
            self.artifacts_dir(),
            self.board_dir(),
            self.chats_dir(),
            self.runs_dir(),
            self.worktrees_dir(),
        ]
    }
}
