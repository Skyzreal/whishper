# 🎁 Whishper

A private family gift-exchange wishlist, built for a family that wants to **give gifts without drawing names**
(no Pikaddo-style random assignment) and **without a group chat full of "I bought this" messages**.

- Everyone has their own clearly labelled list. Browse any family member's list from the **Family** page.
- Add items from anywhere: paste a product link (title, picture and price are fetched automatically when the
  shop allows it) or just write something out, like *"Gift card – any store, ~$50"*.
- **Claim items Amazon-style.** Click **"I'll get this"** on someone else's item. Everyone else sees it greyed out as
  *Already taken*, so nobody double-buys, and you can **Undo** it any time.
- **The list owner never finds out.** They never see which items are claimed, or by whom, so gifts stay a surprise.
  Nobody (not even other family members) can see *who* claimed an item. Only you can see that an item is yours.

## How privacy works

Claim data is kept in a separate `claims` table, and there is one function that decides what each viewer may see:
`getListForViewer` in [`server/items.ts`](server/items.ts).

| Viewer | Sees |
| --- | --- |
| The list's owner | Items only. The response contains **no** claim fields at all, and the claims table isn't even queried. |
| Another family member | Each item plus `claimed` (true/false) and `claimedByMe`. The claimer's name is never sent to anyone. |

Other guarantees, all covered by tests in [`server/app.test.ts`](server/app.test.ts):

- An owner's list looks identical before and after something is claimed or unclaimed.
- Owners can't claim their own items, and trying to unclaim reveals nothing (the response is always the same).
- Only the claimer can undo a claim. Deleting an item silently deletes its claim.

> Note: whoever has access to your hosting dashboard or database can of course read the `claims` table.
> The privacy rule protects family members using the app, not the person administering it.

## Tech stack

- **Frontend:** [Angular](https://angular.dev) (standalone components, signals, zoneless), static SPA.
- **API:** small [Express](https://expressjs.com) + TypeScript app in [`server/`](server). On Vercel it runs as a single serverless
  function ([`api/index.ts`](api/index.ts)); anywhere else it's a plain Node server.
- **Database:** [libSQL](https://github.com/tursodatabase/libsql) (SQLite). A local file in development, a free
  [Turso](https://turso.tech) database in production. The schema is created automatically.
- **Sign-in:** pick your name from the family list + one shared passcode. A signed, HttpOnly cookie remembers you for 30 days.
- **Tests:** [Vitest](https://vitest.dev) (API with supertest, plus Angular component tests).

## Quick start (local)

Requires Node.js 22 or newer.

```bash
npm install
cp .env.example .env        # then edit it (see below)
npm run dev                 # API on :3000, Angular on http://localhost:4200
```

Open <http://localhost:4200>, choose your name and enter the passcode from `.env`.
The local database is created at `data/whishper.db`.

### Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `FAMILY_MEMBERS` | yes | Comma-separated names, at least two (e.g. `Alice,Bob,Carol`). Names are case-insensitive when signing in. Renaming someone orphans their existing items. |
| `FAMILY_PASSCODE` | yes | Shared passcode everyone enters to sign in. |
| `SESSION_SECRET` | yes | Random string (16+ chars) used to sign cookies. Changing it signs everybody out. |
| `TURSO_DATABASE_URL` | production | e.g. `libsql://your-db-org.turso.io`. Defaults to the local file `file:data/whishper.db`. |
| `TURSO_AUTH_TOKEN` | production | Token for the Turso database. |
| `PORT` | no | Port for `npm start` (default `3000`). |

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API (watch mode) + Angular dev server with `/api` proxied |
| `npm test` | API tests, then Angular tests |
| `npm run test:api` / `npm run test:web` | Run just one of them |
| `npm run typecheck` | Type-check the API |
| `npm run build` | Production build of the Angular app into `dist/whishper/browser` |
| `npm start` | Serve the API **and** the built app from one Node process (self-hosting) |

## Deploy for free (Vercel + Turso)

1. **Create the database** at [turso.tech](https://turso.tech) (free tier):
   ```bash
   turso db create whishper
   turso db show whishper --url          # -> TURSO_DATABASE_URL
   turso db tokens create whishper       # -> TURSO_AUTH_TOKEN
   ```
2. **Import the repo** in [Vercel](https://vercel.com/new). [`vercel.json`](vercel.json) already sets the build command,
   output directory and routing. Vercel picks up `api/index.ts` as the serverless function.
3. **Add environment variables** in *Project → Settings → Environment Variables*:
   `FAMILY_MEMBERS`, `FAMILY_PASSCODE`, `SESSION_SECRET`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`.
4. **Deploy.** Share the URL and the passcode with your family. 🎉

> Vercel's filesystem is read-only/ephemeral, so you must use Turso (not the local SQLite file) in production.

### Other hosts

Anything that runs Node works (a VPS, Raspberry Pi, Fly.io, Render…): set the environment variables,
run `npm ci && npm run build && npm start`, and put it behind HTTPS. With `NODE_ENV=production` cookies are marked `Secure`.
Mount a persistent volume for `data/` or point `TURSO_DATABASE_URL` at Turso.

## Using it

1. **Sign in** with your name and the family passcode.
2. **My list:** add items (paste a link, optionally edit the fetched title/price, or describe something like a gift card). Remove items any time.
3. **Family:** open someone's list and click **I'll get this** on what you plan to buy. Change your mind? Click **Undo**.

Some shops (Amazon, for instance) block automated link previews. When that happens, the link is still saved and you can
type the title and price yourself.

## Project layout

```
server/   Express API: items.ts (privacy rules), session.ts, scrape.ts (link previews + SSRF guard), app.ts
api/      Vercel serverless entry point
src/app/  Angular app (pages/, components/, api.ts, auth.ts)
```

## Security notes

- Link previews are fetched server-side with a timeout, a size cap, and a guard that refuses private/loopback addresses.
- Cross-site writes are rejected (`SameSite=Lax` cookie plus an `Origin` check), and login attempts are rate-limited per IP (best effort on serverless).
- The sign-in screen lists family names (so people can pick theirs) but nothing else is available without the passcode.
