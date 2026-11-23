import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, inject, signal, viewChild } from '@angular/core';

import { AvatarComponent } from '@components/avatar/avatar.component';
import { StatusDotComponent } from '@components/badge/status-dot.component';
import { ButtonComponent } from '@components/button/button.component';
import { DropdownComponent } from '@components/dropdown/dropdown.component';
import { IconComponent } from '@components/icon/icon.component';
import { MENU } from '@components/menu/menu.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { I18nService } from '@shared/i18n/i18n.service';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { LayoutService } from '../layout.service';
import { AssistantResizerComponent } from './assistant-resizer.component';

export type AssistantMode = 'ask' | 'edit' | 'agent';

export interface AssistantMessage {
  role: 'assistant' | 'user';
  /** Literal text (user input, CLI output)… */
  text?: string;
  /** …or a translation key for built-in messages, so they follow the language. */
  textKey?: TranslationKey;
  time: string;
}

interface ContextChip {
  icon: string;
  /** Translation key, or a literal such as a CLI name (unknown keys render as-is). */
  label: TranslationKey | string;
}

const MODES: { id: AssistantMode; label: TranslationKey; icon: string }[] = [
  { id: 'ask', label: 'as.mode.ask', icon: 'message-circle' },
  { id: 'edit', label: 'as.mode.edit', icon: 'square-pen' },
  { id: 'agent', label: 'as.mode.agent', icon: 'bot' },
];

function now(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Assistant side panel skeleton: header, context chips, message list, suggestions and composer.
 * Not wired to a CLI yet — sending only appends the user's message locally.
 */
@Component({
  selector: 'pc-assistant-panel',
  imports: [AssistantResizerComponent, AvatarComponent, StatusDotComponent, ButtonComponent, DropdownComponent, IconComponent, TooltipDirective, TranslatePipe, ...MENU],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'assistant', '[attr.aria-label]': "i18n.t('shell.assistant')", '[attr.aria-hidden]': '!layout.assistantOpen()' },
  templateUrl: './assistant-panel.component.html',
})
export class AssistantPanelComponent {
  protected readonly layout = inject(LayoutService);
  protected readonly i18n = inject(I18nService);
  private readonly list = viewChild<ElementRef<HTMLElement>>('messageList');

  protected readonly modes = MODES;
  protected readonly mode = signal<AssistantMode>('ask');
  protected readonly draft = signal('');
  protected readonly context = signal<ContextChip[]>([
    { icon: 'layout-grid', label: 'nav.all_projects' },
    { icon: 'terminal', label: 'Claude Code' },
  ]);
  protected readonly suggestions = signal<TranslationKey[]>(['as.suggest.summarize', 'as.suggest.stories', 'as.suggest.risks']);
  protected readonly messages = signal<AssistantMessage[]>([
    { role: 'assistant', time: now(), textKey: 'as.welcome' },
  ]);

  constructor() {
    afterRenderEffect(() => {
      this.messages();
      const el = this.list()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  protected modeOf(id: AssistantMode) {
    return MODES.find((m) => m.id === id) ?? MODES[0];
  }

  protected newChat(): void {
    this.messages.set([]);
  }

  protected send(text = this.draft()): void {
    const value = text.trim();
    if (!value) return;
    this.messages.update((list) => [...list, { role: 'user', text: value, time: now() }]);
    this.draft.set('');
  }

  protected onComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }
}
