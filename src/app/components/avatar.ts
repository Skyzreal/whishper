import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-avatar',
  template: `<span class="avatar" [style.background]="color()" [style.width.px]="size()" [style.height.px]="size()" [style.font-size.px]="size() * 0.45" aria-hidden="true">{{ initial() }}</span>`,
})
export class Avatar {
  name = input.required<string>();
  size = input(36);

  protected initial = computed(() => this.name().trim().charAt(0).toUpperCase());
  protected color = computed(() => {
    let h = 0;
    for (const ch of this.name().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return `hsl(${h} 55% 42%)`;
  });
}
