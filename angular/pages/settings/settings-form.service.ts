import { Injectable, computed, inject, signal } from '@angular/core';

import { AppSettings, DiagnosticsSettings, StartupView } from '@features/settings/app-settings.model';
import { AppSettingsService } from '@features/settings/app-settings.service';
import { DesktopIpcError } from '@shared/desktop/desktop-ipc-error';

/**
 * Settings edited through the page's save bar. Theme and language are not part of it:
 * they apply (and are saved) immediately, like the topbar controls.
 */
export interface SettingsForm {
  general: {
    /** Empty string = not set. */
    defaultProjectDir: string;
    onStartup: StartupView;
  };
  diagnostics: DiagnosticsSettings;
}

export type SettingsField = 'defaultProjectDir';

function toForm(settings: AppSettings): SettingsForm {
  return {
    general: {
      defaultProjectDir: settings.general.defaultProjectDir ?? '',
      onStartup: settings.general.onStartup,
    },
    diagnostics: { ...settings.diagnostics },
  };
}

function applyForm(settings: AppSettings, form: SettingsForm): AppSettings {
  return {
    ...settings,
    general: {
      ...settings.general,
      defaultProjectDir: form.general.defaultProjectDir.trim() || null,
      onStartup: form.general.onStartup,
    },
    diagnostics: { ...form.diagnostics },
  };
}

export type SaveResult = { ok: true } | { ok: false; field: SettingsField | null; message: string };

/** Draft of the settings page form; provided by the settings page. */
@Injectable()
export class SettingsFormService {
  private readonly store = inject(AppSettingsService);

  private readonly saved = computed(() => toForm(this.store.settings()));
  readonly value = signal<SettingsForm>(this.saved());
  readonly dirty = computed(() => JSON.stringify(this.value()) !== JSON.stringify(this.saved()));
  readonly saving = signal(false);
  /** Field rejected by the last save, cleared when it is edited again. */
  readonly invalidField = signal<SettingsField | null>(null);

  patchGeneral(patch: Partial<SettingsForm['general']>): void {
    this.value.update((v) => ({ ...v, general: { ...v.general, ...patch } }));
    if ('defaultProjectDir' in patch) this.invalidField.set(null);
  }

  patchDiagnostics(patch: Partial<DiagnosticsSettings>): void {
    this.value.update((v) => ({ ...v, diagnostics: { ...v.diagnostics, ...patch } }));
  }

  async save(): Promise<SaveResult> {
    if (this.saving()) return { ok: false, field: null, message: '' };
    this.saving.set(true);
    try {
      const form = this.value();
      const saved = await this.store.update((settings) => applyForm(settings, form));
      this.value.set(toForm(saved));
      this.invalidField.set(null);
      return { ok: true };
    } catch (error) {
      const field: SettingsField | null = error instanceof DesktopIpcError && error.code === 'folderNotFound' ? 'defaultProjectDir' : null;
      this.invalidField.set(field);
      return { ok: false, field, message: error instanceof DesktopIpcError ? error.reason : String(error) };
    } finally {
      this.saving.set(false);
    }
  }

  discard(): void {
    this.value.set(this.saved());
    this.invalidField.set(null);
  }
}
