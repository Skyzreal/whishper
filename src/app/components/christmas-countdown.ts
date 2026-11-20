import { Component, OnDestroy, computed, signal } from '@angular/core';
import { countdownTo } from '../countdown';

@Component({
  selector: 'app-christmas-countdown',
  template: `
    <div class="xmas" role="timer" [attr.aria-label]="label()">
      <span class="xmas-star" aria-hidden="true">★</span>
      @if (c(); as t) {
        @if (t.today) {
          <p class="xmas-title" aria-hidden="true">Joyeux Noël ! 🎄</p>
        } @else {
          <p class="xmas-title" aria-hidden="true">Plus que {{ t.days }} {{ t.days > 1 ? 'jours' : 'jour' }} avant Noël !</p>
          <div class="xmas-tiles" aria-hidden="true">
            @for (u of units(); track u.label) {
              <div class="xmas-tile"><strong>{{ u.value }}</strong><span>{{ u.label }}</span></div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class ChristmasCountdown implements OnDestroy {
  private now = signal(new Date());
  private timer = setInterval(() => this.now.set(new Date()), 1000);

  protected c = computed(() => countdownTo(this.now()));
  protected units = computed(() => {
    const t = this.c();
    if (t.today) return [];
    const pad = (n: number) => String(n).padStart(2, '0');
    return [
      { value: t.days, label: t.days > 1 ? 'jours' : 'jour' },
      { value: pad(t.hours), label: 'heures' },
      { value: pad(t.minutes), label: 'min' },
      { value: pad(t.seconds), label: 'sec' },
    ];
  });
  // Only changes once a minute, and the timer role is not a live region: no per-second announcements.
  protected label = computed(() => {
    const t = this.c();
    if (t.today) return 'Joyeux Noël !';
    return `Noël dans ${t.days} jours, ${t.hours} heures et ${t.minutes} minutes`;
  });

  ngOnDestroy() {
    clearInterval(this.timer);
  }
}
