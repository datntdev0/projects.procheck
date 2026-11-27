//! The prompt of an agent run for one step: the phase prompt, the step instructions, the documents
//! to write with their templates, the files that already exist, the sources and the results of the
//! earlier steps. The wording around them is in `resources/prompts/generate-step.{vi,en}.md`.
use super::INITIAL_DIR;
use super::catalog::{ArtifactFile, ReviewStatus};
use crate::features::projects::DocumentLanguage;
use crate::features::projects::customization::PhaseCustomization;
use crate::features::projects::sources::catalog::SourceRecord;
use crate::features::projects::sources::kinds::{ReadMode, SourceKind};

const TEMPLATE_VI: &str = include_str!("../../../../resources/prompts/generate-step.vi.md");
const TEMPLATE_EN: &str = include_str!("../../../../resources/prompts/generate-step.en.md");

/// Wording that is filled into the prompt, per document language.
struct Words {
    none: &'static str,
    template: &'static str,
    no_template: &'static str,
    unreadable: &'static str,
    uncommitted: &'static str,
    statuses: [&'static str; 3],
}

const VI: Words = Words {
    none: "(chưa có)",
    template: "mẫu",
    no_template: "không có mẫu, hãy tự chọn cấu trúc phù hợp",
    unreadable: "không đọc được",
    uncommitted: "chưa commit",
    statuses: ["Nháp", "Đang review", "Đã duyệt"],
};

const EN: Words = Words {
    none: "(none)",
    template: "template",
    no_template: "no template: choose a fitting structure",
    unreadable: "cannot be read",
    uncommitted: "uncommitted",
    statuses: ["Draft", "In review", "Approved"],
};

/// Display name of an Initial step in the document language.
pub fn step_name(language: DocumentLanguage, step_id: &str) -> &str {
    let names: [&str; 5] = match language {
        DocumentLanguage::Vi => ["Khám phá", "Yêu cầu", "Phạm vi", "Ước tính", "Đề xuất & ký SOW"],
        DocumentLanguage::En => ["Discovery", "Requirements", "Scope", "Estimation", "Proposal & SOW sign-off"],
    };
    ["discovery", "requirements", "scope", "estimation", "signoff"]
        .iter()
        .position(|id| *id == step_id)
        .map_or(step_id, |i| names[i])
}

/// Formats the agent cannot read: audio and video need transcribing, Office files and archives
/// need unpacking, and stored-only formats have no reader at all.
pub fn is_unreadable(kind: SourceKind) -> bool {
    matches!(kind, SourceKind::Audio | SourceKind::Video | SourceKind::Doc | SourceKind::Slide | SourceKind::Sheet | SourceKind::Archive)
        || kind.mode() == ReadMode::Store
}

pub struct PromptInput<'a> {
    pub language: DocumentLanguage,
    pub project: &'a str,
    pub client: Option<&'a str>,
    pub phase: &'a PhaseCustomization,
    /// Position of the step in `phase.steps`.
    pub step: usize,
    /// Every artifact file of the project.
    pub files: &'a [ArtifactFile],
    pub sources: &'a [SourceRecord],
}

pub fn build(input: &PromptInput<'_>) -> String {
    let words = match input.language {
        DocumentLanguage::Vi => &VI,
        DocumentLanguage::En => &EN,
    };
    let template = match input.language {
        DocumentLanguage::Vi => TEMPLATE_VI,
        DocumentLanguage::En => TEMPLATE_EN,
    };
    let step = &input.phase.steps[input.step];
    let client = input.client.unwrap_or_default();
    let phase_prompt = if client.is_empty() {
        input.phase.prompt.replace(" ({client})", "")
    } else {
        input.phase.prompt.clone()
    };
    let phase_prompt = fill(&phase_prompt, &[("project", input.project), ("client", client)]);

    let artifacts = list(step.artifacts.iter().map(|artifact| {
        let template = match &artifact.template {
            Some(t) => format!("{}: .procheck/templates/{}", words.template, t.file),
            None => words.no_template.to_owned(),
        };
        format!("- {} → {INITIAL_DIR}/{}/ · {template}", artifact.name, artifact.id)
    }), words);
    let in_step = |file: &&ArtifactFile| step.artifacts.iter().any(|a| a.id == file.artifact_id);
    let existing = list(input.files.iter().filter(in_step).map(|f| existing_line(f, words)), words);
    let earlier: Vec<&str> = input.phase.steps[..input.step].iter().flat_map(|s| &s.artifacts).map(|a| a.id.as_str()).collect();
    let previous = list(
        input.files.iter().filter(|f| earlier.contains(&f.artifact_id.as_str())).map(|f| format!("- {}", f.path)),
        words,
    );
    let sources = list(input.sources.iter().filter(|s| !s.missing).map(|s| source_line(s, words)), words);

    fill(
        template,
        &[
            ("phase_prompt", &phase_prompt),
            ("step_name", step_name(input.language, &step.id)),
            ("instructions", step.instructions.trim()),
            ("artifacts", &artifacts),
            ("existing", &existing),
            ("sources", &sources),
            ("previous", &previous),
        ],
    )
}

fn existing_line(file: &ArtifactFile, words: &Words) -> String {
    let mut notes = Vec::new();
    if file.version > 0 {
        notes.push(format!("v{}", file.version));
    }
    notes.push(words.statuses[match file.status {
        ReviewStatus::Draft => 0,
        ReviewStatus::Review => 1,
        ReviewStatus::Approved => 2,
    }].to_owned());
    if file.uncommitted {
        notes.push(words.uncommitted.to_owned());
    }
    format!("- {} ({})", file.path, notes.join(", "))
}

fn source_line(source: &SourceRecord, words: &Words) -> String {
    let kind = format!("{:?}", source.kind).to_lowercase();
    if is_unreadable(source.kind) {
        format!("- sources/{} ({kind}, {})", source.path, words.unreadable)
    } else {
        format!("- sources/{} ({kind})", source.path)
    }
}

/// The lines, or the "none" word when there are none.
fn list(lines: impl Iterator<Item = String>, words: &Words) -> String {
    let lines: Vec<String> = lines.collect();
    if lines.is_empty() { words.none.to_owned() } else { lines.join("\n") }
}

/// Replaces each `{key}` of `template` with its value. The values are not scanned again, so text
/// of a customization that contains a placeholder is kept as it is.
fn fill(template: &str, values: &[(&str, &str)]) -> String {
    let mut out = String::with_capacity(template.len());
    let mut rest = template;
    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        let after = &rest[open + 1..];
        let value = after
            .find('}')
            .and_then(|close| values.iter().find(|(key, _)| *key == &after[..close]).map(|(_, value)| (close, *value)));
        match value {
            Some((close, value)) => {
                out.push_str(value);
                rest = &after[close + 1..];
            }
            None => {
                out.push('{');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}
