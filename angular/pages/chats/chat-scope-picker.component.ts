import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import { ProjectAvatarComponent } from '@components/avatar/project-avatar.component';
import { DropdownComponent } from '@components/dropdown/dropdown.component';
import { IconComponent } from '@components/icon/icon.component';
import { MENU } from '@components/menu/menu.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { ChatScopesService } from '@features/chats/chat-scopes.service';
import type { ChatScope } from '@features/chats/chats.model';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

/** Small avatar of a scope: the project monogram, or a globe for a general chat. */
@Component({
  selector: 'pc-scope-avatar',
  imports: [IconComponent, ProjectAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: inline-flex; flex-shrink: 0' },
  template: `
    @if (monogram(); as monogram) {
      <pc-project-avatar class="sc-av" [short]="monogram" [size]="18" />
    } @else {
      <span class="sc-av none"><pc-icon name="globe" /></span>
    }
  `,
})
export class ScopeAvatarComponent {
  readonly monogram = input<string | null>(null);
}

/** Header pill that shows where a chat works and, before its first message, lets the user change it. */
@Component({
  selector: 'pc-chat-scope-picker',
  imports: [DropdownComponent, IconComponent, ScopeAvatarComponent, TooltipDirective, TranslatePipe, ...MENU],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (locked()) {
      <span class="scope-pick is-locked" data-testid="chat-scope" [pcTooltip]="'ch.scope.locked' | t">
        <pc-scope-avatar [monogram]="view().monogram" />
        <span class="truncate">{{ view().name }}</span>
      </span>
    } @else {
      <pc-dropdown [placement]="placement()">
        <button type="button" class="scope-pick" pcDropdownTrigger data-testid="chat-scope" [pcTooltip]="'ch.scope.switch' | t">
          <pc-scope-avatar [monogram]="view().monogram" />
          <span class="truncate">{{ view().name }}</span>
          <pc-icon name="chevron-down" [size]="14" />
        </button>
        <pc-menu class="scope-menu">
          <pc-menu-label>{{ 'ch.scope.projects' | t }}</pc-menu-label>
          @for (option of scopes.projectScopes(); track option.scope) {
            <button
              type="button"
              pcMenuItem
              [active]="option.scope === scope()"
              [attr.data-testid]="'chat-scope-' + option.scope"
              (click)="scopeChange.emit(option.scope)"
            >
              <pc-scope-avatar [monogram]="option.monogram" />
              <span class="grow truncate">{{ option.name }}</span>
              @if (option.scope === scope()) {
                <pc-icon name="check" />
              }
            </button>
          } @empty {
            <div class="mi-note">{{ 'ch.scope.noprojects' | t }}</div>
          }
          <pc-menu-separator />
          <button type="button" pcMenuItem [active]="scope() === null" data-testid="chat-scope-none" (click)="scopeChange.emit(null)">
            <pc-scope-avatar />
            <span class="grow">{{ 'ch.scope.none' | t }}</span>
            @if (scope() === null) {
              <pc-icon name="check" />
            }
          </button>
        </pc-menu>
      </pc-dropdown>
    }
  `,
})
export class ChatScopePickerComponent {
  protected readonly scopes = inject(ChatScopesService);

  readonly scope = input.required<ChatScope>();
  readonly locked = input(false);
  readonly placement = input<'bottom-start' | 'bottom-end'>('bottom-start');
  readonly scopeChange = output<ChatScope>();

  protected readonly view = computed(() => this.scopes.describe(this.scope()));
}
