import type { AgentId } from '@features/settings/app-settings.model';

/** Mirrors `ChatSummary` in desktop/src/features/chats.rs. */
export interface ChatSummary {
  id: string;
  title: string;
  agent: AgentId;
  projectId: string | null;
  model: string | null;
  selectedModel: string | null;
  sessionId: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  usage: ChatUsage;
}

/** Where a chat works: `null` for a general chat, else the id of its project. */
export type ChatScope = string | null;

/** Filter of the chat history: every chat, or the chats of one scope. */
export type ScopeFilter = { kind: 'all' } | { kind: 'scope'; scope: ChatScope };

export function inScope(chat: ChatSummary, scope: ChatScope): boolean {
  return chat.projectId === scope;
}

export type ChatRole = 'user' | 'assistant';
export type MessageStatus = 'complete' | 'stopped' | 'error';

export interface TurnError {
  code: string;
  message: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  at: string;
  text: string;
  status: MessageStatus;
  error?: TurnError;
}

export interface ContextUsage {
  cacheRead: number;
  newInput: number;
  output: number;
  window: number | null;
  at: string | null;
}

export interface TokenTotals {
  input: number;
  output: number;
  cacheRead: number;
}

export interface ChatUsage {
  context: ContextUsage | null;
  totals: TokenTotals;
  costUsd: number | null;
}

export type LimitKind = 'fiveHour' | 'weekly' | 'monthly' | 'other';

export interface LimitWindow {
  kind: LimitKind;
  usedPercent: number;
  resetsAt: string | null;
}

export interface UsageLimits {
  agent: AgentId;
  plan: string | null;
  at: string;
  windows: LimitWindow[];
}

export interface ChatsOverview {
  chatsDir: string;
  workingDir: string;
  cliDir: string;
  chats: ChatSummary[];
  limits: UsageLimits[];
  running: string[];
}

export type ChatEvent =
  | { type: 'userMessage'; chat: ChatSummary; message: ChatMessage }
  | { type: 'started'; sessionId: string; model: string | null }
  | { type: 'delta'; text: string };

export interface TurnResult {
  chat: ChatSummary;
  message: ChatMessage;
  limits: UsageLimits[];
}

/** Answer being streamed for one chat. */
export interface LiveTurn {
  text: string;
  model: string | null;
}

export type ChatGroup = 'pinned' | 'today' | 'yesterday' | 'week' | 'older';
export const CHAT_GROUPS: ChatGroup[] = ['pinned', 'today', 'yesterday', 'week', 'older'];

export function contextUsed(context: ContextUsage | null): number {
  return context ? context.cacheRead + context.newInput + context.output : 0;
}

export function contextPercent(context: ContextUsage | null): number | null {
  if (!context?.window) return null;
  return Math.min(100, (contextUsed(context) / context.window) * 100);
}

export function usageTone(percent: number): '' | 'warn' | 'danger' {
  if (percent >= 95) return 'danger';
  if (percent >= 80) return 'warn';
  return '';
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function daysAgo(iso: string, now = new Date()): number {
  return Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
}

export function groupOf(chat: ChatSummary, now = new Date()): ChatGroup {
  if (chat.pinned) return 'pinned';
  const days = daysAgo(chat.updatedAt, now);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days <= 7) return 'week';
  return 'older';
}
