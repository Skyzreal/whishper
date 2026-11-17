import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AddRequest } from './add-request';
import { Auth } from './auth';
import { Avatar } from './components/avatar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Avatar],
  template: `
    <header class="topbar">
      <a routerLink="/" class="brand">🎁 Whishper</a>
      @if (auth.user(); as me) {
        <nav class="top-nav">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Ma liste</a>
          <a routerLink="/people" routerLinkActive="active">Famille</a>
          <a routerLink="/reservations" routerLinkActive="active">Mes réservations</a>
        </nav>
        <div class="me">
          <app-avatar [name]="me" [size]="28" />
          <span class="me-name">{{ me }}</span>
          <button class="link" type="button" (click)="logout()">Se déconnecter</button>
        </div>
      }
    </header>
    <main class="page"><router-outlet /></main>
    @if (auth.user(); as me) {
      <nav class="tabbar" aria-label="Navigation principale">
        <a routerLink="/people" routerLinkActive="active" class="tab">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14c2.7 0 4.5 1.7 4.5 4.5"/></svg>
          <span>Famille</span>
        </a>
        <a routerLink="/reservations" routerLinkActive="active" class="tab">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>
          <span>Réservés</span>
        </a>
        <button type="button" class="tab-add" (click)="add()">
          <span aria-hidden="true">＋</span> Ajouter
        </button>
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" class="tab">
          <app-avatar [name]="me" [size]="26" />
          <span>Ma liste</span>
        </a>
      </nav>
    }
  `,
})
export class App {
  protected auth = inject(Auth);
  private router = inject(Router);
  private addRequest = inject(AddRequest);

  protected async logout() {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }

  protected async add() {
    await this.router.navigateByUrl('/');
    this.addRequest.ask();
  }
}
