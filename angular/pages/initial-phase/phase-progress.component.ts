import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';

import { AlertComponent } from '@components/alert/alert.component';
import { BadgeComponent } from '@components/badge/badge.component';
import { ButtonComponent } from '@components/button/button.component';
import { DialogComponent, DialogFooterDirective } from '@components/dialog/dialog.component';
import { IconComponent } from '@components/icon/icon.component';
import { TooltipDirective } from '@components/tooltip/tooltip.directive';
import { AgentConnectionsService } from '@features/agents/agent-connections.service';
import { ArtifactsStore } from '@features/projects/artifacts.store';
import { AGENT_NAMES } from '@features/agents/agents.service';
import { formatDate } from '@shared/format/date';
import { I18nService } from '@shared/i18n/i18n.service';
import type { TranslationKey } from '@shared/i18n/locales/en';
import { TranslatePipe } from '@shared/i18n/translate.pipe';

import { MarkdownComponent } from '../chats/markdown.component';
import { ARTIFACT_ICON, InitialStep, StepArtifact, STEP_BADGE, isApproved } from './initial-steps';

/** Icon of what the agent is doing, by tool name. */
const TOOL_ICON: Record<string, string> = {
  Read: 'eye',
  Glob: 'search',
  Grep: 'search',
  Write: 'file-pen-line',
  Edit: 'pencil',
};

/**
 * "Phase progress" section of the Initial phase overview (ported from `#s-steps` in _proto/initial.html): the steps
 * with their real artifacts, and Generate / Update with AI for each step (one agent run per step, one run per project).
 */
