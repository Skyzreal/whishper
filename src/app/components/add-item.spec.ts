import { TestBed } from '@angular/core/testing';
import { Api } from '../api';
import { Item } from '../models';
import { dataUrlBytes, fitSize } from '../image-compress';
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

  it('can add a picture-only item, and blocks an empty one', async () => {
    const addItem = vi.fn().mockResolvedValue({});
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: { addItem } }] });
    const fixture = TestBed.createComponent(AddItem);
    const cmp = fixture.componentInstance;
    cmp.open.set(true);
    fixture.detectChanges();
    const submit = () => fixture.nativeElement.querySelector('button[type=submit]') as HTMLButtonElement;
    expect(submit().disabled).toBe(true);

    cmp.photo.set('data:image/jpeg;base64,/9j/AAAA');
    fixture.detectChanges();
    expect(submit().disabled).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Changer la photo');
    await cmp.submit();

    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ title: undefined, picture: 'data:image/jpeg;base64,/9j/AAAA' }));
    expect(cmp.photo()).toBeNull();
  });

  it('removes the uploaded picture of an item, and leaves it alone otherwise', async () => {
    const updateItem = vi.fn().mockResolvedValue({});
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: { updateItem } }] });
    const fixture = TestBed.createComponent(AddItem);
    fixture.componentRef.setInput('item', { ...item, hasPicture: true, image: '/api/items/7/picture?v=1' });
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    expect(cmp.previewPicture()).toBe('/api/items/7/picture?v=1');

    await cmp.submit();
    const untouched = updateItem.mock.calls[0][1];
    expect('picture' in untouched).toBe(false);
    expect('image' in untouched).toBe(false);

    cmp.removePhoto();
    await cmp.submit();
    expect(updateItem.mock.calls[1][1]).toMatchObject({ picture: null });
  });
});

describe('image compression helpers', () => {
  it('scales the longest side down to the limit and never up', () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 1000, height: 750 });
    expect(fitSize(600, 1200)).toEqual({ width: 500, height: 1000 });
    expect(fitSize(300, 200)).toEqual({ width: 300, height: 200 });
  });

  it('measures the decoded size of a data URL', () => {
    expect(dataUrlBytes('data:image/jpeg;base64,QUJD')).toBe(3);
    expect(dataUrlBytes('data:image/jpeg;base64,QUI=')).toBe(2);
  });
});
