import { TestBed } from '@angular/core/testing';
import { Avatar } from './avatar';

function initialOf(name: string): string {
  const fixture = TestBed.createComponent(Avatar);
  fixture.componentRef.setInput('name', name);
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).textContent?.trim() ?? '';
}

describe('Avatar', () => {
  it('uses the first letter, including accented ones', () => {
    expect(initialOf('Orélie')).toBe('O');
    expect(initialOf('Élodie')).toBe('É');
    expect(initialOf('Ste\u0301phanie')).toBe('S');
  });
});
