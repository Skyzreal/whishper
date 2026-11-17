import { Component, computed, input, output } from '@angular/core';
import { Item } from '../models';

@Component({
  selector: 'app-item-card',
  template: `
    @let i = item();
    <article class="card" [class.taken]="mode() === 'other' && i.claimed && !i.claimedByMe" [class.mine]="mode() === 'other' && i.claimedByMe">
      <div class="thumb">
        @if (i.image) {
          <img [src]="i.image" alt="" loading="lazy" referrerpolicy="no-referrer" />
        } @else {
          <span class="placeholder">{{ i.url ? '🔗' : '🎁' }}</span>
        }
      </div>
      <div class="body">
        <h3>{{ i.title }}</h3>
        @if (i.price) {
          <p class="price">{{ i.price }}</p>
        }
        @if (i.note) {
          <p class="note">{{ i.note }}</p>
        }
        @if (i.url) {
          <a class="external" [href]="i.url" target="_blank" rel="noopener noreferrer">{{ host() }} ↗</a>
        }
      </div>
      <div class="actions">
        @if (mode() === 'own') {
          <button type="button" class="danger" (click)="remove.emit(i)"          >Retirer</button>
        } @else if (i.claimedByMe) {
                    <span class="badge mine">✓ Tu t'en occupes</span>
                    <button type="button" class="secondary" (click)="unclaim.emit(i)">Annuler</button>
        } @else if (i.claimed) {
                    <span class="badge taken">Déjà réservé</span>
        } @else {
                    <button type="button" (click)="claim.emit(i)">Je m'en occupe</button>
        }
      </div>
    </article>
  `,
})
export class ItemCard {
  item = input.required<Item>();
  /** 'own' renders only owner-safe controls; there is no claim UI at all. */
  mode = input.required<'own' | 'other'>();

  claim = output<Item>();
  unclaim = output<Item>();
  remove = output<Item>();

  protected host = computed(() => {
    try {
      return new URL(this.item().url ?? '').hostname.replace(/^www\./, '');
    } catch {
      return 'Ouvrir le lien';
    }
  });
}
