import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ToastStackComponent } from '@components/toast/toast-stack.component';

import { AssistantPanelComponent } from '../assistant-panel/assistant-panel.component';
import { injectAssistantHidden } from '../breadcrumbs';
import { ASSISTANT_MIN_W, LayoutService } from '../layout.service';
import { SearchDialogComponent } from '../search-dialog/search-dialog.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';

/** App chrome: sidebar · topbar · canvas (router outlet) · assistant panel. */
@Component({
  selector: 'pc-main-layout',
  imports: [RouterOutlet, SidebarComponent, TopbarComponent, AssistantPanelComponent, SearchDialogComponent, ToastStackComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
  template: `
    <div
      class="app"
      [class.assistant-closed]="!layout.assistantOpen() || assistantHidden()"
      [class.is-resizing]="layout.assistantResizing()"
      [style.--assistant-w]="assistantWidth()"
      data-testid="app-shell"
    >
      <pc-sidebar />
      <pc-topbar />
      <main class="canvas" data-testid="canvas">
        <router-outlet />
      </main>
      @if (!assistantHidden()) {
        <pc-assistant-panel />
      }
    </div>
    <pc-search-dialog />
    <pc-toast-stack />
  `,
})
export class MainLayoutComponent {
  protected readonly layout = inject(LayoutService);
  protected readonly assistantHidden = injectAssistantHidden();

  /** User-chosen width, capped so the canvas keeps room on narrow windows; `null` keeps the CSS default. */
  protected readonly assistantWidth = computed(() => {
    const width = this.layout.assistantWidth();
    return width === null ? null : `max(${ASSISTANT_MIN_W}px, min(${width}px, 100vw - 560px))`;
  });

  protected onKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'k') {
      event.preventDefault();
      this.layout.openSearch();
    } else if (key === 'j' && !this.assistantHidden()) {
      event.preventDefault();
      this.layout.toggleAssistant();
    }
  }
}
