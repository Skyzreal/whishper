import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { Api } from './api';

@Injectable({ providedIn: 'root' })
export class Auth {
  private api = inject(Api);
  readonly user = signal<string | null>(null);
  private loading?: Promise<void>;

  ensureLoaded(): Promise<void> {
    this.loading ??= this.api
      .me()
      .then((r) => this.user.set(r.name))
      .catch(() => this.user.set(null));
    return this.loading;
  }

  async login(name: string, passcode: string): Promise<void> {
    const r = await this.api.login(name, passcode);
    this.loading = Promise.resolve();
    this.user.set(r.name);
  }

  async logout(): Promise<void> {
    await this.api.logout().catch(() => undefined);
    this.user.set(null);
  }
}

export const authGuard: CanActivateFn = async () => {
  // inject() only works synchronously, so resolve everything before the first await.
  const auth = inject(Auth);
  const router = inject(Router);
  await auth.ensureLoaded();
  return auth.user() ? true : router.createUrlTree(['/login']);
};

/** If the session expires mid-use, drop back to the login screen. */
export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const router = inject(Router);
  return next(req).pipe(
    catchError((e: unknown) => {
      const isAuthCall = /\/api\/(login|me|members)$/.test(req.url);
      if (e instanceof HttpErrorResponse && e.status === 401 && !isAuthCall) {
        auth.user.set(null);
        router.navigateByUrl('/login');
      }
      return throwError(() => e);
    }),
  );
};
