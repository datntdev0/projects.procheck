//! Source kinds: what a file is (from its extension), where it is filed and how it will be read.
use std::path::Path;

use serde::{Deserialize, Serialize};

const MB: u64 = 1024 * 1024;
const GB: u64 = 1024 * MB;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SourceKind {
    Pdf,
    Doc,
    Slide,
    Md,
    Text,
    Html,
    Email,
    Transcript,
    Audio,
    Video,
    Image,
    Sheet,
    Csv,
    Json,
    Diagram,
    Design,
    Code,
    Archive,
    Other,
}

/// Group shown as a filter on the Sources page; the user can move a file to another one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SourceCategory {
    Docs,
    Meet,
    Media,
    Data,
    Design,
    Code,
    Other,
}

/// How the indexer turns the file into something the Assistant can read.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReadMode {
    Text,
    Transcribe,
    Vision,
    Data,
    Code,
    Unpack,
    /// No reader for the format: the file is kept, only its name and details are known.
    Store,
}

struct KindSpec {
    kind: SourceKind,
    extensions: &'static [&'static str],
    category: SourceCategory,
    mode: ReadMode,
    max_bytes: u64,
}

const fn spec(
    kind: SourceKind,
    extensions: &'static [&'static str],
    category: SourceCategory,
    mode: ReadMode,
    max_bytes: u64,
) -> KindSpec {
    KindSpec {
        kind,
        extensions,
        category,
        mode,
        max_bytes,
    }
}

use ReadMode as M;
use SourceCategory as C;
use SourceKind as K;

const KINDS: [KindSpec; 19] = [
    spec(K::Pdf, &["pdf"], C::Docs, M::Text, 200 * MB),
    spec(K::Doc, &["doc", "docx", "odt", "rtf"], C::Docs, M::Text, 100 * MB),
    spec(K::Slide, &["ppt", "pptx", "odp", "key"], C::Docs, M::Text, 500 * MB),
    spec(K::Md, &["md", "markdown"], C::Docs, M::Text, 50 * MB),
    spec(K::Text, &["txt", "log"], C::Docs, M::Text, 100 * MB),
    spec(K::Html, &["html", "htm", "mhtml"], C::Docs, M::Text, 50 * MB),
    spec(K::Email, &["eml", "msg"], C::Docs, M::Text, 100 * MB),
    spec(K::Transcript, &["vtt", "srt"], C::Meet, M::Text, 50 * MB),
    spec(K::Audio, &["m4a", "mp3", "wav", "ogg", "flac", "aac"], C::Meet, M::Transcribe, GB),
    spec(K::Video, &["mp4", "mov", "webm", "mkv", "avi"], C::Meet, M::Transcribe, 4 * GB),
    spec(K::Image, &["png", "jpg", "jpeg", "gif", "webp", "svg", "heic", "bmp"], C::Media, M::Vision, 50 * MB),
    spec(K::Sheet, &["xlsx", "xls", "ods", "numbers"], C::Data, M::Data, 200 * MB),
    spec(K::Csv, &["csv", "tsv"], C::Data, M::Data, 500 * MB),
    spec(K::Json, &["json", "yaml", "yml", "xml", "toml"], C::Data, M::Data, 200 * MB),
    spec(K::Diagram, &["drawio", "vsdx", "puml", "mmd", "bpmn", "excalidraw"], C::Design, M::Text, 100 * MB),
    spec(K::Design, &["fig", "sketch", "xd", "psd", "ai"], C::Design, M::Store, 2 * GB),
    spec(
        K::Code,
        &["js", "ts", "java", "cs", "py", "sql", "go", "kt", "swift", "php", "rb", "sh", "ps1", "c", "cpp", "rs"],
        C::Code,
        M::Code,
        50 * MB,
    ),
    spec(K::Archive, &["zip", "7z", "tar", "gz", "rar"], C::Code, M::Unpack, 2 * GB),
    spec(K::Other, &[], C::Other, M::Store, 2 * GB),
];

impl SourceKind {
    /// Kind from the file extension (case-insensitive); `Other` when it is unknown.
    pub fn of(path: &Path) -> Self {
        let extension = path
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        KINDS
            .iter()
            .find(|spec| spec.extensions.contains(&extension.as_str()))
            .map_or(Self::Other, |spec| spec.kind)
    }

    pub fn category(self) -> SourceCategory {
        self.spec().category
    }

    pub fn mode(self) -> ReadMode {
        self.spec().mode
    }

    pub fn max_bytes(self) -> u64 {
        self.spec().max_bytes
    }

    fn spec(self) -> &'static KindSpec {
        KINDS
            .iter()
            .find(|spec| spec.kind == self)
            .expect("every kind has a spec")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds_come_from_the_extension_ignoring_case() {
        assert_eq!(SourceKind::of(Path::new("RFP.PDF")), SourceKind::Pdf);
        assert_eq!(SourceKind::of(Path::new("notes\\Kickoff.m4a")), SourceKind::Audio);
        assert_eq!(SourceKind::of(Path::new("schema.sql")), SourceKind::Code);
        assert_eq!(SourceKind::of(Path::new("Makefile")), SourceKind::Other);
        assert_eq!(SourceKind::of(Path::new("photo.raw")), SourceKind::Other);
    }

    #[test]
    fn each_kind_has_a_category_a_read_mode_and_a_size_limit() {
        assert_eq!((SourceKind::Video.category(), SourceKind::Video.mode()), (SourceCategory::Meet, ReadMode::Transcribe));
        assert_eq!((SourceKind::Design.category(), SourceKind::Design.mode()), (SourceCategory::Design, ReadMode::Store));
        assert_eq!(SourceKind::Other.mode(), ReadMode::Store);
        assert!(SourceKind::Video.max_bytes() > SourceKind::Md.max_bytes());
    }

    #[test]
    fn no_extension_belongs_to_two_kinds() {
        let mut all: Vec<&str> = KINDS.iter().flat_map(|spec| spec.extensions.iter().copied()).collect();
        let count = all.len();
        all.sort_unstable();
        all.dedup();
        assert_eq!(all.len(), count);
    }
}
