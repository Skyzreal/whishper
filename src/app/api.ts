import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Item, NewItem, PersonList, Person, Preview } from './models';

export function errorMessage(e: unknown): string {
  if (e instanceof HttpErrorResponse) return e.error?.error ?? 'Une erreur est survenue. Réessaie.';
  return 'Une erreur est survenue. Réessaie.';
}

@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);

  members = () => firstValueFrom(this.http.get<{ members: string[] }>('/api/members')).then((r) => r.members);
  me = () => firstValueFrom(this.http.get<{ name: string }>('/api/me'));
  login = (name: string, passcode: string) =>
    firstValueFrom(this.http.post<{ name: string }>('/api/login', { name, passcode }));
  logout = () => firstValueFrom(this.http.post('/api/logout', {}));

  people = () => firstValueFrom(this.http.get<{ me: string; people: Person[] }>('/api/people'));
  personList = (name: string) =>
    firstValueFrom(this.http.get<PersonList>(`/api/people/${encodeURIComponent(name)}/items`));
  reservations = () => firstValueFrom(this.http.get<{ items: Item[] }>('/api/reservations')).then((r) => r.items);
  myItems = () => firstValueFrom(this.http.get<{ items: Item[] }>('/api/items')).then((r) => r.items);

  addItem = (item: NewItem) => firstValueFrom(this.http.post<{ item: Item }>('/api/items', item));
  removeItem = (id: number) => firstValueFrom(this.http.delete(`/api/items/${id}`));
  preview = (url: string) => firstValueFrom(this.http.post<Preview>('/api/preview', { url }));

  claim = (id: number) => firstValueFrom(this.http.post(`/api/items/${id}/claim`, {}));
  unclaim = (id: number) => firstValueFrom(this.http.delete(`/api/items/${id}/claim`));
}
