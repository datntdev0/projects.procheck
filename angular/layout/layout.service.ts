import { Injectable, signal } from '@angular/core';

const ASSISTANT_KEY = 'pc.assistant';
const ASSISTANT_WIDTH_KEY = 'pc.assistant.width';

/** Bounds of the resizable assistant panel, in px. */
export const ASSISTANT_MIN_W = 300;
export const ASSISTANT_MAX_W = 720;

function readAssistantOpen(): boolean {
  try {
    return localStorage.getItem(ASSISTANT_KEY) !== 'closed';
  } catch {
    return true;
  }
}

function readAssistantWidth(): number | null {
  try {
    const value = Number(localStorage.getItem(ASSISTANT_WIDTH_KEY));
    return value > 0 ? clampAssistantWidth(value) : null;
  } catch {
    return null;
  }
}

export function clampAssistantWidth(width: number): number {
  return Math.round(Math.min(ASSISTANT_MAX_W, Math.max(ASSISTANT_MIN_W, width)));
}

/** UI state of the main layout chrome (assistant panel, search dialog). */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly assistantOpen = signal(readAssistantOpen());
  /** User-chosen assistant width in px; `null` keeps the responsive default (`--assistant-w`). */
  readonly assistantWidth = signal<number | null>(readAssistantWidth());
  /** True while the resize handle is dragged (disables the grid transition). */
  readonly assistantResizing = signal(false);
  readonly searchOpen = signal(false);

  toggleAssistant(open = !this.assistantOpen()): void {
    this.assistantOpen.set(open);
    try {
      localStorage.setItem(ASSISTANT_KEY, open ? 'open' : 'closed');
    } catch {
      // Storage unavailable: keep the in-memory state only.
    }
  }

  /** Sets the assistant width (clamped); `null` resets it to the default. */
  setAssistantWidth(width: number | null): void {
    const value = width === null ? null : clampAssistantWidth(width);
    this.assistantWidth.set(value);
    try {
      if (value === null) localStorage.removeItem(ASSISTANT_WIDTH_KEY);
      else localStorage.setItem(ASSISTANT_WIDTH_KEY, String(value));
    } catch {
      // Storage unavailable: keep the in-memory state only.
    }
  }

  openSearch(): void {
    this.searchOpen.set(true);
  }
}