@Component({
  selector: 'pc-phase-progress',
  imports: [
    AlertComponent,
    BadgeComponent,
    ButtonComponent,
    DialogComponent,
    DialogFooterDirective,
    IconComponent,
    MarkdownComponent,
    NgTemplateOutlet,
    RouterLink,
    TooltipDirective,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'section', 'data-testid': 'phase-progress' },
  template: `
    <div class="sh">
      <div class="ttl">
        <div>
          <h3>{{ 'in.s1.title' | t }}</h3>
          <div class="sub">{{ 'in.s1.sub' | t: { a: approved(), n: total() } }}</div>
        </div>
      </div>
      <div class="row gap-2 wrap">
        <a pcButton variant="ghost" size="sm" [routerLink]="['/projects', projectId(), 'settings']">
          <pc-icon name="settings-2" [size]="14" />{{ 'in.s1.config' | t }}
        </a>
        <a pcButton size="sm" [routerLink]="['/projects', projectId(), 'artifacts']">
          <pc-icon name="files" [size]="14" />{{ 'in.s1.artifacts' | t }}
        </a>
      </div>
    </div>

    @if (notices().length) {
      <div class="ph-notes">
        @for (note of notices(); track note.key) {
          <pc-alert [tone]="note.tone" [attr.data-testid]="'phase-note-' + note.id">
            {{ note.key | t: note.params }}
            @if (note.link) {
              <a [routerLink]="note.link" fragment="agents">{{ note.linkLabel | t }}</a>
            }
          </pc-alert>
        }
      </div>
    }

    <div class="ph-steps">
      @for (step of steps(); track step.id; let i = $index) {
        <div class="ph-step" [class]="'is-' + step.status" [attr.data-testid]="'phase-step-' + step.id">
          <span class="ph-dot">
            @switch (step.status) {
              @case ('done') { <pc-icon name="check" [size]="13" /> }
              @case ('stale') { <pc-icon name="refresh-cw" [size]="13" /> }
              @default { {{ i + 1 }} }
            }
          </span>
          <div class="ph-main">
            <div class="ph-name">{{ 'in.step.' + step.id | t }}</div>
            <p class="ph-desc">{{ 'in.step.' + step.id + '.d' | t }}</p>
            <div class="ph-date">
              @if (step.artifacts.length) {
                {{ 'in.s1.approved' | t: { a: approvedIn(step), n: step.artifacts.length } }}
                @if (step.status === 'done' && step.doneAt) {
                  · {{ date(step.doneAt) }}
                }
              } @else {
                —
              }
            </div>
          </div>

          <div class="ph-arts">
            @for (art of step.artifacts; track art.id) {
              <a
                class="ph-art"
                [class]="'is-' + (art.stale ? 'stale' : art.status)"
                [routerLink]="['/projects', projectId(), 'artifacts']"
                [queryParams]="chipQuery(art)"
                [title]="art.version ? art.name + ' · v' + art.version : art.name"
                [attr.data-testid]="'phase-art-' + art.id"
              >
                <pc-icon [name]="art.stale ? 'refresh-cw' : artIcon[art.status]" [size]="12" />
                <span>{{ art.name }}@if (art.files > 1) { · {{ art.files }} }</span>
                @if (art.uncommitted) {
                  <span class="tag">{{ 'ar.uncommitted' | t }}</span>
                }
              </a>
            }
          </div>

          <div class="ph-st"><pc-badge [tone]="badge[step.status]">{{ 'in.st.' + step.status | t }}</pc-badge></div>

          <div class="ph-acts">
            @if (step.artifacts.length) {
              @if (run()?.stepId === step.id) {
                <button
                  pcButton
                  size="sm"
                  type="button"
                  [attr.data-testid]="'phase-step-stop-' + step.id"
                  [disabled]="!!run()?.stopping"
                  (click)="store.stop(projectId())"
                >
                  <pc-icon name="square" [size]="14" />{{ (run()?.stopping ? 'gen.stopping' : 'gen.stop') | t }}
                </button>
              } @else {
                <button
                  pcButton
                  size="sm"
                  type="button"
                  [variant]="step.id === recommended() ? 'ai-primary' : 'ai'"
                  [disabled]="!!blocker(step)"
                  [pcTooltip]="blockerText(step)"
                  [attr.data-testid]="'phase-step-generate-' + step.id"
                  (click)="ask(step)"
                >
                  <pc-icon name="sparkles" [size]="14" />{{ (fresh(step) ? 'in.s1.gen' : 'in.s1.upd') | t }}
                </button>
              }
            }
          </div>

          @if (run(); as current) {
            @if (current.stepId === step.id) {
              <div class="ph-run" data-testid="phase-run">
                <span class="spinner"></span>
                <div class="ph-run-main">
                  <div class="ph-run-act">
                    @if (current.activity; as act) {
                      <pc-icon [name]="toolIcon(act.tool)" [size]="13" />
                      <b>{{ act.tool }}</b>
                      @if (act.path) {
                        <code class="truncate">{{ act.path }}</code>
                      }
                    } @else {
                      {{ 'gen.starting' | t }}
                    }
                  </div>
                  @if (current.text) {
                    <div class="ph-run-text truncate" data-testid="phase-run-text">{{ current.text }}</div>
                  }
                </div>
                @if (current.startedAt) {
                  <span class="ph-run-time">{{ 'gen.since' | t: { time: time(current.startedAt) } }}</span>
                }
              </div>
            }
          }

          @if (result(step); as res) {
            <div class="ph-res" [class]="'is-' + res.outcome" [attr.data-testid]="'phase-result-' + step.id">
              <div class="ph-res-head">
                <pc-icon [name]="res.outcome === 'completed' ? 'circle-check' : res.outcome === 'stopped' ? 'square' : 'circle-alert'" [size]="14" />
                <b class="grow">{{ 'gen.res.' + res.outcome | t: { n: res.changed.length } }}</b>
                <button pcButton variant="ghost" size="sm" type="button" [iconOnly]="true" [attr.aria-label]="'common.close' | t" (click)="dismiss(step)">
                  <pc-icon name="x" [size]="14" />
                </button>
              </div>
              @if (res.outcome !== 'completed') {
                <p class="ph-res-note">{{ 'gen.res.kept' | t }}</p>
              }
              @if (res.error) {
                <p class="ph-res-note text-danger">{{ res.error.message }}</p>
              }
              @if (res.summary) {
                <pc-markdown class="ph-res-sum" [source]="res.summary" />
              }
              @if (res.warnings.length) {
                <div class="ph-res-warn">
                  <b><pc-icon name="triangle-alert" [size]="13" />{{ 'gen.res.warnings' | t }}</b>
                  <ul>
                    @for (warning of res.warnings; track $index) {
                      <li [attr.data-testid]="'phase-warning-' + warning.code">
                        @switch (warning.code) {
                          @case ('outsideChanges') {
                            {{ 'gen.warn.outside' | t }}
                            <ng-container *ngTemplateOutlet="paths; context: { $implicit: warning }" />
                            <div class="ph-res-hint">{{ 'gen.warn.outside.hint' | t }} <code>git restore -- &lt;path&gt;</code></div>
                          }
                          @case ('largeSourceChanged') {
                            {{ 'gen.warn.large' | t }}
                            <ng-container *ngTemplateOutlet="paths; context: { $implicit: warning }" />
                          }
                          @case ('noChanges') {
                            {{ 'gen.warn.nochange' | t }}
                          }
                        }
                      </li>
                    }
                  </ul>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>

    <ng-template #paths let-warning>
      <div class="ph-res-paths">
        @for (path of warning.paths; track path) {
          <code>{{ path }}</code>
        }
        @if (warning.more > 0) {
          <span>{{ 'gen.warn.more' | t: { n: warning.more } }}</span>
        }
      </div>
    </ng-template>

    <pc-dialog [title]="'gen.confirm.t' | t" width="min(480px, 100%)" [open]="!!confirming()" (openChange)="!$event && confirming.set(null)">
      <p class="text-sm text-muted" style="margin: 0">{{ 'gen.confirm.d' | t: { n: confirming()?.approvedFiles ?? 0 } }}</p>
      <div pcDialogFooter class="modal-footer">
        <button pcButton variant="ghost" type="button" (click)="confirming.set(null)">{{ 'common.cancel' | t }}</button>
        <button pcButton variant="primary" type="button" data-testid="phase-generate-confirm" (click)="confirm()">
          <pc-icon name="sparkles" />{{ 'in.s1.upd' | t }}
        </button>
      </div>
    </pc-dialog>
  `,
})
export class PhaseProgressComponent {
  readonly projectId = input.required<string>();
  readonly steps = input.required<InitialStep[]>();

