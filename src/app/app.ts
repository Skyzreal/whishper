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
      <a routerLink="/" class="brand"><img src="logo.png" alt="" class="brand-logo" width="32" height="32">Whishper</a>
      @if (auth.user(); as me) {
        <nav class="top-nav">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Ma liste</a>
          <a routerLink="/people" routerLinkActive="active">Famille</a>
          <a routerLink="/reservations" routerLinkActive="active">Mes réservations</a>
        </nav>
        <div class="me">
          <app-avatar [name]="me" [size]="28" />
          <span class="me-name">{{ me }}</span>
          <button class="link logout" type="button" (click)="logout()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9"/></svg>
            Se déconnecter
          </button>
        </div>
      }
    </header>
    <main class="page"><router-outlet /></main>
    @if (auth.user()) {
      <footer class="site-foot"><a routerLink="/news">✨ Nouveautés</a></footer>
    }
    @if (auth.user(); as me) {
      <nav class="tabbar" aria-label="Navigation principale">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" class="tab">
          <app-avatar [name]="me" [size]="26" />
          <span>Ma liste</span>
        </a>
        <a routerLink="/people" routerLinkActive="active" class="tab">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14c2.7 0 4.5 1.7 4.5 4.5"/></svg>
          <span>Famille</span>
        </a>
        <a routerLink="/reservations" routerLinkActive="active" class="tab">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>
          <span>Réservés</span>
        </a>
        <button type="button" class="tab-add" aria-label="Ajouter une idée" (click)="add()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
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
