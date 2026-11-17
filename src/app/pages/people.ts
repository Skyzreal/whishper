import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, errorMessage } from '../api';
import { Avatar } from '../components/avatar';
import { Person } from '../models';

@Component({
  selector: 'app-people',
  imports: [RouterLink, Avatar],
  template: `
    <header class="hero">
      <div>
        <h1>Famille</h1>
        <p>Clique sur quelqu'un pour voir sa liste.</p>
      </div>
    </header>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    <div class="grid">
      @for (p of people(); track p.name) {
        <a class="person" [routerLink]="p.name === me() ? '/' : ['/people', p.name]">
          <app-avatar [name]="p.name" [size]="56" />
          <strong>{{ p.name }}{{ p.name === me() ? ' (toi)' : '' }}</strong>
          <span>{{ p.itemCount }} {{ p.itemCount > 1 ? 'idées' : 'idée' }}{{ p.canManage ? ' · tu gères sa liste' : '' }}</span>
        </a>
      }
    </div>
  `,
})
export class People implements OnInit {
  private api = inject(Api);
  people = signal<Person[]>([]);
  me = signal('');
  error = signal('');

  async ngOnInit() {
    try {
      const r = await this.api.people();
      this.me.set(r.me);
      this.people.set(r.people);
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }
}
