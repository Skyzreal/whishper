import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { Client } from '@libsql/client';
import type { Config } from './config';
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
    if (required) throw new HttpError(400, `${field} is required`);
    return null;
  }
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text`);
  const v = value.trim();
  if (!v) {
    if (required) throw new HttpError(400, `${field} is required`);
    return null;
  }
  if (v.length > max) throw new HttpError(400, `${field} is too long (max ${max} characters)`);
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
  throw new HttpError(400, `${field} must be a valid http(s) link`);
}

function itemId(req: Request): number {
  const id = Number(req.params['id']);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, 'Invalid item id');
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
      if (originHost !== host) return next(new HttpError(403, 'Cross-site request blocked'));
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
      throw new HttpError(429, 'Too many attempts, try again later');
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim().toLowerCase() : '';
    const member = config.members.find((m) => m.toLowerCase() === name);
    // Same failure for unknown names and wrong passcodes.
    if (!member || !checkPasscode(req.body?.passcode, config.passcode)) {
      attempts.set(ip, rec && rec.resetAt > now ? { ...rec, count: rec.count + 1 } : { count: 1, resetAt: now + WINDOW_MS });
      throw new HttpError(401, 'Wrong name or passcode');
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
    if (!user) return next(new HttpError(401, 'Please sign in'));
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
    const wanted = String(req.params['name']).toLowerCase();
    const owner = config.members.find((m) => m.toLowerCase() === wanted);
    if (!owner) throw new HttpError(404, 'Person not found');
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
      title: text(body.title, 200, 'Title', true)!,
      url: webUrl(body.url, 'Link'),
      image: webUrl(body.image, 'Image'),
      price: text(body.price, 50, 'Price'),
      note: text(body.note, 1000, 'Note'),
    });
    res.status(201).json({ item });
  });

  api.delete('/items/:id', requireUser, async (req, res) => {
    const removed = await deleteOwnItem(await getDb(), (req as AuthedRequest).user, itemId(req));
    if (!removed) throw new HttpError(404, 'Item not found');
    res.json({ ok: true });
  });

  api.post('/preview', requireUser, async (req, res) => {
    const url = text(req.body?.url, 2000, 'Link', true)!;
    try {
      res.json(await fetchPreview(url));
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : 'Could not read that link');
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

  api.use((_req, _res, next) => next(new HttpError(404, 'Not found')));

  api.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
    } else if ((err as { type?: string })?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON' });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Something went wrong' });
    }
  });

  app.use('/api', api);
  return app;
}
