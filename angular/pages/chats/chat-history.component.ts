import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, linkedSignal, output, signal } from '@angular/core';

import { ButtonComponent } from '@components/button/button.component';
import { InputDirective } from '@components/form/input.directive';
import { IconComponent } from '@components/icon/icon.component';
import { ToastService } from '@components/toast/toast.service';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { AGENT_NAMES } from '@features/agents/agents.service';
import { ChatScopesService, ScopeView } from '@features/chats/chat-scopes.service';
import { CHAT_GROUPS, ChatGroup, ChatScope, ChatSummary, ScopeFilter, groupOf } from '@features/chats/chats.model';
import { ChatsService } from '@features/chats/chats.service';
import { I18nService } from '@shared/i18n/i18n.service';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { dayLabel } from './chat-format';
import { ScopeAvatarComponent } from './chat-scope-picker.component';
import { reportChatError } from './chat-thread';

interface HistoryGroup {
  id: ChatGroup;
  label: TranslationKey;
  chats: ChatSummary[];
}

type RowMode = 'rename' | 'confirm';

interface ScopeChip {
  view: ScopeView;
  count: number;
}

const ALL: ScopeFilter = { kind: 'all' };

function matches(filter: ScopeFilter, chat: ChatSummary): boolean {
  return filter.kind === 'all' || chat.projectId === filter.scope;
}

function distinctScopes(chats: ChatSummary[]): ChatScope[] {
  return [...new Set(chats.map((c) => c.projectId))].sort((a, b) => (a === null ? 1 : b === null ? -1 : 0));
}

