import { TestBed } from '@angular/core/testing';
import { hasUnseen, LATEST_VERSION, RELEASES } from './release-notes';
import { WhatsNew } from './whats-new';
import { News } from './pages/news';

describe('release notes', () => {
  it('lists the newest version first, with unique versions and dates in order', () => {
    expect(RELEASES[0].version).toBe(LATEST_VERSION);
    expect(new Set(RELEASES.map((r) => r.version)).size).toBe(RELEASES.length);
    const dates = RELEASES.map((r) => r.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(RELEASES.every((r) => r.notes.length > 0)).toBe(true);
  });

  it('shows the dot until the latest version has been seen', () => {
    expect(hasUnseen(null)).toBe(true);
    expect(hasUnseen('0.9')).toBe(true);
    expect(hasUnseen(LATEST_VERSION)).toBe(false);
    expect(hasUnseen('1.0', '1.1')).toBe(true);
  });

  it('remembers the seen version on this device when the page is opened', () => {
    localStorage.clear();
    const fixture = TestBed.createComponent(News);
    expect(TestBed.inject(WhatsNew).unseen()).toBe(true);
    fixture.detectChanges();
    const versions = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.ver')).map((e) => e.textContent?.trim());
    expect(versions[0]).toBe(`v${LATEST_VERSION}`);
    expect(TestBed.inject(WhatsNew).unseen()).toBe(false);
    expect(localStorage.getItem('whishper:seen-version')).toBe(LATEST_VERSION);
  });
});
