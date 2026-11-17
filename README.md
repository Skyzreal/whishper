# Whishper

Une liste de souhaits familiale et privée, pour une famille qui veut **offrir des cadeaux sans tirage au sort**
(pas de style Pikaddo avec une personne assignée au hasard) et **sans clavardage de groupe rempli de « j'ai acheté ça »**.

L'application est entièrement en français. Les prénoms de la famille se configurent dans `FAMILY_MEMBERS`.

- Chaque personne a sa propre liste, clairement identifiée. Tu peux consulter la liste de chacun depuis la page **Famille**.
- Ajoute des cadeaux d'où tu veux : colle un lien de produit (le titre, l'image et le prix sont récupérés automatiquement
  quand la boutique le permet) ou écris simplement ce que tu veux, par exemple *« Carte-cadeau – n'importe quel magasin, environ 50 $ »*.
- **Réserve des cadeaux à la Amazon.** Clique sur **« Je m'en occupe »** sur le cadeau de quelqu'un d'autre. Tout le monde
  le voit alors grisé avec la mention *Déjà réservé*, donc personne n'achète en double, et tu peux **Annuler** en tout temps.
- **La personne concernée ne le saura jamais.** Elle ne voit jamais quels cadeaux sont réservés, ni par qui, pour que la surprise reste entière.
  Personne (même pas les autres membres de la famille) ne peut voir *qui* a réservé un cadeau. Seul toi sais que c'est le tien.

## Comment la confidentialité fonctionne

Les réservations sont stockées dans une table `claims` séparée, et une seule fonction décide de ce que chacun peut voir :
`getListForViewer` dans [`server/items.ts`](server/items.ts).

| Qui regarde | Ce qu'il voit |
| --- | --- |
| Le propriétaire de la liste | Seulement les cadeaux. La réponse ne contient **aucun** champ lié aux réservations, et la table des réservations n'est même pas interrogée. |
| Un autre membre de la famille | Chaque cadeau, plus `claimed` (vrai/faux) et `claimedByMe`. Le nom de la personne qui a réservé n'est jamais envoyé à qui que ce soit. |

Autres garanties, toutes couvertes par les tests de [`server/app.test.ts`](server/app.test.ts) :

- La liste d'un propriétaire est identique avant et après qu'un cadeau soit réservé ou annulé.
- Un propriétaire ne peut pas réserver ses propres cadeaux, et tenter d'annuler ne révèle rien (la réponse est toujours la même).
- Seule la personne qui a réservé peut annuler sa réservation. Retirer un cadeau réservé ne laisse aucune trace côté propriétaire (voir ci-dessous).

### Quand quelqu'un retire un cadeau que tu as réservé

Le cadeau disparaît de la liste du propriétaire et de celle des autres, mais il reste dans **Mes réservations**, marqué « Retiré de sa liste », pour que tu saches de ne pas l'acheter. Un clic sur **Annuler** le fait disparaître pour de bon.

Côté technique : s'il y a une réservation, deleteOwnItem ne supprime pas la ligne, elle pose seulement deleted_at (suppression logique). Si personne n'a réservé, la ligne est supprimée pour de vrai. Dans les deux cas, la réponse envoyée au propriétaire est identique ({ "ok": true }), et toutes les requêtes qui le concernent ignorent les cadeaux dont deleted_at est défini. Quand la personne qui a réservé annule, la ligne retirée est supprimée définitivement. Les bases de données existantes reçoivent la colonne deleted_at automatiquement au démarrage.

> Remarque : la personne qui a accès au tableau de bord de l'hébergement ou à la base de données peut évidemment lire la table `claims`.
> La règle de confidentialité protège les membres de la famille qui utilisent l'application, pas la personne qui l'administre.

## Technologies

