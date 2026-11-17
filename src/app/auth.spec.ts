import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authGuard } from './auth';

@Component({ template: 'secret' })
class Secret {}

@Component({ template: 'login page' })
class LoginStub {}

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([
        { path: 'login', component: LoginStub },
        { path: '', canActivate: [authGuard], component: Secret },
      ]),
    ],
  });
  return { http: TestBed.inject(HttpTestingController), router: TestBed.inject(Router) };
}

describe('authGuard', () => {
  it('redirects to /login when not signed in (inject must work after the async session check)', async () => {
    const { http, router } = setup();
    const nav = router.navigateByUrl('/');
    await new Promise((r) => setTimeout(r));
    http.expectOne('/api/me').flush({ error: 'Please sign in' }, { status: 401, statusText: 'Unauthorized' });
    expect(await nav).toBe(true);
    expect(router.url).toBe('/login');
  });

  it('lets signed-in people through', async () => {
    const { http, router } = setup();
    const nav = router.navigateByUrl('/');
    await new Promise((r) => setTimeout(r));
    http.expectOne('/api/me').flush({ name: 'Alice' });
    expect(await nav).toBe(true);
    expect(router.url).toBe('/');
  });
});
