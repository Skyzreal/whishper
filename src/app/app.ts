import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from './auth';
import { Avatar } from './components/avatar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Avatar],
  template: `
    <header class="topbar">
      <a routerLink="/" class="brand">🎁 Whishper</a>
      @if (auth.user(); as me) {
        <nav>
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">My list</a>
          <a routerLink="/people" routerLinkActive="active">Family</a>
        </nav>
        <div class="me">
          <app-avatar [name]="me" [size]="28" />
          <span class="me-name">{{ me }}</span>
          <button class="link" type="button" (click)="logout()">Sign out</button>
        </div>
      }
    </header>
    <main class="page"><router-outlet /></main>
  `,
})
export class App {
  protected auth = inject(Auth);
  private router = inject(Router);

  protected async logout() {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
