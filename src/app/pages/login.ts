import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
      <p class="lead">Notre liste de souhaits familiale. Choisis ton prénom pour te connecter.</p>
      <form (ngSubmit)="submit()">
        <label>
          Qui es-tu ?
          <select name="name" required [ngModel]="name()" (ngModelChange)="pick($event)">
            <option value="" disabled>Choisis ton prénom…</option>
            @for (m of members(); track m) {
              <option [value]="m">{{ m }}</option>
            }
          </select>
        </label>
        @if (name() && isNew()) {
          <p class="hint">
            C'est ta première visite : entre le code secret de la famille, puis crée ton propre mot de passe.
          </p>
          <label>
            Code secret de la famille
            <input name="passcode" type="password" autocomplete="off" required [(ngModel)]="passcode" />
          </label>
          <label>
            Crée ton mot de passe (6 caractères minimum)
            <input name="newPassword" type="password" autocomplete="new-password" minlength="6" required [(ngModel)]="password" />
          </label>
          <label>
            Confirme ton mot de passe
            <input name="confirm" type="password" autocomplete="new-password" required [(ngModel)]="confirm" />
          </label>
        } @else if (name()) {
          <label>
            Mot de passe
            <input name="password" type="password" autocomplete="current-password" required [(ngModel)]="password" />
          </label>
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button type="submit" [disabled]="!canSubmit() || busy()">
          {{ busy() ? 'Connexion…' : isNew() ? 'Créer mon mot de passe' : 'Se connecter' }}
        </button>
      </form>
    </section>  `,
})
export class Login implements OnInit {
  private api = inject(Api);
  private auth = inject(Auth);
  private router = inject(Router);

  members = signal<string[]>([]);
  registered = signal<string[]>([]);
  name = signal('');
  passcode = signal('');
  password = signal('');
  confirm = signal('');
  busy = signal(false);
  error = signal('');

  isNew = computed(() => !!this.name() && !this.registered().includes(this.name()));
  canSubmit = computed(() =>
    this.isNew()
      ? !!this.passcode() && this.password().length >= 6 && this.confirm().length > 0
      : !!this.name() && !!this.password(),
  );

  async ngOnInit() {
    await this.auth.ensureLoaded();
    if (this.auth.user()) return this.router.navigateByUrl('/');
    await this.loadMembers();
    return;
  }

  pick(name: string) {
    this.name.set(name);
    this.passcode.set('');
    this.password.set('');
    this.confirm.set('');
    this.error.set('');
  }

  private async loadMembers() {
    try {
      const r = await this.api.members();
      this.members.set(r.members);
      this.registered.set(r.registered);
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  async submit() {
    this.error.set('');
    if (this.isNew() && this.password() !== this.confirm()) {
      this.error.set('Les deux mots de passe ne sont pas identiques');
      return;
    }
    this.busy.set(true);
    try {
      if (this.isNew()) await this.auth.register(this.name(), this.passcode(), this.password());
      else await this.auth.login(this.name(), this.password());
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.error.set(errorMessage(e));
      // Someone may have created (or lost) their password since the page loaded.
      if (e instanceof HttpErrorResponse && e.status === 409) await this.loadMembers();
    } finally {
      this.busy.set(false);
    }
  }
}