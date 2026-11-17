import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { Client } from '@libsql/client';

export const MIN_PASSWORD_LENGTH = 6;
const KEY_LENGTH = 32;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFC'), salt, KEY_LENGTH, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${(await derive(password, salt)).toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function getPasswordHash(db: Client, name: string): Promise<string | null> {
  const res = await db.execute({ sql: 'SELECT hash FROM credentials WHERE name = ?', args: [name] });
  return res.rows.length ? String(res.rows[0]['hash']) : null;
}

/** Returns false when this person already has a password (it can only be set once). */
export async function setInitialPassword(db: Client, name: string, password: string): Promise<boolean> {
  const res = await db.execute({
    sql: 'INSERT OR IGNORE INTO credentials (name, hash) VALUES (?, ?)',
    args: [name, await hashPassword(password)],
  });
  return res.rowsAffected > 0;
}

/** Creates or replaces the person's password (used by the "forgot password" flow). */
export async function replacePassword(db: Client, name: string, password: string): Promise<void> {
  await db.execute({
    sql: 'INSERT INTO credentials (name, hash) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET hash = excluded.hash',
    args: [name, await hashPassword(password)],
  });
}

export async function registeredNames(db: Client): Promise<Set<string>> {
  const res = await db.execute('SELECT name FROM credentials');
  return new Set(res.rows.map((r) => String(r['name'])));
}