- **Interface :** [Angular](https://angular.dev) (composants autonomes, signaux, sans zone), application monopage statique.
- **API :** petite application [Express](https://expressjs.com) + TypeScript dans [`server/`](server). Sur Vercel, elle tourne comme une seule
  fonction serverless ([`api/index.ts`](api/index.ts)) ; ailleurs, c'est un simple serveur Node.
- **Base de données :** [libSQL](https://github.com/tursodatabase/libsql) (SQLite). Un fichier local en développement, une base
  [Turso](https://turso.tech) gratuite en production. Le schéma est créé automatiquement.
- **Connexion :** chacun a **son propre mot de passe**. À la toute première visite, tu choisis ton prénom, tu entres le code secret de la famille (preuve que tu en fais partie) puis tu crées ton mot de passe. Ensuite, prénom + mot de passe suffisent. Les mots de passe sont stockés hachés (scrypt, avec sel) ; le code de la famille ne permet jamais de se connecter à un compte existant. Un cookie signé et `HttpOnly` te garde connecté 30 jours.
- **Prénoms :** la connexion ignore les accents, les majuscules et la forme Unicode (`stephanie`, `STÉPHANIE` et `Stéphanie` donnent le même résultat).
- **Tests :** [Vitest](https://vitest.dev) (API avec supertest, plus tests des composants Angular).

## Démarrage rapide (local)

Nécessite Node.js 22 ou plus récent.

```bash
npm install
cp .env.example .env        # puis modifie-le (voir ci-dessous)
npm run dev                 # API sur :3000, Angular sur http://localhost:4200
```

Sous Windows PowerShell, utilise `Copy-Item .env.example .env`.

Ouvre <http://localhost:4200>, choisis ton prénom, entre le code secret de ton fichier `.env` (`FAMILY_PASSCODE`) et crée ton mot de passe.
La base de données locale est créée dans `data/whishper.db`.

### Variables d'environnement

| Variable | Requise | Description |
| --- | --- | --- |
| `FAMILY_MEMBERS` | oui | Prénoms séparés par des virgules, au moins deux (p. ex. `Stéphanie,Michaël,Jade`). Les accents et les majuscules sont ignorés à la connexion. Renommer quelqu'un rend ses cadeaux existants orphelins. |
| `FAMILY_PASSCODE` | oui | Code secret de la famille, demandé une seule fois par personne pour créer son mot de passe. Il ne sert plus à se connecter ensuite. |
| `SESSION_SECRET` | oui | Chaîne aléatoire (16 caractères ou plus) servant à signer les cookies. La changer déconnecte tout le monde. |
| `TURSO_DATABASE_URL` | production | p. ex. `libsql://your-db-org.turso.io`. Par défaut, le fichier local `file:data/whishper.db`. |
| `TURSO_AUTH_TOKEN` | production | Jeton de la base Turso. |
| `PORT` | non | Port pour `npm start` (`3000` par défaut). |

### Scripts

| Commande | Ce qu'elle fait |
| --- | --- |
| `npm run dev` | API (mode surveillance) + serveur de développement Angular avec `/api` relayé |
| `npm test` | Tests de l'API, puis tests Angular |
| `npm run test:api` / `npm run test:web` | Lance seulement l'un des deux |
| `npm run typecheck` | Vérifie les types de l'API |
| `npm run build` | Build de production de l'application Angular dans `dist/whishper/browser` |
| `npm run reset-password -- Jade` | Efface le mot de passe de quelqu'un (oublié) : la personne en recrée un avec le code secret de la famille |
| `npm start` | Sert l'API **et** l'application compilée depuis un seul processus Node (auto-hébergement) |

### Dépannage

- En développement, ouvre l'application sur **http://localhost:4200**. Le port 3000 est réservé à l'API (il affiche un court message à `/`).
- Si `npm run dev` échoue parce que le port 3000 ou 4200 est déjà utilisé, arrête l'autre processus d'abord ; `npm run dev` arrête les deux moitiés si l'une ne démarre pas.
- Après avoir changé `FAMILY_MEMBERS` dans `.env`, redémarre `npm run dev`. Le fichier `.env` n'est pas versionné : si tu récupères une mise à jour (p. ex. de nouveaux prénoms), modifie-le toi-même, et mets aussi à jour les variables d'environnement de Vercel.
- **Mot de passe oublié ?** Lance `npm run reset-password -- Jade` (avec les mêmes variables d'environnement que l'application ; en production avec Turso, définis `TURSO_DATABASE_URL` et `TURSO_AUTH_TOKEN`). La personne pourra en créer un nouveau à sa prochaine connexion. Tu peux aussi exécuter `DELETE FROM credentials WHERE name = 'Jade';` dans la console Turso.

## Déploiement gratuit (Vercel + Turso)

1. **Crée la base de données** sur [turso.tech](https://turso.tech) (forfait gratuit) :
   ```bash
   turso db create whishper
   turso db show whishper --url          # -> TURSO_DATABASE_URL
   turso db tokens create whishper       # -> TURSO_AUTH_TOKEN
   ```
2. **Importe le dépôt** dans [Vercel](https://vercel.com/new). [`vercel.json`](vercel.json) configure déjà la commande de build,
   le dossier de sortie et le routage. Vercel détecte `api/index.ts` comme fonction serverless.
3. **Ajoute les variables d'environnement** dans *Project → Settings → Environment Variables* :
   `FAMILY_MEMBERS`, `FAMILY_PASSCODE`, `SESSION_SECRET`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`.
4. **Déploie.** Partage l'adresse et le code secret avec ta famille : chacun crée son mot de passe à sa première visite. 🎉

> Le système de fichiers de Vercel est en lecture seule et éphémère : tu dois donc utiliser Turso (pas le fichier SQLite local) en production.

### Autres hébergeurs

Tout ce qui exécute Node fonctionne (un VPS, un Raspberry Pi, Fly.io, Render…) : définis les variables d'environnement,
lance `npm ci && npm run build && npm start`, et place le tout derrière HTTPS. Avec `NODE_ENV=production`, les cookies sont marqués `Secure`.
Monte un volume persistant pour `data/` ou pointe `TURSO_DATABASE_URL` vers Turso.

## Utilisation

1. **Connecte-toi** avec ton prénom. La première fois, entre le code secret de la famille et crée ton mot de passe ; ensuite, ton mot de passe suffit.
2. **Ma liste :** ajoute des cadeaux (colle un lien, modifie au besoin le titre ou le prix récupérés, ou décris quelque chose comme une carte-cadeau). Retire-les en tout temps.
3. **Famille :** ouvre la liste de quelqu'un et clique sur **Je m'en occupe** pour ce que tu comptes acheter. Tu changes d'idée ? Clique sur **Annuler**.
4. **Mes réservations :** retrouve tout ce que tu as réservé, classé par personne. Seul(e) toi y as accès.

L'interface est pensée pour le téléphone : sur un petit écran, une barre d'onglets en bas (Famille, Réservés, **Ajouter**, Ma liste) remplace le menu du haut.

### Aperçu des liens

Quand tu colles un lien, le serveur lit la page comme le ferait un navigateur ordinaire (titre, image, prix). Certaines boutiques,
Amazon surtout, affichent une page de vérification anti-robot au lieu du produit. Dans ce cas :

- les titres génériques (« Amazon », « Robot Check »…) et les logos du site sont ignorés, jamais préremplis ;
- pour Amazon, le nom du produit est déduit de l'adresse du lien quand c'est possible ;
- un petit message t'invite à vérifier le nom et à ajouter le prix ou une note toi-même. Le lien est quand même enregistré.

## Structure du projet

```
server/   API Express : items.ts (règles de confidentialité), session.ts, scrape.ts (aperçu des liens + protection SSRF), app.ts
api/      Point d'entrée serverless pour Vercel
src/app/  Application Angular (pages/, components/, api.ts, auth.ts)
```

## Sécurité

- Les aperçus de liens sont récupérés côté serveur avec un délai maximal, une taille maximale et une protection qui refuse les adresses privées ou locales.
- Les écritures inter-sites sont refusées (cookie `SameSite=Lax` plus vérification de l'en-tête `Origin`), et les tentatives de connexion sont limitées par adresse IP (au mieux en mode serverless).
- L'écran de connexion affiche les prénoms de la famille (pour que chacun trouve le sien), mais rien d'autre n'est accessible sans mot de passe. Les tentatives de connexion et de création de mot de passe sont limitées par adresse IP.
