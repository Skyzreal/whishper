import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient, type Client } from '@libsql/client';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    owner      TEXT NOT NULL,
    title      TEXT NOT NULL,
    url        TEXT,
    image      TEXT,
    price      TEXT,
    note       TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  `CREATE INDEX IF NOT EXISTS items_owner_idx ON items (owner)`,
  // Claims live in their own table so that owner-facing queries never touch it.
  `CREATE TABLE IF NOT EXISTS claims (
    item_id    INTEGER PRIMARY KEY REFERENCES items (id) ON DELETE CASCADE,
    claimer    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
];

export async function openDb(url: string, authToken?: string): Promise<Client> {
  if (url.startsWith('file:') && !url.includes(':memory:')) {
    const path = url.slice('file:'.length);
    if (path) mkdirSync(dirname(path), { recursive: true });
  }
  const db = createClient({ url, authToken });
  await db.batch(SCHEMA, 'write');
  return db;
}
