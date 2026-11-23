import { Component, OnInit, inject } from '@angular/core';
import { RELEASES, formatReleaseDate } from '../release-notes';
import { WhatsNew } from '../whats-new';

@Component({
  selector: 'app-news',
  template: `
    <header class="hero">
      <div>
        <h1>Nouveautés</h1>
        <p>Ce qui change dans Whishper, de la plus récente à la plus ancienne</p>
      </div>
    </header>
    <div class="releases">
      @for (r of releases; track r.version; let first = $first) {
        <section class="release" [attr.aria-labelledby]="'v' + r.version">
          <h2 [id]="'v' + r.version">
            <span class="ver">v{{ r.version }}</span>
            {{ r.title }}
            @if (first) {
              <span class="badge mine">Dernière version</span>
            }
          </h2>
          <time class="release-date" [attr.datetime]="r.date">{{ date(r.date) }}</time>
          <ul>
            @for (n of r.notes; track n) {
              <li>{{ n }}</li>
            }
          </ul>
        </section>
      }
    </div>
  `,
})
export class News implements OnInit {
  private whatsNew = inject(WhatsNew);
  protected releases = RELEASES;
  protected date = formatReleaseDate;

  ngOnInit() {
    this.whatsNew.markSeen();
  }
}
