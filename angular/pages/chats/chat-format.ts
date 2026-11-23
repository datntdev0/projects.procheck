import { AGENT_NAMES } from '@features/agents/agents.service';
import type { TurnError } from '@features/chats/chats.model';
import type { AgentId } from '@features/settings/app-settings.model';
import type { I18nService } from '@shared/i18n/i18n.service';
import type { TranslationKey } from '@shared/i18n/locales/en';

const ERROR_KEYS: Record<string, TranslationKey> = {
  signedOut: 'ch.err.signedOut',
  notInstalled: 'ch.err.notInstalled',
  timeout: 'ch.err.timeout',
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function clock(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function dayLabel(iso: string, lang: string, now = new Date()): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return clock(iso);
  return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', { day: '2-digit', month: 'short' }).format(date);
}

export function dateTimeLabel(iso: string, lang: string, now = new Date()): string {
  const date = new Date(iso);
  if (date.toDateString() === now.toDateString()) return clock(iso);
  const day = new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).format(date);
  return `${day} ${clock(iso)}`;
}

export function timeLeft(iso: string, now = new Date()): string {
  const minutes = Math.max(0, Math.round((new Date(iso).getTime() - now.getTime()) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${rest}m`;
  return `${rest}m`;
}

export function compactNumber(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(value);
}

export function errorText(i18n: I18nService, agent: AgentId, error: TurnError): string {
  const cli = AGENT_NAMES[agent];
  const key = ERROR_KEYS[error.code];
  return key ? i18n.t(key, { cli }) : i18n.t('ch.err.failed', { cli, reason: error.message });
}
