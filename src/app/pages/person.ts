import { Component, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../api';
import { Avatar } from '../components/avatar';
import { AddItem } from '../components/add-item';
import { ItemCard } from '../components/item-card';
import { Item } from '../models';

@Component({
  selector: 'app-person',
  imports: [AddItem, ItemCard, Avatar, RouterLink],
  template: `
    <header class="hero">
      <div class="hero-back"><a routerLink="/people" class="back">‹ Famille</a></div>
      <app-avatar [name]="owner() || name()" [size]="56" />
      <div>
        <h1>La liste de {{ owner() || name() }}</h1>
        @if (canManage()) {
          <p>{{ owner() }} n'a pas de compte : c'est toi qui gères sa liste.</p>
        } @else {
          <p>Clique sur "Je m'en occupe" pour réserver un cadeau. Les autres verront qu'il est pris, mais pas {{ owner() || name() }} !</p>
        }
      </div>
    </header>
    @if (canManage()) {
      <p class="notice">Tu ne verras jamais ce qui a été réservé sur cette liste. C'est fait exprès, pour garder la surprise.</p>
      <app-add-item [forName]="owner()" [(open)]="adding" (added)="load(name())" />
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    <div class="list">
      @for (item of items(); track item.id) {
        @if (canManage()) {
          <app-item-card [item]="item" mode="own" (remove)="remove($event)" />
        } @else {
          <app-item-card [item]="item" mode="other" (claim)="claim($event)" (unclaim)="unclaim($event)" />
        }
      } @empty {
        @if (loaded()) {
          <p class="empty">{{ owner() }} n'a encore rien mis dans sa liste.</p>
        }
      }
    </div>
  `,
})
export class PersonPage {
  private api = inject(Api);
  private router = inject(Router);

  name = input.required<string>();
  owner = signal('');
  items = signal<Item[]>([]);
  loaded = signal(false);
  canManage = signal(false);
  adding = signal(false);
  error = signal('');

  constructor() {
    effect(() => {
      const name = this.name();
      this.loaded.set(false);
      this.items.set([]);
      this.owner.set('');
      void this.load(name);
    });
  }

  private async load(name: string) {
    try {
      const r = await this.api.personList(name);
      if (r.isMe) {
        await this.router.navigateByUrl('/');
        return;
      }
      this.owner.set(r.owner);
      this.canManage.set(!!r.canManage);
      this.items.set(r.items);
      this.error.set('');
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loaded.set(true);
    }
  }

  async remove(item: Item) {
    if (!confirm(`Retirer « ${item.title} » de la liste de ${this.owner()} ?`)) return;
    await this.act(() => this.api.removeItem(item.id));
  }

  async claim(item: Item) {
    await this.act(() => this.api.claim(item.id));
  }

  async unclaim(item: Item) {
    await this.act(() => this.api.unclaim(item.id));
  }

  private async act(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      this.error.set(errorMessage(e));
    }
    await this.load(this.name());
  }
}
