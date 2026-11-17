import type { Request, Response } from 'express';
import { createApp } from '../server/app';
import { loadConfig } from '../server/config';
import { openDb } from '../server/db';

type Handler = (req: Request, res: Response) => void;

let ready: Promise<Handler> | undefined;

async function start(): Promise<Handler> {
  const config = loadConfig();
  const db = await openDb(config.databaseUrl, config.databaseAuthToken);
  return createApp({ config, getDb: () => Promise.resolve(db) }) as unknown as Handler;
}

// Failing here (bad env var, unreachable database) would make Vercel answer with its own opaque
// error, so the failure is caught, logged, and reported as a normal JSON error instead.
export default async function handler(req: Request, res: Response) {
  try {
    ready ??= start();
    (await ready)(req, res);
  } catch (e) {
    ready = undefined;
    console.error('Démarrage impossible :', e);
    const message =
      e instanceof Error && e.message.startsWith('Configuration invalide')
        ? e.message
        : "Le serveur n'a pas pu se connecter à la base de données. Vérifie TURSO_DATABASE_URL et TURSO_AUTH_TOKEN.";
    res.status(500).json({ error: message });
  }
}
