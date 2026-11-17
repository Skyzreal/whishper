import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { Client } from '@libsql/client';
import { findMember, type Config } from './config';
import {
  HttpError,
  addItem,
  claimItem,
  countItemsByOwner,
  deleteOwnItem,
  getListForViewer,
  unclaimItem,
} from './items';
import { fetchPreview as defaultFetchPreview, type Preview } from './scrape';
import {
  COOKIE_NAME,
  SESSION_MAX_AGE_S,
  checkPasscode,
  createSessionToken,
  parseCookies,
  verifySessionToken,
} from './session';

export interface AppDeps {
  config: Config;
  getDb: () => Promise<Client>;
  fetchPreview?: (url: string) => Promise<Preview>;
}

type AuthedRequest = Request & { user: string };

function text(value: unknown, max: number, field: string, required = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, `${field} est requis`);
    return null;
  }
  if (typeof value !== 'string') throw new HttpError(400, `${field} doit être du texte`);
  const v = value.trim();
  if (!v) {
    if (required) throw new HttpError(400, `${field} est requis`);
    return null;
  }
  if (v.length > max) throw new HttpError(400, `${field} dépasse la limite de ${max} caractères`);
  return v;
}

function webUrl(value: unknown, field: string): string | null {
  const v = text(value, 2000, field);
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
  } catch {
    /* fall through */
  }
  throw new HttpError(400, `${field} doit être un lien http(s) valide`);
}

function itemId(req: Request): number {
  const id = Number(req.params['id']);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, 'Identifiant de cadeau invalide');
  return id;
}

export function createApp({ config, getDb, fetchPreview = defaultFetchPreview }: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  const api = express.Router();
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(express.json({ limit: '20kb' }));

  // Cheap CSRF defence on top of SameSite=Lax: browsers always send Origin on cross-site writes.
  api.use((req, _res, next) => {
    const origin = req.headers.origin;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin) {
      const host = req.headers['x-forwarded-host'] ?? req.headers.host;
      let originHost = '';
      try {
        originHost = new URL(origin).host;
      } catch {
        /* invalid */
      }
      if (originHost !== host) return next(new HttpError(403, 'Requête inter-sites bloquée'));
    }
    next();
  });

  const attempts = new Map<string, { count: number; resetAt: number }>();
  const MAX_ATTEMPTS = 10;
  const WINDOW_MS = 15 * 60 * 1000;

  const cookieAttrs = () =>
    `Path=/; HttpOnly; SameSite=Lax${config.secureCookies ? '; Secure' : ''}`;

  api.post('/login', (req, res) => {
    const ip = req.ip ?? 'unknown';
    const now = Date.now();
    const rec = attempts.get(ip);
    if (rec && rec.resetAt > now && rec.count >= MAX_ATTEMPTS) {
      throw new HttpError(429, 'Trop de tentatives, réessaie plus tard');
    }

    const member = findMember(config.members, req.body?.name);
    // Same failure for unknown names and wrong passcodes.
    if (!member || !checkPasscode(req.body?.passcode, config.passcode)) {
      attempts.set(ip, rec && rec.resetAt > now ? { ...rec, count: rec.count + 1 } : { count: 1, resetAt: now + WINDOW_MS });
      throw new HttpError(401, 'Prénom ou code secret incorrect');
    }
    attempts.delete(ip);
    const token = createSessionToken(member, config.sessionSecret);
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Max-Age=${SESSION_MAX_AGE_S}; ${cookieAttrs()}`);
    res.json({ name: member });
  });

  api.post('/logout', (_req, res) => {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Max-Age=0; ${cookieAttrs()}`);
    res.json({ ok: true });
  });

  const requireUser: RequestHandler = (req, _res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    const user = verifySessionToken(token, config.sessionSecret, config.members);
    if (!user) return next(new HttpError(401, 'Connecte-toi pour continuer'));
    (req as AuthedRequest).user = user;
    next();
  };

  api.get('/members', (_req, res) => {
    res.json({ members: config.members });
  });

  api.get('/me', requireUser, (req, res) => {
    res.json({ name: (req as AuthedRequest).user });
  });

  api.get('/people', requireUser, async (req, res) => {
    const counts = await countItemsByOwner(await getDb());
    res.json({
      me: (req as AuthedRequest).user,
      people: config.members.map((name) => ({ name, itemCount: counts.get(name) ?? 0 })),
    });
  });

  api.get('/people/:name/items', requireUser, async (req, res) => {
    const viewer = (req as AuthedRequest).user;
    const owner = findMember(config.members, req.params['name']);
    if (!owner) throw new HttpError(404, 'Personne introuvable');
    const items = await getListForViewer(await getDb(), viewer, owner);
    res.json({ owner, isMe: owner === viewer, items });
  });

  api.get('/items', requireUser, async (req, res) => {
    const me = (req as AuthedRequest).user;
    res.json({ items: await getListForViewer(await getDb(), me, me) });
  });

  api.post('/items', requireUser, async (req, res) => {
    const me = (req as AuthedRequest).user;
    const body = req.body ?? {};
    const item = await addItem(await getDb(), me, {
      title: text(body.title, 200, 'Le titre', true)!,
      url: webUrl(body.url, 'Le lien'),
      image: webUrl(body.image, "L'image"),
      price: text(body.price, 50, 'Le prix'),
      note: text(body.note, 1000, 'La note'),
    });
    res.status(201).json({ item });
  });

  api.delete('/items/:id', requireUser, async (req, res) => {
    const removed = await deleteOwnItem(await getDb(), (req as AuthedRequest).user, itemId(req));
    if (!removed) throw new HttpError(404, 'Cadeau introuvable');
    res.json({ ok: true });
  });

  api.post('/preview', requireUser, async (req, res) => {
    const url = text(req.body?.url, 2000, 'Le lien', true)!;
    try {
      res.json(await fetchPreview(url));
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : 'Impossible de lire ce lien');
    }
  });

  api.post('/items/:id/claim', requireUser, async (req, res) => {
    await claimItem(await getDb(), (req as AuthedRequest).user, itemId(req));
    res.json({ ok: true });
  });

  api.delete('/items/:id/claim', requireUser, async (req, res) => {
    await unclaimItem(await getDb(), (req as AuthedRequest).user, itemId(req));
    res.json({ ok: true });
  });

  api.use((_req, _res, next) => next(new HttpError(404, 'Introuvable')));

  api.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
    } else if ((err as { type?: string })?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'JSON invalide' });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Une erreur est survenue' });
    }
  });

  app.use('/api', api);
  return app;
}
