import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-avatar',
  template: `<span class="avatar" [style.background]="color()" [style.width.px]="size()" [style.height.px]="size()" [style.font-size.px]="size() * 0.45" aria-hidden="true">{{ initial() }}</span>`,
})
export class Avatar {
  name = input.required<string>();
  size = input(36);

  protected initial = computed(() => Array.from(this.name().trim().normalize('NFC'))[0]?.toLocaleUpperCase('fr') ?? '');
  protected color = computed(() => {
    let h = 0;
    for (const ch of this.name().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 997;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  });
}

// Palette de Noël (contraste suffisant avec la lettre blanche).
const AVATAR_COLORS = ['#a4262c', '#1e5a3c', '#142648', '#7f1d22', '#2f6b4f', '#5b3a7a', '#8a5a14'];
