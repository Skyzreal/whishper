import { Component, ElementRef, OnInit, effect, inject, signal, untracked } from '@angular/core';
import { AddRequest } from '../add-request';
import { Api, errorMessage } from '../api';
import { Auth } from '../auth';
import { Avatar } from '../components/avatar';
import { AddItem } from '../components/add-item';
import { ItemCard } from '../components/item-card';
import { Item } from '../models';

@Component({
  selector: 'app-my-list',
  imports: [AddItem, ItemCard, Avatar],
  template: `
    <header class="hero">
      <app-avatar [name]="auth.user() ?? ''" [size]="56" />
      <div>
        <h1>Ma liste de souhaits</h1>
        <p>Toute la famille peut la voir. Toi seul(e) peux la modifier.</p>
      </div>
    </header>
    <p class="notice">🔒 Tu ne verras jamais quels cadeaux ont été réservés, pour que la surprise reste entière.</p>

    <app-add-item [(open)]="adding" (added)="load()" />

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    <div class="list">
      @for (item of items(); track item.id) {
        <app-item-card [item]="item" mode="own" (remove)="remove($event)" />
      } @empty {
        @if (loaded()) {
          <p class="empty">Rien pour l'instant. Appuie sur « Ajouter un cadeau » !</p>
        }
      }
    </div>
  `,
})
export class MyList implements OnInit {
  private api = inject(Api);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private addRequest = inject(AddRequest);
  protected auth = inject(Auth);
  adding = signal(false);
  items = signal<Item[]>([]);
  loaded = signal(false);
  error = signal('');

  constructor() {
    let seen = untracked(() => this.addRequest.count());
    effect(() => {
      const n = this.addRequest.count();
      if (n === seen) return;
      seen = n;
      this.adding.set(true);
      setTimeout(() => this.host.nativeElement.querySelector('.add')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    });
  }

  ngOnInit() {
    return this.load();
  }

  async load() {
    try {
      this.items.set(await this.api.myItems());
      this.error.set('');
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loaded.set(true);
    }
  }

  async remove(item: Item) {
    if (!confirm(`Retirer « ${item.title} » de ta liste ?`)) return;
    try {
      await this.api.removeItem(item.id);
      await this.load();
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }
}
