import { Component, OnInit, inject, signal } from '@angular/core';
import { Api, errorMessage } from '../api';
import { AddItem } from '../components/add-item';
import { ItemCard } from '../components/item-card';
import { Item } from '../models';

@Component({
  selector: 'app-my-list',
  imports: [AddItem, ItemCard],
  template: `
    <h1>My wishlist</h1>
    <p class="lead">
      Everyone in the family can see this list. You'll never see which of your items have been picked,
      so your gifts stay a surprise. 🤫
    </p>

    <app-add-item (added)="load()" />

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    <div class="list">
      @for (item of items(); track item.id) {
        <app-item-card [item]="item" mode="own" (remove)="remove($event)" />
      } @empty {
        @if (loaded()) {
          <p class="empty">Nothing here yet. Add something above!</p>
        }
      }
    </div>
  `,
})
export class MyList implements OnInit {
  private api = inject(Api);
  items = signal<Item[]>([]);
  loaded = signal(false);
  error = signal('');

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
    if (!confirm(`Remove "${item.title}" from your list?`)) return;
    try {
      await this.api.removeItem(item.id);
      await this.load();
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }
}
