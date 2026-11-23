import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';

const EXTERNAL_LINK = /^(https?:|mailto:)/i;

export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false, gfm: true, breaks: true });
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

/** Markdown from the CLI, sanitized. Links open in the system browser, never inside the app. */
@Component({
  selector: 'pc-markdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'md', '[innerHTML]': 'html()', '(click)': 'onClick($event)' },
  template: ``,
})
export class MarkdownComponent {
  private readonly ipc = inject(DesktopIpcService);

  readonly source = input.required<string>();

  protected readonly html = computed(() => renderMarkdown(this.source()));

  protected onClick(event: MouseEvent): void {
    const link = (event.target as HTMLElement).closest('a');
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute('href') ?? '';
    if (EXTERNAL_LINK.test(href)) {
      this.ipc.invoke('plugin:opener|open_url', { url: href }).catch((error: unknown) => console.error('Could not open link', error));
    }
  }
}
