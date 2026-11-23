import { bootstrapApplication } from '@angular/platform-browser';

import { RootComponent } from './root.component';
import { rootConfig } from './root.config';

bootstrapApplication(RootComponent, rootConfig).catch((error: unknown) => console.error(error));