/** Popover listing the chats: scope filter, search, date groups, pin, rename and delete. */
@Component({
  selector: 'pc-chat-history',
  imports: [ButtonComponent, InputDirective, IconComponent, ScopeAvatarComponent, TooltipDirective, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'hist',
    role: 'dialog',
    '[attr.aria-label]': "i18n.t('ch.hist')",
    'data-testid': 'chat-history',
    '(document:mousedown)': 'onDocumentDown($event)',
    '(keydown.escape)': 'onEscape()',
  },
  template: `
    <div class="hist-top">
      <div class="input-group grow">
        <pc-icon name="search" />
        <input
          pcInput
          data-testid="chat-history-search"
          [placeholder]="'ch.hist.q' | t"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
        />
      </div>
      <button pcButton variant="primary" size="sm" type="button" data-testid="chat-history-new" (click)="newChat.emit()">
        <pc-icon name="square-pen" />{{ 'ch.new' | t }}
      </button>
    </div>
    @if (chips().length > 1) {
      <div class="hist-scopes" data-testid="chat-history-scopes">
        <button type="button" class="hf all" [class.is-on]="filter().kind === 'all'" data-testid="chat-history-scope-all" (click)="filter.set(all)">
          {{ 'ch.hist.all' | t }}<span class="n">{{ chats.chats().length }}</span>
        </button>
        @for (chip of chips(); track chip.view.scope) {
          <button
            type="button"
            class="hf"
            [class.is-on]="isOn(chip.view.scope)"
            [attr.data-testid]="'chat-history-scope-' + (chip.view.scope ?? 'none')"
            (click)="pick(chip.view.scope)"
          >
            <pc-scope-avatar [monogram]="chip.view.monogram" /><span class="truncate">{{ chip.view.name }}</span><span class="n">{{ chip.count }}</span>
          </button>
        }
      </div>
    }
    <div class="hist-list">
      @for (group of groups(); track group.id) {
        <div class="hg">{{ group.label | t }}</div>
        @for (chat of group.chats; track chat.id) {
          <div
            class="hr"
            data-testid="chat-history-row"
            [class.is-active]="chat.id === currentId()"
            [class.is-editing]="editing() === chat.id && mode() === 'rename'"
            [class.is-confirm]="editing() === chat.id && mode() === 'confirm'"
            (click)="onRowClick(chat)"
          >
            <pc-scope-avatar [monogram]="scopes.describe(chat.projectId).monogram" />
            @if (editing() === chat.id && mode() === 'rename') {
              <input
                pcInput
                class="grow"
                data-testid="chat-rename-input"
                [value]="chat.title"
                (click)="$event.stopPropagation()"
                (keydown.enter)="rename(chat, $any($event.target).value)"
                (keydown.escape)="cancel($event)"
              />
              <div class="hr-acts">
                <button pcButton variant="ghost" size="sm" type="button" (click)="cancel($event)">{{ 'common.cancel' | t }}</button>
                <button pcButton variant="primary" size="sm" type="button" (click)="renameFromRow($event, chat)">{{ 'common.save' | t }}</button>
              </div>
            } @else if (editing() === chat.id && mode() === 'confirm') {
              <span class="hr-confirm">{{ 'ch.hist.confirm' | t }}</span>
              <div class="hr-acts">
                <button pcButton variant="ghost" size="sm" type="button" (click)="cancel($event)">{{ 'common.cancel' | t }}</button>
                <button pcButton variant="danger" size="sm" type="button" data-testid="chat-delete-confirm" (click)="remove($event, chat)">
                  <pc-icon name="trash-2" />{{ 'ch.delete' | t }}
                </button>
              </div>
            } @else {
              <div class="hr-main">
                <div class="hr-t">
                  @if (chat.pinned) {
                    <pc-icon name="pin" />
                  }
                  <span class="truncate">{{ chat.title || ('ch.untitled' | t) }}</span>
                </div>
                <div class="hr-s truncate">{{ scopes.describe(chat.projectId).name }} · {{ names[chat.agent] }} · {{ 'ch.msgs' | t: { n: chat.messageCount } }}</div>
              </div>
              <span class="hr-time">{{ when(chat) }}</span>
              <div class="hr-acts">
                <button pcButton variant="ghost" size="sm" [iconOnly]="true" type="button" data-testid="chat-pin" [pcTooltip]="(chat.pinned ? 'ch.unpin' : 'ch.pin') | t" (click)="togglePin($event, chat)">
                  <pc-icon [name]="chat.pinned ? 'pin-off' : 'pin'" />
                </button>
                <button pcButton variant="ghost" size="sm" [iconOnly]="true" type="button" data-testid="chat-rename" [pcTooltip]="'ch.rename' | t" (click)="edit($event, chat, 'rename')">
                  <pc-icon name="pencil" />
                </button>
                <button pcButton variant="ghost" size="sm" [iconOnly]="true" type="button" class="danger" data-testid="chat-delete" [pcTooltip]="'ch.delete' | t" (click)="edit($event, chat, 'confirm')">
                  <pc-icon name="trash-2" />
                </button>
              </div>
            }
          </div>
        }
      } @empty {
        <div class="hist-empty">{{ (chats.chats().length ? 'ch.hist.none' : 'ch.hist.empty') | t }}</div>
      }
    </div>
  `,
})
export class ChatHistoryComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly chats = inject(ChatsService);
  protected readonly scopes = inject(ChatScopesService);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly currentId = input<string | null>(null);
  readonly initialFilter = input<ScopeFilter>(ALL);
  readonly closed = output<void>();
  readonly picked = output<string>();
  readonly newChat = output<void>();

  protected readonly names = AGENT_NAMES;
  protected readonly all = ALL;
  protected readonly filter = linkedSignal(() => this.initialFilter());
  protected readonly chips = computed<ScopeChip[]>(() => {
    const chats = this.chats.chats();
    return distinctScopes(chats).map((scope) => ({
      view: this.scopes.describe(scope),
      count: chats.filter((c) => c.projectId === scope).length,
    }));
  });
  protected readonly query = signal('');
  protected readonly editing = signal<string | null>(null);
  protected readonly mode = signal<RowMode>('rename');

  protected readonly groups = computed<HistoryGroup[]>(() => {
    const q = this.query().trim().toLowerCase();
    const now = new Date();
    const filter = this.filter();
    const visible = this.chats.chats().filter((c) => matches(filter, c) && (!q || c.title.toLowerCase().includes(q)));
    return CHAT_GROUPS.map((id) => ({
      id,
      label: `ch.g.${id}` as TranslationKey,
      chats: visible.filter((c) => groupOf(c, now) === id),
    })).filter((g) => g.chats.length > 0);
  });

  constructor() {
    afterNextRender(() => this.host.querySelector<HTMLInputElement>('[data-testid="chat-history-search"]')?.focus());
  }

  protected isOn(scope: ChatScope): boolean {
    const filter = this.filter();
    return filter.kind === 'scope' && filter.scope === scope;
  }

  protected pick(scope: ChatScope): void {
    this.filter.set({ kind: 'scope', scope });
  }

  protected when(chat: ChatSummary): string {
    return dayLabel(chat.updatedAt, this.i18n.lang());
  }

  protected onRowClick(chat: ChatSummary): void {
    if (this.editing() === chat.id) return;
    this.picked.emit(chat.id);
  }

  protected edit(event: Event, chat: ChatSummary, mode: RowMode): void {
    event.stopPropagation();
    this.mode.set(mode);
    this.editing.set(chat.id);
    if (mode === 'rename') setTimeout(() => this.focusRename());
  }

  protected cancel(event: Event): void {
    event.stopPropagation();
    this.editing.set(null);
  }

  protected renameFromRow(event: Event, chat: ChatSummary): void {
    event.stopPropagation();
    const input = this.host.querySelector<HTMLInputElement>('[data-testid="chat-rename-input"]');
    void this.rename(chat, input?.value ?? '');
  }

  protected async rename(chat: ChatSummary, value: string): Promise<void> {
    const title = value.trim();
    this.editing.set(null);
    if (!title || title === chat.title) return;
    await this.run(() => this.chats.rename(chat.id, title), 'ch.renamed');
  }

  protected async togglePin(event: Event, chat: ChatSummary): Promise<void> {
    event.stopPropagation();
    await this.run(() => this.chats.setPinned(chat.id, !chat.pinned));
  }

  protected async remove(event: Event, chat: ChatSummary): Promise<void> {
    event.stopPropagation();
    this.editing.set(null);
    await this.run(() => this.chats.remove(chat.id), 'ch.deleted');
  }

  protected onEscape(): void {
    if (this.editing()) {
      this.editing.set(null);
      return;
    }
    this.closed.emit();
  }

  protected onDocumentDown(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!this.host.contains(target) && !target.closest('[data-history-trigger]')) this.closed.emit();
  }

  private focusRename(): void {
    const input = this.host.querySelector<HTMLInputElement>('[data-testid="chat-rename-input"]');
    input?.focus();
    input?.select();
  }

  private async run(action: () => Promise<void>, done?: TranslationKey): Promise<void> {
    try {
      await action();
      if (done) this.toast.show(this.i18n.t(done));
    } catch (error) {
      reportChatError(this.toast, this.i18n, 'ch.err.action', error);
    }
  }
}
