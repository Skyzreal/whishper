import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { Auth } from './auth';
import { LATEST_VERSION, RELEASES } from './release-notes';
import { News } from './pages/news';

describe('release notes', () => {
  it('lists the newest version first, with unique versions and dates in order', () => {
    expect(RELEASES[0].version).toBe(LATEST_VERSION);
    expect(new Set(RELEASES.map((r) => r.version)).size).toBe(RELEASES.length);
    const dates = RELEASES.map((r) => r.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(RELEASES.every((r) => r.notes.length > 0)).toBe(true);
  });

  it('renders the latest version at the top of the page', () => {
    const fixture = TestBed.createComponent(News);
    fixture.detectChanges();
    const versions = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.ver')).map((e) => e.textContent?.trim());
    expect(versions[0]).toBe(`v${LATEST_VERSION}`);
    expect(versions.length).toBe(RELEASES.length);
  });

  it('links to the news from the page footer only, not from the navigation', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Auth, useValue: { user: () => 'Jade', logout: async () => {} } }],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.site-foot a[href="/news"]')).not.toBeNull();
    expect(el.querySelectorAll('a[href="/news"]').length).toBe(1);
    expect(el.querySelector('nav a[href="/news"]')).toBeNull();
  });
});
