import { Directive, ElementRef, computed, inject, input } from '@angular/core';

/** Styles native controls: `<input pcInput>`, `<textarea pcInput>`, `<select pcInput>`. */
@Directive({
  selector: 'input[pcInput], textarea[pcInput], select[pcInput]',
  host: { '[class]': 'classes()', '[attr.aria-invalid]': 'invalid() || null' },
})
export class InputDirective {
  readonly invalid = input(false);

  private readonly tag = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.tagName.toLowerCase();
  private readonly base = this.tag === 'textarea' ? 'textarea' : this.tag === 'select' ? 'select' : 'input';

  protected readonly classes = computed(() => (this.invalid() ? `${this.base} is-invalid` : this.base));
}