  protected readonly store = inject(ArtifactsStore);
  private readonly connections = inject(AgentConnectionsService);
  private readonly i18n = inject(I18nService);

  protected readonly badge = STEP_BADGE;
  protected readonly artIcon = ARTIFACT_ICON;
  protected readonly confirming = signal<InitialStep | null>(null);

  private readonly overview = computed(() => this.store.overview(this.projectId()));
  protected readonly run = computed(() => this.store.running(this.projectId()));

  /** Why the project's CLI cannot run: not installed or not signed in (`null` while checking, or when unknown). */
  private readonly cliProblem = computed<'missing' | 'signedOut' | null>(() => {
    const cli = this.overview()?.cli;
    if (!cli) return null;
    const state = this.connections.state(cli);
    return state === 'missing' || state === 'signedOut' ? state : null;
  });
  private readonly cliName = computed(() => {
    const cli = this.overview()?.cli;
    return cli ? AGENT_NAMES[cli] : '';
  });

  /** What stops every step from running, shown once above the list. */
  protected readonly notices = computed(() => {
    const overview = this.overview();
    const notes: { id: string; key: TranslationKey; params?: Record<string, string>; tone: 'info' | 'warning'; link?: string; linkLabel?: TranslationKey }[] = [];
    if (overview && !overview.steps.length) notes.push({ id: 'none', key: 'gen.note.none', tone: 'info' });
    if (overview && !overview.gitAvailable) notes.push({ id: 'git', key: 'gen.note.git', tone: 'warning' });
    const problem = this.cliProblem();
    if (problem) {
      const key = problem === 'missing' ? 'gen.note.cli.missing' : 'gen.note.cli.signedOut';
      notes.push({ id: 'cli', key, params: { cli: this.cliName() }, tone: 'warning', link: '/settings', linkLabel: 'gen.note.settings' });
    }
    return notes;
  });

  protected readonly total = computed(() => this.steps().reduce((n, s) => n + s.artifacts.length, 0));
  protected readonly approved = computed(() => this.steps().reduce((n, s) => n + this.approvedIn(s), 0));
  /** The step to generate next: the first one not generated that can run. Its button is the primary one. */
  protected readonly recommended = computed(() => this.steps().find((s) => s.artifacts.length && this.fresh(s) && !s.locked)?.id ?? null);

  protected approvedIn(step: InitialStep): number {
    return step.artifacts.filter(isApproved).length;
  }

  /** The step has no file yet: "Generate"; otherwise "Update". */
  protected fresh(step: InitialStep): boolean {
    return step.artifacts.every((a) => a.files === 0);
  }

  /** Why the step cannot be generated now, or `null`. */
  protected blocker(step: InitialStep): TranslationKey | null {
    const overview = this.overview();
    if (!overview?.steps.length) return 'gen.blk.none';
    if (this.run()) return 'gen.blk.running';
    if (step.locked) return 'gen.blk.locked';
    if (!overview.gitAvailable) return 'gen.blk.git';
    const problem = this.cliProblem();
    if (problem) return problem === 'missing' ? 'gen.blk.cli.missing' : 'gen.blk.cli.signedOut';
    return null;
  }

  protected blockerText(step: InitialStep): string {
    const key = this.blocker(step);
    return key ? this.i18n.t(key, { cli: this.cliName() }) : '';
  }

  protected result(step: InitialStep) {
    return this.store.lastResult(this.projectId(), step.id);
  }

  protected dismiss(step: InitialStep): void {
    this.store.dismissResult(this.projectId(), step.id);
  }

  /** Asks first when the update would send approved files back to Draft. */
  protected ask(step: InitialStep): void {
    if (step.approvedFiles > 0) this.confirming.set(step);
    else void this.store.generate(this.projectId(), step.id);
  }

  protected confirm(): void {
    const step = this.confirming();
    this.confirming.set(null);
    if (step) void this.store.generate(this.projectId(), step.id);
  }

  protected chipQuery(art: StepArtifact): Record<string, string> {
    return art.path ? { path: art.path } : { artifact: art.id };
  }

  protected toolIcon(tool: string): string {
    return TOOL_ICON[tool] ?? 'terminal';
  }

  protected date(iso: string): string {
    return formatDate(iso, this.i18n.lang());
  }

  protected time(epoch: number): string {
    return new Intl.DateTimeFormat(this.i18n.lang() === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(epoch);
  }
}
