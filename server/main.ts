import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import { createApp } from './app';
import { loadConfig } from './config';
import { openDb } from './db';

try {
  process.loadEnvFile('.env');
} catch {
  /* no .env file: rely on the real environment */
}

const config = loadConfig();
const dbPromise = openDb(config.databaseUrl, config.databaseAuthToken);
const app = createApp({ config, getDb: () => dbPromise });

// When the Angular app has been built, serve it too (self-hosting). In dev, `ng serve` does this.
const webRoot = resolve('dist/whishper/browser');
if (existsSync(webRoot)) {
  app.use(express.static(webRoot));
  app.get(/.*/, (_req, res) => res.sendFile(resolve(webRoot, 'index.html')));
}

const port = Number(process.env['PORT'] ?? 3000);
app.listen(port, () => console.log(`Whishper listening on http://localhost:${port}`));
