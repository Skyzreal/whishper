import { Routes } from '@angular/router';
import { authGuard } from './auth';
import { Login } from './pages/login';
import { MyList } from './pages/my-list';
import { People } from './pages/people';
import { PersonPage } from './pages/person';

export const routes: Routes = [
  { path: 'login', component: Login, title: 'Connexion · Whishper' },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', component: MyList,       title: 'Ma liste de souhaits · Whishper' },
            { path: 'people', component: People, title: 'Famille · Whishper' },
            { path: 'people/:name', component: PersonPage, title: 'Liste de souhaits · Whishper' },
    ],
  },
  { path: '**', redirectTo: '' },
];
