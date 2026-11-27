//! Initial-phase defaults bundled in the binary, one set per document language. They are
//! `include_str!`-ed from `desktop/resources/defaults/initial/{vi,en}`, so they need no
//! installed resource files.
use std::sync::LazyLock;

use serde::Deserialize;

use super::{ArtifactCustomization, PhaseCustomization, StepCustomization, TemplateOrigin, TemplateRef, template_file_ref};
use crate::features::projects::DocumentLanguage;

/// `customization.json` of one language.
#[derive(Debug, Deserialize)]
struct Bundled {
    prompt: String,
    steps: Vec<BundledStep>,
}

#[derive(Debug, Deserialize)]
struct BundledStep {
    id: String,
    instructions: String,
    artifacts: Vec<BundledArtifact>,
}

#[derive(Debug, Deserialize)]
struct BundledArtifact {
    id: String,
    name: String,
    /// File name inside the language folder, or `None` when the artifact has no default template.
    template: Option<String>,
}

static VI: LazyLock<Bundled> = LazyLock::new(|| parse(include_str!("../../../../resources/defaults/initial/vi/customization.json")));
static EN: LazyLock<Bundled> = LazyLock::new(|| parse(include_str!("../../../../resources/defaults/initial/en/customization.json")));

fn parse(json: &str) -> Bundled {
    serde_json::from_str(json).expect("the bundled customization.json is valid")
}

fn bundled(language: DocumentLanguage) -> &'static Bundled {
    match language {
        DocumentLanguage::Vi => &VI,
        DocumentLanguage::En => &EN,
    }
}

/// Content of a bundled template file, by the file name used in `customization.json`.
fn content(language: DocumentLanguage, file: &str) -> Option<&'static str> {
    macro_rules! files {
        ($lang:literal) => {
            match file {
                "meeting-notes.md" => include_str!(concat!("../../../../resources/defaults/initial/", $lang, "/meeting-notes.md")),
                "discovery-report.md" => include_str!(concat!("../../../../resources/defaults/initial/", $lang, "/discovery-report.md")),
                "business-requirements.md" => include_str!(concat!("../../../../resources/defaults/initial/", $lang, "/business-requirements.md")),
                "scope-definition.md" => include_str!(concat!("../../../../resources/defaults/initial/", $lang, "/scope-definition.md")),
                "effort-estimation.md" => include_str!(concat!("../../../../resources/defaults/initial/", $lang, "/effort-estimation.md")),
                _ => return None,
            }
        };
    }
    Some(match language {
        DocumentLanguage::Vi => files!("vi"),
        DocumentLanguage::En => files!("en"),
    })
}

/// The bundled Initial phase. Template refs point at `initial/<artifact id>.md`, as they do once
/// seeded into a project; `updatedAt` is empty because nothing has been written yet.
pub fn initial(language: DocumentLanguage) -> PhaseCustomization {
    let source = bundled(language);
    PhaseCustomization {
        prompt: source.prompt.clone(),
        steps: source
            .steps
            .iter()
            .map(|step| StepCustomization {
                id: step.id.clone(),
                instructions: step.instructions.clone(),
                artifacts: step
                    .artifacts
                    .iter()
                    .map(|artifact| ArtifactCustomization {
                        id: artifact.id.clone(),
                        name: artifact.name.clone(),
                        template: artifact.template.as_deref().and_then(|file| {
                            let text = content(language, file)?;
                            Some(TemplateRef {
                                file: template_file_ref(&artifact.id),
                                name: file.to_owned(),
                                size: text.len() as u64,
                                origin: TemplateOrigin::Default,
                                updated_at: String::new(),
                            })
                        }),
                    })
                    .collect(),
            })
            .collect(),
    }
}

/// File name and content of the bundled template of an artifact, if it has one.
pub fn bundled_template(language: DocumentLanguage, artifact_id: &str) -> Option<(&'static str, &'static str)> {
    let file = bundled(language)
        .steps
        .iter()
        .flat_map(|step| &step.artifacts)
        .find(|artifact| artifact.id == artifact_id)?
        .template
        .as_deref()?;
    Some((file, content(language, file)?))
}
