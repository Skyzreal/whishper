import { Component, computed, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { inject } from '@angular/core';
import { Api, errorMessage } from '../api';

@Component({
  selector: 'app-add-item',
  imports: [FormsModule],
  template: `
    @if (!open()) {
      <button type="button" class="add-toggle" (click)="open.set(true)">{{ forName() ? 'Ajouter à la liste ' + deNom() : 'Ajouter à ma liste' }}</button>
    } @else {
    <form class="panel add" (ngSubmit)="submit()" #f="ngForm">
      <div class="panel-head">
        <h2>Une nouvelle idée</h2>
        <button type="button" class="link" (click)="open.set(false)">Fermer</button>
      </div>
      <label>
        Lien <span class="hint">(si t'en as un)</span>
        <span class="row">
          <input name="url" type="url" inputmode="url" placeholder="https://…" [(ngModel)]="url" (paste)="onPaste()" (blur)="fetchDetails()" />
          <button type="button" class="secondary" [disabled]="!url() || fetching()" (click)="fetchDetails(true)">
            {{ fetching() ? 'Je regarde…' : 'Chercher les infos' }}
          </button>
        </span>
      </label>
      @if (hint()) {
        <p class="hint-note" role="status">{{ hint() }}</p>
      }
      @if (image()) {
        <div class="preview">
          <img [src]="image()" alt="" referrerpolicy="no-referrer" />
          <button type="button" class="link" (click)="image.set('')">Retirer l'image</button>
        </div>
      }
      <label>
        C'est quoi ?
        <input name="title" required maxlength="200" placeholder="Une couverture, une carte-cadeau…" [(ngModel)]="title" />
      </label>
      <div class="row two">
        <label>
          Prix <span class="hint">(si tu veux)</span>
          <input name="price" maxlength="50" placeholder="40 $, environ 50 $…" [(ngModel)]="price" />
        </label>
        <label>
          Précisions <span class="hint">(si tu veux)</span>
          <input name="note" maxlength="1000" placeholder="Taille, couleur, magasin…" [(ngModel)]="note" />
        </label>
      </div>
      <label class="check">
        <input type="checkbox" name="multi" [(ngModel)]="multi" />
        A cocher si c'est quelque chose qui se rachète ! Pour que plusieurs puissent l'offrir (carte-cadeau, par exemple)
      </label>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <button type="submit" [disabled]="!title().trim() || saving()">{{ saving() ? 'Ajout…' : 'Ajouter' }}</button>
    </form>
    }
  `,
})
export class AddItem {
  private api = inject(Api);
  added = output<void>();
  open = model(false);
  /** Set when adding to the list of someone you manage. */
  forName = input('');
  deNom = computed(() => (/^[aeiouyhàâéèêëîïôù]/i.test(this.forName()) ? "d'" : 'de ') + this.forName());

  url = signal('');
  title = signal('');
  price = signal('');
  note = signal('');
  multi = signal(false);
  image = signal('');
  fetching = signal(false);
  saving = signal(false);
  error = signal('');
  hint = signal('');
  private fetchedFor = '';

  onPaste() {
    setTimeout(() => this.fetchDetails());
  }

  async fetchDetails(force = false) {
    const url = this.url().trim();
    if (!url || this.fetching() || (!force && url === this.fetchedFor)) return;
    this.fetchedFor = url;
    this.fetching.set(true);
    this.error.set('');
    this.hint.set('');
    try {
      const p = await this.api.preview(url);
      if (p.title && (!this.title().trim() || force)) this.title.set(p.title);
      if (p.image) this.image.set(p.image);
      if (p.price && (!this.price().trim() || force)) this.price.set(p.price);
      if (p.partial) {
        this.hint.set(
          "Le site n'a pas voulu qu'on lise sa page. Vérifie le nom, puis ajoute le prix ou une précision si tu veux.",
        );
      }
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.fetching.set(false);
    }
  }

  async submit() {
    if (!this.title().trim()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.api.addItem({
        title: this.title().trim(),
        url: this.url().trim() || undefined,
        image: this.image() || undefined,
        price: this.price().trim() || undefined,
        note: this.note().trim() || undefined,
        forName: this.forName() || undefined,
        multi: this.multi() || undefined,
      });
      this.multi.set(false);
      for (const s of [this.url, this.title, this.price, this.note, this.image, this.hint]) s.set('');
      this.fetchedFor = '';
      this.open.set(false);
      this.added.emit();
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }
}
