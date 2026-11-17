import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, errorMessage } from '../api';
import { Avatar } from '../components/avatar';
import { ItemCard } from '../components/item-card';
import { Item } from '../models';

@Component({
  selector: 'app-reservations',
  imports: [ItemCard, Avatar, RouterLink],
  template: `
    <header class="hero">
      <div>
        <h1>Mes réservations</h1>
        <p>Les cadeaux dont tu t'occupes. Toi seul(e) vois cette page.</p>
      </div>
    </header>
    <p class="notice">Si quelqu'un retire un cadeau de sa liste, il reste ici, marqué « Retiré de sa liste ». Appuie sur « Annuler » pour le faire disparaître.</p>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @for (g of groups(); track g.owner) {
      <section class="reservation-group">
        <h2 class="group-head">
          <app-avatar [name]="g.owner" [size]="32" />
          <a [routerLink]="['/people', g.owner]">{{ g.owner }}</a>
        </h2>
        <div class="list">
          @for (item of g.items; track item.id) {
            <app-item-card [item]="item" mode="reservation" (unclaim)="unclaim($event)" />
          }
        </div>
      </section>
    } @empty {
      @if (loaded()) {
        <p class="empty">Tu n'as encore rien réservé.</p>
      }
    }
  `,
})
export class Reservations implements OnInit {
  private api = inject(Api);
  items = signal<Item[]>([]);
  loaded = signal(false);
  error = signal('');

  groups = computed(() => {
    const byOwner = new Map<string, Item[]>();
    for (const item of this.items()) byOwner.set(item.owner, [...(byOwner.get(item.owner) ?? []), item]);
    return [...byOwner].map(([owner, items]) => ({ owner, items }));
  });

  ngOnInit() {
    return this.load();
  }

  async unclaim(item: Item) {
    try {
      await this.api.unclaim(item.id);
    } catch (e) {
      this.error.set(errorMessage(e));
    }
    await this.load();
  }

  private async load() {
    try {
      this.items.set(await this.api.reservations());
      this.error.set('');
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loaded.set(true);
    }
  }
}
