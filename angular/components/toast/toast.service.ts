import { Injectable, signal } from '@angular/core';

export type ToastTone = 'default' | 'success' | 'warning' | 'danger';

export interface Toast {
  id: number;
  message: string;
  icon: string;
  tone: ToastTone;
}

/** App-wide toasts. Render once with `<pc-toast-stack />` (done by the main layout). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  show(message: string, options: { icon?: string; tone?: ToastTone; duration?: number } = {}): number {
    const id = this.nextId++;
    const toast: Toast = { id, message, icon: options.icon ?? 'circle-check', tone: options.tone ?? 'default' };
    this.toasts.update((list) => [...list, toast]);
    setTimeout(() => this.dismiss(id), options.duration ?? 3200);
    return id;
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
