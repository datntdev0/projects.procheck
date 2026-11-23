import { ErrorHandler, Injectable, Provider, inject } from '@angular/core';

import { APP_VERSION } from '@shared/app/app-version';
import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';

export type UiLogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogsSummary {
  dir: string;
  bytes: number;
  files: number;
}

/** Application log and the support bundle (Settings → Diagnostics). */
@Injectable({ providedIn: 'root' })
export class DiagnosticsService {
  private readonly ipc = inject(DesktopIpcService);

  logs(): Promise<LogsSummary> {
    return this.ipc.invoke<LogsSummary>('diagnostics_logs');
  }

  /** Asks where to save the .zip and writes it; resolves the saved path, or `null` when cancelled. */
  exportBundle(title: string): Promise<string | null> {
    return this.ipc.invoke<string | null>('diagnostics_export', { appVersion: APP_VERSION, title });
  }

  /** Writes a record to the application log. Never throws (outside the desktop app it is a no-op). */
  log(level: UiLogLevel, message: string): void {
    this.ipc.invoke<void>('diagnostics_log', { level, message }).catch(() => undefined);
  }
}

/** Sends uncaught errors to the application log as well as the console. */
@Injectable()
export class LoggingErrorHandler implements ErrorHandler {
  private readonly diagnostics = inject(DiagnosticsService);

  handleError(error: unknown): void {
    console.error(error);
    const message = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}`.trim() : String(error);
    this.diagnostics.log('error', `Unhandled error: ${message}`);
  }
}

export function provideDiagnostics(): Provider {
  return { provide: ErrorHandler, useClass: LoggingErrorHandler };
}
