import { Injectable, computed, signal } from '@angular/core';
import { LATEST_VERSION, hasUnseen } from './release-notes';

const KEY = 'whishper:seen-version';

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Remembers, on this device only, the last version of the news that was opened. */
@Injectable({ providedIn: 'root' })
export class WhatsNew {
  private seen = signal<string | null>(read());
  readonly unseen = computed(() => hasUnseen(this.seen()));

  markSeen() {
    this.seen.set(LATEST_VERSION);
    try {
      localStorage.setItem(KEY, LATEST_VERSION);
    } catch {
      // Private mode: the dot just goes away for this visit.
    }
  }
}
