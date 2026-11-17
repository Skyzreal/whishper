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
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    deleted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS items_owner_idx ON items (owner)`,
  // One personal password per family member, chosen by them on first sign-in.
  `CREATE TABLE IF NOT EXISTS credentials (
    name       TEXT PRIMARY KEY,
    hash       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
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
  // Databases created before soft deletes existed lack this column.
  const cols = await db.execute('PRAGMA table_info(items)');
  if (!cols.rows.some((r) => r['name'] === 'deleted_at')) {
    await db.execute('ALTER TABLE items ADD COLUMN deleted_at TEXT');
  }
  return db;
}
