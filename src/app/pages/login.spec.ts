import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Login } from './login';

@Component({ template: 'home' })
class Home {}

async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  await fixture.whenStable();
  fixture.detectChanges();
}

async function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([{ path: '', component: Home }])],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(Login);
  fixture.detectChanges();
  await new Promise((r) => setTimeout(r));
  http.expectOne('/api/me').flush({ error: 'Please sign in' }, { status: 401, statusText: 'Unauthorized' });
  await new Promise((r) => setTimeout(r));
  http.expectOne('/api/members').flush({ members: ['Alice', 'Bob'], registered: ['Alice'] });
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const type = async (name: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle(fixture);
  };
  const click = async (sel: string) => {
    el.querySelector<HTMLButtonElement>(sel)!.click();
    await settle(fixture);
  };
  const pick = async (name: string) => {
    const select = el.querySelector<HTMLSelectElement>('select')!;
    select.value = name;
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
  };
  return { http, fixture, el, type, click, pick, router: TestBed.inject(Router) };
}

describe('Login: forgotten password', () => {
  it('only offers the reset link to people who already have a password', async () => {
    const { el, pick } = await setup();
    await pick('Bob');
    expect(el.querySelector('button.forgot')).toBeNull();
    await pick('Alice');
    expect(el.querySelector('button.forgot')?.textContent).toContain('Mot de passe oublié');
  });

  it('asks for the family code and a confirmed new password, then sends the reset', async () => {
    const { http, el, type, click, pick, fixture, router } = await setup();
    await pick('Alice');
    expect(el.querySelector('input[name="passcode"]')).toBeNull();
    await click('button.forgot');
    expect(el.querySelector('input[name="passcode"]')).not.toBeNull();
    expect(el.querySelector<HTMLButtonElement>('button[type="submit"]')!.textContent).toContain('Changer mon mot de passe');

    await type('passcode', 'code-famille');
    await type('newPassword', 'nouveau-secret');
    await type('confirm', 'autre-chose');
    await click('button[type="submit"]');
    expect(el.querySelector('.error')?.textContent).toContain('pas identiques');
    http.expectNone('/api/reset-password');

    await type('confirm', 'nouveau-secret');
    await click('button[type="submit"]');
    const req = http.expectOne('/api/reset-password');
    expect(req.request.body).toEqual({ name: 'Alice', passcode: 'code-famille', password: 'nouveau-secret' });
    req.flush({ name: 'Alice' });
    await settle(fixture);
    expect(router.url).toBe('/');
  });

  it('shows the server error and can go back to the normal sign-in', async () => {
    const { http, el, type, click, pick, fixture } = await setup();
    await pick('Alice');
    await click('button.forgot');
    await type('passcode', 'faux');
    await type('newPassword', 'nouveau-secret');
    await type('confirm', 'nouveau-secret');
    await click('button[type="submit"]');
    http
      .expectOne('/api/reset-password')
      .flush({ error: 'Prénom ou code secret de la famille incorrect' }, { status: 401, statusText: 'Unauthorized' });
    await new Promise((r) => setTimeout(r));
    await settle(fixture);
    expect(el.querySelector('.error')?.textContent).toContain('code secret');

    await click('button.forgot');
    expect(el.querySelector('input[name="passcode"]')).toBeNull();
    expect(el.querySelector('input[name="password"]')).not.toBeNull();
    expect(el.querySelector('.error')).toBeNull();
  });
});
