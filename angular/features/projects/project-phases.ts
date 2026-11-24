import type { Phase } from '@components/badge/phase-chip.component';

import { PHASES } from './projects.model';

export type PhaseState = 'done' | 'current' | 'locked';

/** Progress shown while project pages are not built: earlier phases done, the current one halfway. */
const CURRENT_PHASE_PROGRESS = 50;

export function phaseState(current: Phase, phase: Phase): PhaseState {
  const offset = PHASES.indexOf(phase) - PHASES.indexOf(current);
  return offset < 0 ? 'done' : offset === 0 ? 'current' : 'locked';
}

export function phaseProgress(current: Phase, phase: Phase): number {
  const state = phaseState(current, phase);
  return state === 'done' ? 100 : state === 'current' ? CURRENT_PHASE_PROGRESS : 0;
}

/** Monogram for the project avatar: the code, else the initials of the first two words. */
export function projectMonogram(name: string, code: string | null): string {
  if (code?.trim()) return code.trim().slice(0, 3).toUpperCase();
  const words = name.trim().split(/[\s—–-]+/).filter(Boolean);
  const initials = words.slice(0, 2).map((w) => w[0]);
  return (initials.join('') || '?').toUpperCase();
}
