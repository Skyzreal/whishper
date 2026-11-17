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
  listReservations,
  unclaimItem,
} from './items';
import { MIN_PASSWORD_LENGTH, getPasswordHash, registeredNames, setInitialPassword, verifyPassword } from './password';
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

  const tooManyAttempts = (ip: string) => {
    const rec = attempts.get(ip);
    return !!rec && rec.resetAt > Date.now() && rec.count >= MAX_ATTEMPTS;
  };
  const recordFailure = (ip: string) => {
    const now = Date.now();
    const rec = attempts.get(ip);
    attempts.set(ip, rec && rec.resetAt > now ? { ...rec, count: rec.count + 1 } : { count: 1, resetAt: now + WINDOW_MS });
  };
  const startSession = (res: Response, member: string) => {
    const token = createSessionToken(member, config.sessionSecret);
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Max-Age=${SESSION_MAX_AGE_S}; ${cookieAttrs()}`);
    res.json({ name: member });
  };
  const managedBy = (user: string) => config.members.filter((m) => config.managed[m] === user);
  const refuseManaged = (member: string) => {
    const guardian = config.managed[member];
    if (guardian) throw new HttpError(403, `${member} n'a pas de compte : ${guardian} gère sa liste`);
  };
  const secret = (value: unknown): string => (typeof value === 'string' ? value : '');

  api.post('/login', async (req, res) => {
    const ip = req.ip ?? 'unknown';
    if (tooManyAttempts(ip)) throw new HttpError(429, 'Trop de tentatives, réessaie plus tard');

    const member = findMember(config.members, req.body?.name);
    if (member) refuseManaged(member);
    const stored = member ? await getPasswordHash(await getDb(), member) : null;
    if (member && !stored) {
      throw new HttpError(409, "Tu n'as pas encore de mot de passe : crée-le avec le code secret de la famille");
    }
    // Same failure for unknown names and wrong passwords.
    if (!member || !stored || !(await verifyPassword(secret(req.body?.password), stored))) {
      recordFailure(ip);
      throw new HttpError(401, 'Prénom ou mot de passe incorrect');
    }
    attempts.delete(ip);
    startSession(res, member);
  });

  // First sign-in: the family passcode proves you belong, then you choose your own password.
  api.post('/register', async (req, res) => {
    const ip = req.ip ?? 'unknown';
    if (tooManyAttempts(ip)) throw new HttpError(429, 'Trop de tentatives, réessaie plus tard');

    const member = findMember(config.members, req.body?.name);
    if (member) refuseManaged(member);
    if (!member || !checkPasscode(req.body?.passcode, config.passcode)) {
      recordFailure(ip);
      throw new HttpError(401, 'Prénom ou code secret de la famille incorrect');
    }
    const password = secret(req.body?.password);
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new HttpError(400, `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`);
    }
    if (password.length > 200) throw new HttpError(400, 'Le mot de passe est trop long');
    if (!(await setInitialPassword(await getDb(), member, password))) {
      throw new HttpError(409, 'Ce prénom a déjà un mot de passe : connecte-toi');
    }
    attempts.delete(ip);
    startSession(res, member);
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

  api.get('/members', async (_req, res) => {
    const registered = await registeredNames(await getDb());
    const members = config.members.filter((m) => !config.managed[m]);
    res.json({ members, registered: members.filter((m) => registered.has(m)) });
  });

  api.get('/me', requireUser, (req, res) => {
    res.json({ name: (req as AuthedRequest).user });
  });

  api.get('/people', requireUser, async (req, res) => {
    const counts = await countItemsByOwner(await getDb());
    res.json({
      me: (req as AuthedRequest).user,
      people: config.members.map((name) => ({
        name,
        itemCount: counts.get(name) ?? 0,
        canManage: config.managed[name] === (req as AuthedRequest).user,
      })),
    });
  });

  api.get('/people/:name/items', requireUser, async (req, res) => {
    const viewer = (req as AuthedRequest).user;
    const owner = findMember(config.members, req.params['name']);
    if (!owner) throw new HttpError(404, 'Personne introuvable');
    const canManage = config.managed[owner] === viewer;
    // A manager sees the list exactly as its owner would: no claim data.
    const items = await getListForViewer(await getDb(), canManage ? owner : viewer, owner);
    res.json({ owner, isMe: owner === viewer, canManage, items });
  });

  api.get('/reservations', requireUser, async (req, res) => {
    res.json({ items: await listReservations(await getDb(), (req as AuthedRequest).user) });
  });

  api.get('/items', requireUser, async (req, res) => {
    const me = (req as AuthedRequest).user;
    res.json({ items: await getListForViewer(await getDb(), me, me) });
  });

  api.post('/items', requireUser, async (req, res) => {
    const me = (req as AuthedRequest).user;
    const body = req.body ?? {};
    let owner = me;
    if (body.forName !== undefined && body.forName !== null && body.forName !== '') {
      owner = findMember(managedBy(me), body.forName) ?? '';
      if (!owner) throw new HttpError(403, 'Tu ne gères pas la liste de cette personne');
    }
    const item = await addItem(await getDb(), owner, {
      title: text(body.title, 200, 'Le titre', true)!,
      url: webUrl(body.url, 'Le lien'),
      image: webUrl(body.image, "L'image"),
      price: text(body.price, 50, 'Le prix'),
      note: text(body.note, 1000, 'La note'),
      multi: body.multi === true,
    });
    res.status(201).json({ item });
  });

  api.delete('/items/:id', requireUser, async (req, res) => {
    const user = (req as AuthedRequest).user;
    const removed = await deleteOwnItem(await getDb(), [user, ...managedBy(user)], itemId(req));
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
    const user = (req as AuthedRequest).user;
    await claimItem(await getDb(), user, itemId(req), managedBy(user));
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
