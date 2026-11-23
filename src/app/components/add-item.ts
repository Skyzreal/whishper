import { Component, computed, input, model, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { inject } from '@angular/core';
import { Api, errorMessage } from '../api';
import { Item } from '../models';
import { compressImage } from '../image-compress';

@Component({
  selector: 'app-add-item',
  imports: [FormsModule],
  template: `
    @if (!open() && !item()) {
      <button type="button" class="add-toggle" (click)="open.set(true)">{{ forName() ? 'Ajouter à la liste ' + deNom() : 'Ajouter à ma liste' }}</button>
    } @else {
    <form class="panel add" (ngSubmit)="submit()" (paste)="onFormPaste($event)"
      (dragover)="onDragOver($event)" (dragleave)="onDragLeave($event)" (drop)="onDrop($event)" #f="ngForm">
      <div class="panel-head">
        <h2>{{ item() ? "Modifier l'idée" : 'Une nouvelle idée' }}</h2>
        <button type="button" class="link" (click)="close()">{{ item() ? 'Annuler' : 'Fermer' }}</button>
      </div>
      <div class="photo" [class.dragging]="dragging()">
        @if (previewPicture()) {
          <div class="photo-preview">
            <img [src]="previewPicture()" alt="Aperçu de ta photo" />
            <button type="button" class="link" (click)="removePhoto()">Retirer la photo</button>
          </div>
        }
        <button type="button" class="photo-btn" [disabled]="photoBusy()" (click)="gallery.click()">
          {{ photoBusy() ? 'Préparation de la photo…' : dragging() ? 'Lâche la photo ici' : previewPicture() ? 'Changer la photo' : 'Ajouter une photo' }}
        </button>
        <p class="drop-hint">ou glisse une image ici</p>
        <button type="button" class="link camera-link" [disabled]="photoBusy()" (click)="camera.click()">Prendre une photo</button>
        <input #gallery type="file" accept="image/*" hidden (change)="pickPhoto($event)" />
        <input #camera type="file" accept="image/*" capture="environment" hidden (change)="pickPhoto($event)" />
        @if (photoError()) {
          <p class="error" role="alert">{{ photoError() }}</p>
        }
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
      @if (image() && !previewPicture()) {
        <div class="preview">
          <img [src]="image()" alt="" referrerpolicy="no-referrer" />
          <button type="button" class="link" (click)="image.set('')">Retirer l'image</button>
        </div>
      }
      <label>
        C'est quoi ? <span class="hint">(facultatif si tu mets une photo ou un lien)</span>
        <input name="title" maxlength="200" placeholder="Une couverture, une carte-cadeau…" [(ngModel)]="title" />
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
      <label class="check">
        <input type="checkbox" name="favorite" [(ngModel)]="favorite" />
        Coup de cœur ! Ça passe en haut de la liste, avec une étoile
      </label>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <button type="submit" [disabled]="!canSubmit() || saving() || photoBusy()">{{ submitLabel() }}</button>
    </form>
    }
  `,
})
export class AddItem implements OnInit {
  private api = inject(Api);
  added = output<void>();
  open = model(false);
  /** Set to edit an existing idea instead of adding one. */
  item = input<Item | null>(null);
  saved = output<void>();
  cancelled = output<void>();
  /** Set when adding to the list of someone you manage. */
  forName = input('');
  deNom = computed(() => (/^[aeiouyhàâéèêëîïôù]/i.test(this.forName()) ? "d'" : 'de ') + this.forName());

  url = signal('');
  title = signal('');
  price = signal('');
  note = signal('');
  multi = signal(false);
  favorite = signal(false);
  image = signal('');
  /** A freshly chosen picture (already compressed), as a data URL. */
  photo = signal<string | null>(null);
  /** The picture an item being edited already has. */
  private existingPicture = signal<string | null>(null);
  private pictureRemoved = signal(false);
  photoBusy = signal(false);
  photoError = signal('');
  previewPicture = computed(() => this.photo() ?? (this.pictureRemoved() ? null : this.existingPicture()));
  protected canSubmit = computed(() => !!(this.title().trim() || this.url().trim() || this.previewPicture()));
  private initialImage = '';
  fetching = signal(false);
  saving = signal(false);
  error = signal('');
  hint = signal('');
  private fetchedFor = '';

  protected submitLabel = computed(() => {
    if (this.item()) return this.saving() ? 'Enregistrement…' : 'Enregistrer';
    return this.saving() ? (this.photo() ? 'Envoi de la photo…' : 'Ajout…') : 'Ajouter';
  });

  ngOnInit() {
    const it = this.item();
    if (!it) return;
    this.title.set(it.title);
    this.url.set(it.url ?? '');
    // An uploaded picture is shown through `existingPicture`; `image` only ever holds a link preview.
    if (it.hasPicture) this.existingPicture.set(it.image);
    else this.image.set(it.image ?? '');
    this.initialImage = this.image();
    this.price.set(it.price ?? '');
    this.note.set(it.note ?? '');
    this.multi.set(!!it.multi);
    this.favorite.set(!!it.favorite);
    this.fetchedFor = (it.url ?? '').trim();
  }

  close() {
    if (this.item()) this.cancelled.emit();
    else this.open.set(false);
  }

  onPaste() {
    setTimeout(() => this.fetchDetails());
  }

  onFormPaste(event: ClipboardEvent) {
    const file = Array.from(event.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    event.preventDefault();
    void this.usePhoto(file);
  }

  dragging = signal(false);

  private hasFiles(event: DragEvent) {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files');
  }

  onDragOver(event: DragEvent) {
    if (!this.hasFiles(event)) return;
    // Without this the browser would navigate to the dropped file.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.dragging.set(true);
  }

  onDragLeave(event: DragEvent) {
    const form = event.currentTarget as HTMLElement;
    if (!form.contains(event.relatedTarget as Node | null)) this.dragging.set(false);
  }

  onDrop(event: DragEvent) {
    if (!this.hasFiles(event)) return;
    event.preventDefault();
    this.dragging.set(false);
    const file = Array.from(event.dataTransfer?.files ?? []).find((f) => f.type.startsWith('image/'));
    if (file) void this.usePhoto(file);
    else this.photoError.set("Ce fichier n'est pas une image que je sais lire");
  }

  pickPhoto(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.usePhoto(file);
  }

  private async usePhoto(file: File) {
    this.photoBusy.set(true);
    this.photoError.set('');
    try {
      this.photo.set(await compressImage(file));
    } catch (e) {
      this.photoError.set(e instanceof Error ? e.message : "Impossible de lire cette photo");
    } finally {
      this.photoBusy.set(false);
    }
  }

  removePhoto() {
    this.photo.set(null);
    this.photoError.set('');
    if (this.existingPicture()) this.pictureRemoved.set(true);
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
    if (!this.canSubmit()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const existing = this.item();
      if (existing) {
        const picture = this.photo() ?? (this.pictureRemoved() ? null : undefined);
        await this.api.updateItem(existing.id, {
          title: this.title().trim(),
          url: this.url().trim(),
          // Left out when untouched: an item with an uploaded picture has no editable link preview here.
          ...(this.image() !== this.initialImage ? { image: this.image() } : {}),
          ...(picture !== undefined ? { picture } : {}),
          price: this.price().trim(),
          note: this.note().trim(),
          multi: this.multi(),
          favorite: this.favorite(),
        });
        this.saved.emit();
        return;
      }
      await this.api.addItem({
        title: this.title().trim() || undefined,
        url: this.url().trim() || undefined,
        image: this.image() || undefined,
        picture: this.photo() ?? undefined,
        price: this.price().trim() || undefined,
        note: this.note().trim() || undefined,
        forName: this.forName() || undefined,
        multi: this.multi() || undefined,
        favorite: this.favorite() || undefined,
      });
      this.multi.set(false);
      this.favorite.set(false);
      for (const s of [this.url, this.title, this.price, this.note, this.image, this.hint]) s.set('');
      this.photo.set(null);
      this.photoError.set('');
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
