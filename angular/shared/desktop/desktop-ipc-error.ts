/** Raised when a Tauri command fails or the IPC bridge is unavailable. */
export class DesktopIpcError extends Error {
  readonly command: string;

  constructor(command: string, cause: unknown) {
    super(`Desktop command "${command}" failed: ${describe(cause)}`, { cause });
    this.name = 'DesktopIpcError';
    this.command = command;
  }
}

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
}
