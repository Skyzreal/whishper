import { Component, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { inject } from '@angular/core';
import { Api, errorMessage } from '../api';

@Component({
  selector: 'app-add-item',
  imports: [FormsModule],
  template: `
    <form class="panel add" (ngSubmit)="submit()" #f="ngForm">
      <h2>Add something you'd love</h2>
      <label>
        Link <span class="hint">(optional – paste a product page from any shop)</span>
        <span class="row">
          <input name="url" type="url" inputmode="url" placeholder="https://…" [(ngModel)]="url" (paste)="onPaste()" (blur)="fetchDetails()" />
          <button type="button" class="secondary" [disabled]="!url() || fetching()" (click)="fetchDetails(true)">
            {{ fetching() ? 'Fetching…' : 'Fetch details' }}
          </button>
        </span>
      </label>
      @if (image()) {
        <div class="preview">
          <img [src]="image()" alt="" referrerpolicy="no-referrer" />
          <button type="button" class="link" (click)="image.set('')">Remove picture</button>
        </div>
      }
      <label>
        What is it?
        <input name="title" required maxlength="200" placeholder="e.g. Cozy blanket, or Gift card" [(ngModel)]="title" />
      </label>
      <div class="row two">
        <label>
          Price / amount <span class="hint">(optional)</span>
          <input name="price" maxlength="50" placeholder="e.g. $40 or around $50" [(ngModel)]="price" />
        </label>
        <label>
          Notes <span class="hint">(optional)</span>
          <input name="note" maxlength="1000" placeholder="Size, colour, which store…" [(ngModel)]="note" />
        </label>
      </div>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <button type="submit" [disabled]="!title().trim() || saving()">{{ saving() ? 'Adding…' : 'Add to my list' }}</button>
    </form>
  `,
})
export class AddItem {
  private api = inject(Api);
  added = output<void>();

  url = signal('');
  title = signal('');
  price = signal('');
  note = signal('');
  image = signal('');
  fetching = signal(false);
  saving = signal(false);
  error = signal('');
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
    try {
      const p = await this.api.preview(url);
      if (!this.title().trim() || force) this.title.set(p.title);
      if (p.image) this.image.set(p.image);
      if (p.price && (!this.price().trim() || force)) this.price.set(p.price);
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
      });
      for (const s of [this.url, this.title, this.price, this.note, this.image]) s.set('');
      this.fetchedFor = '';
      this.added.emit();
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }
}
