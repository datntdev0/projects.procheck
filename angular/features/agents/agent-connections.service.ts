import { EnvironmentProviders, Injectable, effect, inject, provideAppInitializer, signal, untracked } from '@angular/core';

import { AGENT_IDS, AgentId } from '@features/settings/app-settings.model';
import { AppSettingsService } from '@features/settings/app-settings.service';

import { AgentStatus, AgentsService, ConnectionState, connectionState } from './agents.service';

interface Connection {
  status: AgentStatus | null;
  checking: boolean;
}

type Connections = Record<AgentId, Connection>;

const INITIAL: Connections = {
  claude: { status: null, checking: true },
  codex: { status: null, checking: true },
};

function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a?.trim() || null) === (b?.trim() || null);
}

/**
 * Connection state of each CLI with the saved settings: checked once at startup, again when the
 * saved executable changes, and whenever Settings → Agent Integration checks the saved path.
 */
@Injectable({ providedIn: 'root' })
export class AgentConnectionsService {
  private readonly agents = inject(AgentsService);
  private readonly settings = inject(AppSettingsService);

  private readonly connections = signal<Connections>(INITIAL);
  private readonly checkedPaths: Partial<Record<AgentId, string | null>> = {};
  private started = false;

  constructor() {
    effect(() => {
      const paths = AGENT_IDS.map((agent) => [agent, this.settings.settings().agents[agent].binPath] as const);
      untracked(() => this.recheckChanged(paths));
    });
  }

  status(agent: AgentId): AgentStatus | null {
    return this.connections()[agent].status;
  }

  state(agent: AgentId): ConnectionState {
    const connection = this.connections()[agent];
    return connectionState(connection.status, connection.checking);
  }

  connected(agent: AgentId): boolean {
    return this.state(agent) === 'connected';
  }

  async start(): Promise<void> {
    this.started = true;
    await Promise.all(AGENT_IDS.map((agent) => this.check(agent)));
  }

  async check(agent: AgentId): Promise<void> {
    const binPath = this.settings.settings().agents[agent].binPath;
    this.checkedPaths[agent] = binPath;
    this.set(agent, { status: this.status(agent), checking: true });
    try {
      this.set(agent, { status: await this.agents.status(agent, binPath), checking: false });
    } catch (error) {
      console.error(`Could not check ${agent}`, error);
      this.set(agent, { status: null, checking: false });
    }
  }

  publish(agent: AgentId, binPath: string | null, status: AgentStatus): void {
    if (!samePath(binPath, this.settings.settings().agents[agent].binPath)) return;
    this.checkedPaths[agent] = binPath;
    this.set(agent, { status, checking: false });
  }

  private recheckChanged(paths: (readonly [AgentId, string | null])[]): void {
    if (!this.started) return;
    for (const [agent, binPath] of paths) {
      if (!samePath(binPath, this.checkedPaths[agent])) void this.check(agent);
    }
  }

  private set(agent: AgentId, connection: Connection): void {
    this.connections.update((all) => ({ ...all, [agent]: connection }));
  }
}

/** Checks every CLI in the background once settings.json is loaded; startup does not wait for it. */
export function provideAgentConnections(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const settings = inject(AppSettingsService);
    const connections = inject(AgentConnectionsService);
    void settings.load().then(() => connections.start());
  });
}
