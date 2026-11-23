import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, inject, signal, viewChild } from '@angular/core';

import { AvatarComponent } from '@components/avatar/avatar.component';
import { StatusDotComponent } from '@components/badge/status-dot.component';
import { ButtonComponent } from '@components/button/button.component';
import { DropdownComponent } from '@components/dropdown/dropdown.component';
import { IconComponent } from '@components/icon/icon.component';
import { MENU } from '@components/menu/menu.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';

import { LayoutService } from '../layout.service';
import { AssistantResizerComponent } from './assistant-resizer.component';

export type AssistantMode = 'ask' | 'edit' | 'agent';

export interface AssistantMessage {
  role: 'assistant' | 'user';
  text: string;
  time: string;
}

interface ContextChip {
  icon: string;
  label: string;
}

const MODES: { id: AssistantMode; label: string; icon: string }[] = [
  { id: 'ask', label: 'Ask', icon: 'message-circle' },
  { id: 'edit', label: 'Edit artifact', icon: 'square-pen' },
  { id: 'agent', label: 'Agent', icon: 'bot' },
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
  imports: [AssistantResizerComponent, AvatarComponent, StatusDotComponent, ButtonComponent, DropdownComponent, IconComponent, TooltipDirective, ...MENU],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'assistant', 'aria-label': 'Assistant', '[attr.aria-hidden]': '!layout.assistantOpen()' },
  templateUrl: './assistant-panel.component.html',
})
export class AssistantPanelComponent {
  protected readonly layout = inject(LayoutService);
  private readonly list = viewChild<ElementRef<HTMLElement>>('messageList');

  protected readonly modes = MODES;
  protected readonly mode = signal<AssistantMode>('ask');
  protected readonly draft = signal('');
  protected readonly context = signal<ContextChip[]>([
    { icon: 'layout-grid', label: 'All projects' },
    { icon: 'terminal', label: 'Claude Code' },
  ]);
  protected readonly suggestions = signal(['Summarize latest docs', 'Draft user stories', 'Project risks?']);
  protected readonly messages = signal<AssistantMessage[]>([
    {
      role: 'assistant',
      time: now(),
      text: 'Hi 👋 I can help you set up projects, review documents and plan work. Connect a CLI in Settings to start chatting.',
    },
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
