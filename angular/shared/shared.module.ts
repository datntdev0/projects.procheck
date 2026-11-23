import { NgModule, Type } from '@angular/core';

/** Standalone declarables shared across the app. Empty for now. */
const SHARED_DECLARABLES: Type<unknown>[] = [];

@NgModule({
  imports: [...SHARED_DECLARABLES],
  exports: [...SHARED_DECLARABLES],
})
export class SharedModule {}
