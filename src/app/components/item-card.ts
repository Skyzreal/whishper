import { Component, computed, input, output } from '@angular/core';
import { Item, itemLabel } from '../models';

@Component({
  selector: 'app-item-card',
  template: `
    @let i = item();
    <article class="card" [class.fav]="i.favorite" [class.pic-only]="!i.title.trim()" [class.taken]="mode() === 'other' && i.claimed && !i.claimedByMe" [class.mine]="mode() === 'other' && i.claimedByMe" [class.removed]="i.removed">
      <div class="thumb">
        @if (i.image && i.hasPicture) {
          <a class="thumb-link" [href]="i.image" target="_blank" rel="noopener" aria-label="Voir la photo en grand">
            <img [src]="i.image" alt="" loading="lazy" />
          </a>
        } @else if (i.image) {
          <img [src]="i.image" alt="" loading="lazy" referrerpolicy="no-referrer" />
        } @else {
          <span class="placeholder" aria-hidden="true">{{ initial() }}</span>
        }
      </div>
      <div class="body">
        <h3>
          @if (i.favorite) {
            <svg class="fav-mark" viewBox="0 0 24 24" role="img" aria-label="Coup de cœur"><path d="M12 2.8l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.6l-5.9 3.2 1.2-6.5L2.5 9.7l6.6-.9z"/></svg>
          }
          {{ label() }}
        </h3>
        @if (i.price) {
          <p class="price">{{ i.price }}</p>
        }
        @if (i.note) {
          <p class="note">{{ i.note }}</p>
        }
        @if (i.multi) {
          <p class="multi">Plusieurs personnes peuvent l'offrir</p>
        }
        @if (mode() === 'other' && i.claimers?.length) {
          <p class="claimers">Déjà prévu par {{ i.claimers!.join(', ') }}</p>
        }
        @if (i.url) {
          <a class="external" [href]="i.url" target="_blank" rel="noopener noreferrer">{{ host() }} ↗</a>
        }
      </div>
      <div class="actions" [class.own]="mode() === 'own'">
        @if (mode() === 'own') {
          <button type="button" class="fav-toggle" [class.on]="i.favorite" [attr.aria-pressed]="!!i.favorite"
            [attr.aria-label]="i.favorite ? 'Retirer des coups de cœur' : 'Marquer comme coup de cœur'"
            (click)="toggleFavorite.emit(i)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.6l-5.9 3.2 1.2-6.5L2.5 9.7l6.6-.9z"/></svg>
          </button>
          <button type="button" class="tool" (click)="edit.emit(i)">Modifier</button>
          <button type="button" class="danger" (click)="remove.emit(i)">Retirer</button>
        } @else if (mode() === 'reservation') {
          @if (i.removed) {
            <span class="badge taken">Retiré de sa liste</span>
          } @else {
            <span class="badge mine">Tu t'en occupes</span>
          }
          <button type="button" class="secondary" (click)="unclaim.emit(i)">Annuler</button>
        } @else if (i.claimedByMe) {
          <span class="badge mine">Tu t'en occupes</span>
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
  mode = input.required<'own' | 'other' | 'reservation'>();

  claim = output<Item>();
  unclaim = output<Item>();
  remove = output<Item>();
  edit = output<Item>();
  toggleFavorite = output<Item>();

  protected label = computed(() => itemLabel(this.item()));
  protected initial = computed(() => Array.from(this.label())[0]?.toLocaleUpperCase('fr') ?? '');

  protected host = computed(() => {
    try {
      return new URL(this.item().url ?? '').hostname.replace(/^www\./, '');
    } catch {
      return 'Ouvrir le lien';
    }
  });
}
