import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ButtonComponent } from '@components/button/button.component';
import { EmptyStateComponent } from '@components/empty-state/empty-state.component';
import { IconComponent } from '@components/icon/icon.component';

import { injectCurrentCrumb } from '@layout/breadcrumbs';
import { I18nService } from '@shared/i18n/i18n.service';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

/** Placeholder for pages that are not built yet. */
@Component({
  selector: 'pc-coming-soon-page',
  imports: [RouterLink, ButtonComponent, EmptyStateComponent, IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="canvas-inner" data-testid="coming-soon-page">
      <pc-empty-state icon="sparkles" [title]="title()" [description]="'soon.desc' | t">
        <a pcButton routerLink="/projects"><pc-icon name="layout-grid" /> {{ 'soon.back' | t }}</a>
      </pc-empty-state>
    </div>
  `,
})
export class ComingSoonPageComponent {
  private readonly i18n = inject(I18nService);
  private readonly crumb = injectCurrentCrumb();
  protected readonly title = computed(() => this.i18n.t('soon.title', { page: this.i18n.t(this.crumb() ?? 'soon.page') }));
}
