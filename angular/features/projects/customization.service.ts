import { Injectable, inject } from '@angular/core';

import { DesktopIpcService } from '@shared/desktop/desktop-ipc.service';

import { Customization, CustomizationView, TemplateChange, TemplateContent } from './customization.model';

/** Phase customization of a project: `.procheck\settings.json` → `customization` and `.procheck\templates\`. */
@Injectable({ providedIn: 'root' })
export class CustomizationService {
  private readonly ipc = inject(DesktopIpcService);

  get(id: string): Promise<CustomizationView> {
    return this.ipc.invoke<CustomizationView>('projects_customization_get', { id });
  }

  /** Saves the customization and the staged template changes; resolves to what was stored. */
  save(id: string, customization: Customization, templates: TemplateChange[]): Promise<Customization> {
    return this.ipc.invoke<Customization>('projects_customization_save', { id, customization, templates });
  }

  readTemplate(id: string, artifactId: string): Promise<TemplateContent> {
    return this.ipc.invoke<TemplateContent>('projects_template_read', { id, artifactId });
  }
}
