import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ItemCard } from './item-card';
import { Item } from '../models';

const base: Item = {
  id: 1,
  owner: 'Alice',
  title: 'Cozy socks',
  url: 'https://www.shop.example/socks',
  image: null,
  price: '$12',
  note: null,
  createdAt: '2026-01-01T00:00:00Z',
};

function render(item: Item, mode: 'own' | 'other'): HTMLElement {
  const fixture: ComponentFixture<ItemCard> = TestBed.createComponent(ItemCard);
  fixture.componentRef.setInput('item', item);
  fixture.componentRef.setInput('mode', mode);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ItemCard', () => {
  it('shows only a remove button on your own list, even if claim flags leak in', () => {
    const el = render({ ...base, claimed: true, claimedByMe: false }, 'own');
    expect(el.textContent).not.toMatch(/taken|getting this|get this/i);
    expect(el.querySelector('.card.taken')).toBeNull();
    expect(Array.from(el.querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['Remove']);
  });

  it('lets others claim an unclaimed item', () => {
    const el = render({ ...base, claimed: false, claimedByMe: false }, 'other');
    expect(el.querySelector('button')?.textContent).toContain("I'll get this");
  });

  it('greys out items claimed by someone else, without naming them', () => {
    const el = render({ ...base, claimed: true, claimedByMe: false }, 'other');
    expect(el.querySelector('.card.taken')).not.toBeNull();
    expect(el.textContent).toContain('Already taken');
    expect(el.querySelector('button')).toBeNull();
  });

  it('lets the claimer undo their own claim', () => {
    const el = render({ ...base, claimed: true, claimedByMe: true }, 'other');
    expect(el.textContent).toContain("You're getting this");
    expect(el.querySelector('button')?.textContent).toContain('Undo');
  });
});
