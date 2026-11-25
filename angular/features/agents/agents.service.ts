import { Injectable, inject } from '@angular/core';

import type { AgentId } from '@features/settings/app-settings.model';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';

export type BinarySource = 'custom' | 'detected' | 'none';
export type AuthMethod = 'subscription' | 'apiKey' | 'other';

export interface AgentAuth {
  signedIn: boolean;
  method: AuthMethod | null;
  /** Subscription plan when the CLI reports it (e.g. "Max"). */
  plan: string | null;
  /** Signed-in account (e-mail) when the CLI reports it. */
  account: string | null;
}

export interface AgentModel {
  /** Value passed to the CLI's model flag. */
  id: string;
  label: string;
}

/** Mirrors `AgentStatus` in desktop/src/features/agents.rs. */
export interface AgentStatus {
  agent: AgentId;
  name: string;
  /** Executable that was checked (custom or detected). */
  binPath: string | null;
  source: BinarySource;
  /** CLI home in the application data directory (`<data dir>\cli\<cli>`): Procheck's sign-in, config and sessions. */
  home: string;
  /** The executable started and reported a version. */
  installed: boolean;
  version: string | null;
  auth: AgentAuth;
  models: AgentModel[];
  /** Why the CLI could not be checked. */
  error: string | null;
}

export interface AgentTestResult {
  durationMs: number;
  model: string | null;
  reply: string;
}

/** Error codes of the agent commands (`DesktopIpcError.code`). */
export type AgentErrorCode = 'notInstalled' | 'signedOut' | 'timeout' | 'failed';

export type ConnectionState = 'checking' | 'missing' | 'signedOut' | 'connected';

export function connectionState(status: AgentStatus | null, checking: boolean): ConnectionState {
  if (checking || !status) return 'checking';
  if (!status.installed) return 'missing';
  return status.auth.signedIn ? 'connected' : 'signedOut';
}

/** Display names, also used before the first status arrives. */
export const AGENT_NAMES: Record<AgentId, string> = { claude: 'Claude Code', codex: 'Codex CLI' };

/** How to install a CLI that is missing. */
export const AGENT_INSTALL: Record<AgentId, string> = {
  claude: 'npm install -g @anthropic-ai/claude-code',
  codex: 'npm install -g @openai/codex',
};

/** Official installation guide of each CLI. */
export const AGENT_DOCS: Record<AgentId, string> = {
  claude: 'https://code.claude.com/docs/en/setup',
  codex: 'https://developers.openai.com/codex/cli',
};

/**
 * The AI CLI tools (Settings → Agent Integration). `binPath` is the draft value from the
 * settings form; empty or `null` = find the executable on PATH. The desktop app always runs
 * the CLI with its home in the application data directory, apart from the user's own profile.
 */
@Injectable({ providedIn: 'root' })
export class AgentsService {
  private readonly ipc = inject(DesktopIpcService);

  status(agent: AgentId, binPath: string | null): Promise<AgentStatus> {
    return this.ipc.invoke<AgentStatus>('agents_status', { agent, binPath: binPath || null });
  }

  /** One short prompt; rejects with `DesktopIpcError` (`AgentErrorCode`) when the CLI does not answer. */
  test(agent: AgentId, binPath: string | null, model: string | null): Promise<AgentTestResult> {
    return this.ipc.invoke<AgentTestResult>('agents_test', { agent, binPath: binPath || null, model: model || null });
  }

  /** Opens the CLI's sign-in in a terminal window; resolves with the new status once it closes. */
  signIn(agent: AgentId, binPath: string | null): Promise<AgentStatus> {
    return this.ipc.invoke<AgentStatus>('agents_sign_in', { agent, binPath: binPath || null });
  }

  signOut(agent: AgentId, binPath: string | null): Promise<AgentStatus> {
    return this.ipc.invoke<AgentStatus>('agents_sign_out', { agent, binPath: binPath || null });
  }

  /** Native file picker for the executable; resolves `null` when cancelled. */
  pickBinary(title: string, start: string | null): Promise<string | null> {
    return this.ipc.invoke<string | null>('agents_pick_binary', { title, start });
  }

  /** Opens the official installation guide of the CLI in the default browser. */
  openInstallGuide(agent: AgentId): Promise<void> {
    return this.ipc.invoke<void>('plugin:opener|open_url', { url: AGENT_DOCS[agent] });
  }
}
