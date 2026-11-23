import { Routes } from '@angular/router';
import { authGuard } from './auth';
import { Login } from './pages/login';
import { MyList } from './pages/my-list';
import { News } from './pages/news';
import { People } from './pages/people';
import { PersonPage } from './pages/person';
import { Reservations } from './pages/reservations';

export const routes: Routes = [
  { path: 'login', component: Login, title: 'Connexion · Whishper' },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', component: MyList, title: 'Ma liste · Whishper' },
      { path: 'people', component: People, title: 'Famille · Whishper' },
      { path: 'reservations', component: Reservations, title: 'Mes réservations · Whishper' },
      { path: 'news', component: News, title: 'Nouveautés · Whishper' },
      { path: 'people/:name', component: PersonPage, title: 'Liste · Whishper' },
    ],
  },
  { path: '**', redirectTo: '' },
];
