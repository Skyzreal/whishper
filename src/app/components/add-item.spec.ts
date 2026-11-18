import { TestBed } from '@angular/core/testing';
import { Api } from '../api';
import { Item } from '../models';
import { AddItem } from './add-item';

const item: Item = {
  id: 7,
  owner: 'Alice',
  title: 'Cozy socks',
  url: 'https://www.shop.example/socks',
  image: null,
  price: '$12',
  note: 'bleu',
  favorite: true,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('AddItem in edit mode', () => {
  it('prefills the form and saves the changes through updateItem', async () => {
    const updateItem = vi.fn().mockResolvedValue({});
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: { updateItem } }] });
    const fixture = TestBed.createComponent(AddItem);
    fixture.componentRef.setInput('item', item);
    let saved = 0;
    fixture.componentInstance.saved.subscribe(() => saved++);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h2')?.textContent).toContain("Modifier l'idée");
    expect(fixture.componentInstance.title()).toBe('Cozy socks');
    expect(fixture.componentInstance.favorite()).toBe(true);

    fixture.componentInstance.title.set('Warm socks');
    fixture.componentInstance.note.set('');
    await fixture.componentInstance.submit();

    expect(updateItem).toHaveBeenCalledWith(7, expect.objectContaining({ title: 'Warm socks', note: '', favorite: true }));
    expect(saved).toBe(1);
  });
});
