import { EnvironmentProviders, Injectable, inject, provideAppInitializer, signal } from '@angular/core';

import { AGENT_IDS, AgentId } from '@features/settings/app-settings.model';

import { DesktopIpcError } from '@shared/desktop/desktop-ipc-error';

import { AgentStatus, AgentsService, ConnectionState, connectionState, unavailableStatus } from './agents.service';

interface Connection {
  status: AgentStatus | null;
  checking: boolean;
}

type Connections = Record<AgentId, Connection>;

const INITIAL: Connections = {
  claude: { status: null, checking: true },
  codex: { status: null, checking: true },
};

/**
 * Connection state of each CLI (the copy Procheck downloaded): checked once at startup, again after a CLI is
 * downloaded, and whenever Settings → Agent integration checks, signs in or signs out.
 */
@Injectable({ providedIn: 'root' })
export class AgentConnectionsService {
  private readonly agents = inject(AgentsService);

  private readonly connections = signal<Connections>(INITIAL);

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
    await Promise.all(AGENT_IDS.map((agent) => this.check(agent)));
  }

  async check(agent: AgentId): Promise<void> {
    this.set(agent, { status: this.status(agent), checking: true });
    try {
      this.set(agent, { status: await this.agents.status(agent), checking: false });
    } catch (error) {
      console.error(`Could not check ${agent}`, error);
      // Outside the desktop app (Storybook, browser) there is no tools folder: show the CLI as not downloaded.
      this.set(agent, { status: unavailableStatus(agent, error instanceof DesktopIpcError ? error.reason : String(error)), checking: false });
    }
  }

  publish(agent: AgentId, status: AgentStatus): void {
    this.set(agent, { status, checking: false });
  }

  private set(agent: AgentId, connection: Connection): void {
    this.connections.update((all) => ({ ...all, [agent]: connection }));
  }
}

/** Checks every CLI in the background at startup; startup does not wait for it. */
export function provideAgentConnections(): EnvironmentProviders {
  return provideAppInitializer(() => {
    void inject(AgentConnectionsService).start();
  });
}
