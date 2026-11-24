import type { ToastService } from '@components/toast/toast.service';
import type { ChatSession } from '@features/chats/chat-session';
import type { ChatMessage } from '@features/chats/chats.model';
import type { AppSettingsService } from '@features/settings/app-settings.service';
import { DesktopIpcError } from '@shared/desktop/desktop-ipc-error';
import type { I18nService } from '@shared/i18n/i18n.service';
import type { TranslationKey } from '@shared/i18n/locales/en';

const STICKY_SCROLL_PX = 140;

export function lastOf(list: ChatMessage[], role: ChatMessage['role']): ChatMessage | null {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].role === role) return list[i];
  }
  return null;
}

/** The user's message that the given answer replied to, so it can be sent again. */
export function promptBefore(list: ChatMessage[], answer: ChatMessage): ChatMessage | null {
  const index = list.findIndex((m) => m.id === answer.id);
  return lastOf(list.slice(0, index), 'user');
}

/** Model shown for a conversation: the one answering, else the chat's, else the chosen or default one. */
export function displayedModel(session: ChatSession, settings: AppSettingsService): string | null {
  return (
    session.live()?.model ??
    session.current()?.model ??
    session.selectedModel() ??
    settings.settings().agents[session.agent()].model
  );
}

/** Keeps a thread scrolled to its end, unless the user scrolled up while an answer streams. */
export function scrollThreadToEnd(el: HTMLElement | undefined, streaming: boolean): void {
  if (!el) return;
  const nearEnd = el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_SCROLL_PX;
  if (nearEnd || !streaming) el.scrollTop = el.scrollHeight;
}

export function reportChatError(toast: ToastService, i18n: I18nService, key: TranslationKey, error: unknown): void {
  const reason = error instanceof DesktopIpcError ? error.reason : String(error);
  toast.show(i18n.t(key, { reason }), { icon: 'circle-alert', tone: 'danger' });
}

/** Shows why a message could not be sent: the chat is still answering, or another failure. */
export function reportSendError(toast: ToastService, i18n: I18nService, error: unknown): void {
  if (error instanceof DesktopIpcError && error.code === 'busy') {
    toast.show(i18n.t('ch.err.busy'), { icon: 'circle-alert', tone: 'warning' });
  } else if (error instanceof DesktopIpcError && error.code === 'projectUnavailable') {
    toast.show(i18n.t('ch.err.project'), { icon: 'circle-alert', tone: 'danger' });
  } else {
    reportChatError(toast, i18n, 'ch.err.send', error);
  }
}
