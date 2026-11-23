import { Component, OnInit, inject, signal } from '@angular/core';

import { AppInfo, DesktopIpcService } from '@shared/desktop/desktop-ipc.service';

@Component({
  selector: 'app-root',
  templateUrl: './root.component.html',
})
export class RootComponent implements OnInit {
  private readonly ipc = inject(DesktopIpcService);

  protected readonly fallbackName = 'Procheck';
  protected readonly appInfo = signal<AppInfo | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.appInfo.set(await this.ipc.appInfo());
    } catch {
      // Running outside Tauri (Storybook, plain browser): keep the placeholder values.
      this.appInfo.set(null);
    }
  }
}
