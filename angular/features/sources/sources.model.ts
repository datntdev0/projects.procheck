import type { FileKind } from '@components/file-tile/file-tile.component';

/** Mirrors `SourceKind` in desktop/src/features/projects/sources/kinds.rs. */
export type SourceKind =
  | 'pdf'
  | 'doc'
  | 'slide'
  | 'md'
  | 'text'
  | 'html'
  | 'email'
  | 'transcript'
  | 'audio'
  | 'video'
  | 'image'
  | 'sheet'
  | 'csv'
  | 'json'
  | 'diagram'
  | 'design'
  | 'code'
  | 'archive'
  | 'other';

export const SOURCE_CATEGORIES = ['docs', 'meet', 'media', 'data', 'design', 'code', 'other'] as const;
export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];

/** How the indexer reads a kind; `store` means there is no reader and the file is only kept. */
export type ReadMode = 'text' | 'transcribe' | 'vision' | 'data' | 'code' | 'unpack' | 'store';

export type IndexState = 'queued' | 'indexing' | 'indexed' | 'stored' | 'failed';

/** Mirrors `SourceRecord` (one entry of `.procheck/sources.json`). */
export interface SourceRecord {
  id: string;
  /** Relative to `sources\`, with `/` separators. */
  path: string;
  kind: SourceKind;
  category: SourceCategory;
  bytes: number;
  sha256: string;
  modifiedAt: string;
  addedAt: string;
  missing?: boolean;
  index: { state: IndexState; error: string | null };
}

export interface SourceList {
  /** Absolute path of the project's `sources\` folder. */
  dir: string;
  sources: SourceRecord[];
}

export type SourceProblem = 'notFound' | 'notAFile' | 'tooLarge';

/** A file picked or dropped, before it is copied (`SourceCandidate` in sources.rs). */
export interface SourceCandidate {
  path: string;
  name: string;
  relative: string;
  bytes: number;
  kind: SourceKind;
  category: SourceCategory;
  mode: ReadMode;
  problem: SourceProblem | null;
  duplicateOf: string | null;
}

export interface ImportItem {
  path: string;
  relative: string;
  category: SourceCategory | null;
}

export interface ImportProgress {
  index: number;
  total: number;
  name: string;
}

/** Error codes of the `sources_*` commands (`DesktopIpcError.code`). */
export type SourceErrorCode = 'invalidSource' | 'invalidPath' | 'missing' | 'notFound' | 'notReady' | 'io' | 'storage' | 'opener';

/** What the Sources page shows in the Assistant access column. */
export type SourceAccess = IndexState | 'missing';

export interface SourceVisual {
  icon: string;
  tile: FileKind;
  mode: ReadMode;
}

export const SOURCE_KINDS: Record<SourceKind, SourceVisual> = {
  pdf: { icon: 'file-text', tile: 'pdf', mode: 'text' },
  doc: { icon: 'file-type-2', tile: 'doc', mode: 'text' },
  slide: { icon: 'presentation', tile: 'slide', mode: 'text' },
  md: { icon: 'notebook-pen', tile: 'md', mode: 'text' },
  text: { icon: 'file-type', tile: 'doc', mode: 'text' },
  html: { icon: 'globe', tile: 'doc', mode: 'text' },
  email: { icon: 'mail', tile: 'email', mode: 'text' },
  transcript: { icon: 'captions', tile: 'md', mode: 'text' },
  audio: { icon: 'audio-lines', tile: 'audio', mode: 'transcribe' },
  video: { icon: 'film', tile: 'video', mode: 'transcribe' },
  image: { icon: 'image', tile: 'image', mode: 'vision' },
  sheet: { icon: 'sheet', tile: 'sheet', mode: 'data' },
  csv: { icon: 'table', tile: 'sheet', mode: 'data' },
  json: { icon: 'braces', tile: 'mono', mode: 'data' },
  diagram: { icon: 'workflow', tile: 'design', mode: 'text' },
  design: { icon: 'pen-tool', tile: 'design', mode: 'store' },
  code: { icon: 'code-xml', tile: 'mono', mode: 'code' },
  archive: { icon: 'file-archive', tile: 'archive', mode: 'unpack' },
  other: { icon: 'file', tile: 'doc', mode: 'store' },
};

export const READ_MODE_ICONS: Record<ReadMode, string> = {
  text: 'scan-text',
  transcribe: 'captions',
  vision: 'scan-eye',
  data: 'table-2',
  code: 'code-xml',
  unpack: 'package-open',
  store: 'archive',
};

export function sourceVisual(kind: SourceKind): SourceVisual {
  return SOURCE_KINDS[kind] ?? SOURCE_KINDS.other;
}

export function sourceAccess(source: SourceRecord): SourceAccess {
  return source.missing ? 'missing' : source.index.state;
}

export function sourceName(source: Pick<SourceRecord, 'path'>): string {
  return source.path.split('/').pop() ?? source.path;
}

/** Folder inside `sources\` (`Workshop/day 1`), or empty for files at the top. */
export function sourceFolder(source: Pick<SourceRecord, 'path'>): string {
  const cut = source.path.lastIndexOf('/');
  return cut > 0 ? source.path.slice(0, cut) : '';
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}
