/** Raised when a Tauri command fails or the IPC bridge is unavailable. */
export class DesktopIpcError extends Error {
  readonly command: string;
  /** Stable error code sent by the command (`CommandError.code` in desktop/src/commands.rs), if any. */
  readonly code: string | null;
  /** Readable reason without the command prefix. */
  readonly reason: string;

  constructor(command: string, cause: unknown) {
    const reason = describe(cause);
    super(`Desktop command "${command}" failed: ${reason}`, { cause });
    this.name = 'DesktopIpcError';
    this.command = command;
    this.code = codeOf(cause);
    this.reason = reason;
  }
}

interface CommandErrorPayload {
  code: string;
  message: string;
}

function isCommandError(cause: unknown): cause is CommandErrorPayload {
  return typeof cause === 'object' && cause !== null && typeof (cause as CommandErrorPayload).code === 'string';
}

function codeOf(cause: unknown): string | null {
  return isCommandError(cause) ? cause.code : null;
}

function describe(cause: unknown): string {
  if (isCommandError(cause) && typeof cause.message === 'string') return cause.message;
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
}
