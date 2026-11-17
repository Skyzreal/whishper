import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api, errorMessage } from '../api';
import { Auth } from '../auth';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <section class="panel login">
      <h1>🎁 Whishper</h1>
      <p class="lead">Notre liste de souhaits familiale. Choisis ton prénom et entre le code secret de la famille.</p>
      <form (ngSubmit)="submit()">
        <label>
          Qui es-tu ?
          <select name="name" required [(ngModel)]="name">
            <option value="" disabled>Choisis ton prénom…</option>
            @for (m of members(); track m) {
              <option [value]="m">{{ m }}</option>
            }
          </select>
        </label>
        <label>
          Code secret de la famille
          <input name="passcode" type="password" autocomplete="current-password" required [(ngModel)]="passcode" />
        </label>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button type="submit" [disabled]="!name() || !passcode() || busy()">{{ busy() ? 'Connexion…' : 'Se connecter' }}</button>
      </form>
    </section>
  `,
})
export class Login implements OnInit {
  private api = inject(Api);
  private auth = inject(Auth);
  private router = inject(Router);

  members = signal<string[]>([]);
  name = signal('');
  passcode = signal('');
  busy = signal(false);
  error = signal('');

  async ngOnInit() {
    await this.auth.ensureLoaded();
    if (this.auth.user()) return this.router.navigateByUrl('/');
    try {
      this.members.set(await this.api.members());
    } catch (e) {
      this.error.set(errorMessage(e));
    }
    return;
  }

  async submit() {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.name(), this.passcode());
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
