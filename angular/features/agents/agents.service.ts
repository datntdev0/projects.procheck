import { Injectable, inject } from '@angular/core';

import type { AgentId } from '@features/settings/app-settings.model';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';

export type AuthMethod = 'subscription' | 'apiKey';

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
  /** CLI home in the application data directory (`<data dir>\cli\<cli>`): Procheck's sign-in, config and sessions. */
  home: string;
  /** The CLI Procheck downloaded is installed (`<data dir>\tools\<cli>`). */
  installed: boolean;
  /** Installed version; `null` when not installed. */
  version: string | null;
  /** Version Procheck bundles (what Download / Update installs). */
  bundledVersion: string;
  /** Installed, but not the bundled version: Update is available. */
  outdated: boolean;
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

/** Status of a CLI whose check failed: shown as not downloaded, with the reason. */
export function unavailableStatus(agent: AgentId, error: string): AgentStatus {
  return {
    agent,
    name: AGENT_NAMES[agent],
    home: '',
    installed: false,
    version: null,
    bundledVersion: '',
    outdated: false,
    auth: { signedIn: false, method: null, plan: null, account: null },
    models: [],
    error,
  };
}

/** Display names, also used before the first status arrives. */
export const AGENT_NAMES: Record<AgentId, string> = { claude: 'Claude Code', codex: 'Codex CLI' };

/** Official documentation of each CLI. */
export const AGENT_DOCS: Record<AgentId, string> = {
  claude: 'https://code.claude.com/docs/en/setup',
  codex: 'https://developers.openai.com/codex/cli',
};

/**
 * The AI CLI tools (Settings → Agent Integration). Procheck only runs the copy it downloaded into its data
 * directory (see `ToolsStore`), always with its own CLI home, apart from the user's own profile.
 */
@Injectable({ providedIn: 'root' })
export class AgentsService {
  private readonly ipc = inject(DesktopIpcService);

  status(agent: AgentId): Promise<AgentStatus> {
    return this.ipc.invoke<AgentStatus>('agents_status', { agent });
  }

  /** One short prompt; rejects with `DesktopIpcError` (`AgentErrorCode`) when the CLI does not answer. */
  test(agent: AgentId, model: string | null): Promise<AgentTestResult> {
    return this.ipc.invoke<AgentTestResult>('agents_test', { agent, model: model || null });
  }

  /** Opens the CLI's sign-in in a terminal window; resolves with the new status once it closes. */
  signIn(agent: AgentId): Promise<AgentStatus> {
    return this.ipc.invoke<AgentStatus>('agents_sign_in', { agent });
  }

  signOut(agent: AgentId): Promise<AgentStatus> {
    return this.ipc.invoke<AgentStatus>('agents_sign_out', { agent });
  }

  /** Opens the official page of the CLI in the default browser. */
  openInstallGuide(agent: AgentId): Promise<void> {
    return this.ipc.invoke<void>('plugin:opener|open_url', { url: AGENT_DOCS[agent] });
  }
}
