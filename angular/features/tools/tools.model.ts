export type ToolId = 'git' | 'claude' | 'codex';
export const TOOL_IDS: ToolId[] = ['git', 'claude', 'codex'];

/** `outdated` only for the CLIs (installed version differs from the bundled one); Git is never outdated. */
export type ToolState =
  | 'missing'
  | 'outdated'
  | 'pending'
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'configuring'
  | 'ready'
  | 'error';

/** States of an install in progress. */
export const WORKING_STATES: ToolState[] = ['pending', 'downloading', 'verifying', 'extracting', 'configuring'];

export type ToolErrorCode = 'network' | 'checksum' | 'diskFull' | 'extract' | 'io' | 'cancelled';

export interface ToolError {
  code: ToolErrorCode;
  message: string;
}

/** Mirrors `ToolItem` in desktop/src/infra/tools. */
export interface ToolItem {
  id: ToolId;
  /** Version Procheck bundles (the manifest). */
  version: string;
  installedVersion: string | null;
  /** Bytes to download. */
  size: number;
  /** Git is required; the CLIs are optional. */
  required: boolean;
  state: ToolState;
  /** Bytes downloaded so far (a resumed download continues from here). */
  received: number;
  error: ToolError | null;
}

/** Result of `tools_check` and `tools_install`. */
export interface ToolsSnapshot {
  items: ToolItem[];
  gitReady: boolean;
  /** Procheck data directory; tools live in `<dataDir>\tools\`. */
  dataDir: string;
}

export type ToolsEvent =
  | { type: 'item'; item: ToolItem }
  | { type: 'progress'; id: ToolId; received: number; total: number; speed: number };

/** Live numbers of a download. `speed` is bytes per second. */
export interface ToolProgress {
  received: number;
  total: number;
  speed: number;
}

/** What a progress bar shows for a tool being installed. */
export interface ToolProgressView {
  state: ToolState;
  /** 0–100; meaningful only while `determinate`. */
  percent: number;
  received: number;
  total: number;
  /** Bytes per second. */
  speed: number;
  /** Downloading: a real percentage. Verifying, extracting and configuring have none. */
  determinate: boolean;
}

export const isWorking = (state: ToolState): boolean => WORKING_STATES.includes(state);
