import { Injectable, inject } from '@angular/core';

import { ChatsService } from '@features/chats/chats.service';

/** The conversation of the Assistant panel, kept while the panel is hidden on some pages. */
@Injectable({ providedIn: 'root' })
export class AssistantSessionService {
  readonly session = inject(ChatsService).createSession();
  followedProject: string | null = null;
}
