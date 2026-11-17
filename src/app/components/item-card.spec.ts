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

function render(item: Item, mode: 'own' | 'other' | 'reservation'): HTMLElement {
  const fixture: ComponentFixture<ItemCard> = TestBed.createComponent(ItemCard);
  fixture.componentRef.setInput('item', item);
  fixture.componentRef.setInput('mode', mode);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ItemCard', () => {
  it('shows only a remove button on your own list, even if claim flags leak in', () => {
    const el = render({ ...base, claimed: true, claimedByMe: false }, 'own');
    expect(el.textContent).not.toMatch(/réservé|occupe|occupes/i);
    expect(el.querySelector('.card.taken')).toBeNull();
    expect(Array.from(el.querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['Retirer']);
  });

  it('lets others claim an unclaimed item', () => {
    const el = render({ ...base, claimed: false, claimedByMe: false }, 'other');
    expect(el.querySelector('button')?.textContent).toContain("Je m'en occupe");
  });

  it('greys out items claimed by someone else, without naming them', () => {
    const el = render({ ...base, claimed: true, claimedByMe: false }, 'other');
    expect(el.querySelector('.card.taken')).not.toBeNull();
    expect(el.textContent).toContain('Déjà réservé');
    expect(el.querySelector('button')).toBeNull();
  });

  it('lets the claimer undo their own claim', () => {
    const el = render({ ...base, claimed: true, claimedByMe: true }, 'other');
    expect(el.textContent).toContain("Tu t'en occupes");
    expect(el.querySelector('button')?.textContent).toContain('Annuler');
  });

  it('flags a reservation whose owner removed it, and still lets the claimer cancel', () => {
    const el = render({ ...base, removed: true }, 'reservation');
    expect(el.textContent).toContain('Retiré de sa liste');
    expect(el.querySelector('.card.removed')).not.toBeNull();
    expect(el.querySelector('button')?.textContent).toContain('Annuler');
  });

  it('shows an active reservation as yours', () => {
    const el = render({ ...base, removed: false }, 'reservation');
    expect(el.textContent).toContain("Tu t'en occupes");
    expect(el.textContent).not.toContain('Retiré');
  });

  it('keeps a multi item available to others and names who is already on it', () => {
    const el = render({ ...base, multi: true, claimed: false, claimedByMe: false, claimers: ['Jade', 'Marie'] }, 'other');
    expect(el.querySelector('.card.taken')).toBeNull();
    expect(el.textContent).toContain('Jade, Marie');
    expect(el.querySelector('button')?.textContent).toContain("Je m'en occupe");
  });

  it('shows a multi item to its owner without any names', () => {
    const el = render({ ...base, multi: true }, 'own');
    expect(el.textContent).toContain("Plusieurs personnes peuvent l'offrir");
    expect(el.textContent).not.toMatch(/prévu par/);
  });});
