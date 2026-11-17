import { Injectable, signal } from '@angular/core';

/** Lets the bottom "Ajouter" tab ask the list page to open its add form. */
@Injectable({ providedIn: 'root' })
export class AddRequest {
  readonly count = signal(0);

  ask() {
    this.count.update((n) => n + 1);
  }
}
