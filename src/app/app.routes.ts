import { Routes } from '@angular/router';
import { authGuard } from './auth';
import { Login } from './pages/login';
import { MyList } from './pages/my-list';
import { People } from './pages/people';
import { PersonPage } from './pages/person';

export const routes: Routes = [
  { path: 'login', component: Login, title: 'Sign in · Whishper' },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', component: MyList, title: 'My wishlist · Whishper' },
      { path: 'people', component: People, title: 'Family · Whishper' },
      { path: 'people/:name', component: PersonPage, title: 'Wishlist · Whishper' },
    ],
  },
  { path: '**', redirectTo: '' },
];
