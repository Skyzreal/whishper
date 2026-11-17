import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import type { Config } from './config';
import { openDb } from './db';

const config: Config = {
  members: ['Stéphanie', 'Michaël', 'Nathaniel'],
  passcode: 'family-secret',
  sessionSecret: 'test-secret-test-secret',
  databaseUrl: '',
  secureCookies: false,
};

const dir = mkdtempSync(join(tmpdir(), 'whishper-'));
const opened: Client[] = [];
let n = 0;
let db: Client;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  db = await openDb(`file:${join(dir, `t${n++}.db`)}`);
  opened.push(db);
  app = createApp({
    config,
    getDb: async () => db,
    fetchPreview: async (url) => ({ title: 'Preview', image: null, price: null, url, partial: false }),
  });
});

afterAll(() => {
  for (const c of opened) c.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* temp files may be briefly locked on Windows; the OS cleans the temp dir */
  }
});

async function login(name: string): Promise<string> {
  const res = await request(app).post('/api/login').send({ name, passcode: config.passcode });
  expect(res.status).toBe(200);
  return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
}

const as = (cookie: string) => ({
  get: (url: string) => request(app).get(url).set('Cookie', cookie),
  post: (url: string) => request(app).post(url).set('Cookie', cookie),
  delete: (url: string) => request(app).delete(url).set('Cookie', cookie),
});

async function aliceWithClaimedItem() {
  const alice = as(await login('Stéphanie'));
  const bob = as(await login('Michaël'));
  const created = await alice.post('/api/items').send({ title: 'Cozy socks', url: 'https://example.com/socks' });
  const id = created.body.item.id as number;
  expect((await bob.post(`/api/items/${id}/claim`)).status).toBe(200);
  return { alice, bob, carol: as(await login('Nathaniel')), id };
}

describe('privacy: the owner never receives claim data', () => {
  it('own list responses contain no claim information, even when items are claimed', async () => {
    const { alice, id } = await aliceWithClaimedItem();

    for (const url of ['/api/items', '/api/people/St%C3%A9phanie/items', '/api/people/stephanie/items']) {
      const res = await alice.get(url);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(id);
      const raw = JSON.stringify(res.body).toLowerCase();
      expect(raw).not.toContain('claim');
      expect(raw).not.toContain('michaël');
      expect(Object.keys(res.body.items[0]).sort()).toEqual(
        ['createdAt', 'id', 'image', 'note', 'owner', 'price', 'title', 'url'].sort(),
      );
    }
  });

  it('the people overview is unchanged by claims and exposes no claim information', async () => {
    const alice = as(await login('Stéphanie'));
    const bob = as(await login('Michaël'));
    const { body } = await alice.post('/api/items').send({ title: 'Book' });
    const before = (await alice.get('/api/people')).body;
    await bob.post(`/api/items/${body.item.id}/claim`);
    const after = (await alice.get('/api/people')).body;
    expect(after).toEqual(before);
    expect(JSON.stringify(after).toLowerCase()).not.toContain('claim');
  });

  it('an item looks identical to the owner before and after being claimed or unclaimed', async () => {
    const alice = as(await login('Stéphanie'));
    const bob = as(await login('Michaël'));
    const { body } = await alice.post('/api/items').send({ title: 'Book' });
    const before = (await alice.get('/api/items')).body;
    await bob.post(`/api/items/${body.item.id}/claim`);
    expect((await alice.get('/api/items')).body).toEqual(before);
    await bob.delete(`/api/items/${body.item.id}/claim`);
    expect((await alice.get('/api/items')).body).toEqual(before);
  });

  it('the owner cannot learn claim state by trying to claim or unclaim', async () => {
    const { alice, id } = await aliceWithClaimedItem();
    const claimAttempt = await alice.post(`/api/items/${id}/claim`);
    expect(claimAttempt.status).toBe(403);
    const unclaim = await alice.delete(`/api/items/${id}/claim`);
    expect(unclaim.status).toBe(200);
    expect(JSON.stringify(unclaim.body)).toBe(JSON.stringify({ ok: true }));
    // The claim must survive the owner's unclaim attempt.
    const carol = as(await login('Nathaniel'));
    expect((await carol.get('/api/people/St%C3%A9phanie/items')).body.items[0].claimed).toBe(true);
  });

  it('deleting a claimed item works for the owner and the response is identical to deleting an unclaimed one', async () => {
    const { alice, id } = await aliceWithClaimedItem();
    const plain = (await alice.post('/api/items').send({ title: 'Plain' })).body.item.id as number;
    const claimedRes = await alice.delete(`/api/items/${id}`);
    const plainRes = await alice.delete(`/api/items/${plain}`);
    expect(claimedRes.status).toBe(plainRes.status);
    expect(claimedRes.body).toEqual(plainRes.body);
    expect(JSON.stringify(claimedRes.body)).toBe(JSON.stringify({ ok: true }));
  });
});

describe('removing an item that someone reserved', () => {
  it('leaves the owner with no trace: same responses as if the item never had a claim', async () => {
    const alice = as(await login('Stéphanie'));
    const bob = as(await login('Michaël'));
    const snapshot = async () => ({
      items: (await alice.get('/api/items')).body,
      people: (await alice.get('/api/people')).body,
      own: (await alice.get('/api/people/St%C3%A9phanie/items')).body,
    });
    const keep = (await alice.post('/api/items').send({ title: 'Keep' })).body.item.id as number;
    const beforeClaimedExisted = await snapshot();
    const claimed = (await alice.post('/api/items').send({ title: 'Claimed' })).body.item.id as number;
    await bob.post(`/api/items/${claimed}/claim`);

    await alice.delete(`/api/items/${claimed}`);
    const afterClaimed = await snapshot();

    expect(afterClaimed).toEqual(beforeClaimedExisted);
    expect(afterClaimed.items.items.map((i: { id: number }) => i.id)).toEqual([keep]);
    const raw = JSON.stringify(afterClaimed).toLowerCase();
    for (const word of ['claim', 'removed', 'deleted', 'retiré']) expect(raw).not.toContain(word);
    // The owner cannot even tell the item still exists: it is simply not found.
    expect((await alice.delete(`/api/items/${claimed}`)).status).toBe(404);
    expect((await alice.post(`/api/items/${claimed}/claim`)).status).toBe(404);
  });

  it('keeps the item for the claimer, flagged as removed, and hides it from everyone else', async () => {
    const { alice, bob, carol, id } = await aliceWithClaimedItem();
    await alice.delete(`/api/items/${id}`);

    const mine = (await bob.get('/api/reservations')).body.items;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id, owner: 'Stéphanie', title: 'Cozy socks', removed: true });

    for (const viewer of [bob, carol]) {
      expect((await viewer.get('/api/people/St%C3%A9phanie/items')).body.items).toEqual([]);
    }
    const people = (await carol.get('/api/people')).body.people as { name: string; itemCount: number }[];
    expect(people.find((p) => p.name === 'Stéphanie')?.itemCount).toBe(0);
    expect((await carol.get('/api/reservations')).body.items).toEqual([]);
    // Nobody can grab it in the meantime.
    expect((await carol.post(`/api/items/${id}/claim`)).status).toBe(404);
  });

  it('is gone for good once the claimer cancels', async () => {
    const { alice, bob, id } = await aliceWithClaimedItem();
    await alice.delete(`/api/items/${id}`);
    expect((await bob.delete(`/api/items/${id}/claim`)).status).toBe(200);
    expect((await bob.get('/api/reservations')).body.items).toEqual([]);
    expect((await db.execute({ sql: 'SELECT COUNT(*) AS n FROM items WHERE id = ?', args: [id] })).rows[0]['n']).toBe(0);
    expect((await db.execute({ sql: 'SELECT COUNT(*) AS n FROM claims WHERE item_id = ?', args: [id] })).rows[0]['n']).toBe(0);
  });

  it('lists active reservations unflagged and lets only the claimer cancel them', async () => {
    const { alice, bob, carol, id } = await aliceWithClaimedItem();
    expect((await bob.get('/api/reservations')).body.items[0]).toMatchObject({ id, removed: false });
    expect((await alice.get('/api/reservations')).body.items).toEqual([]);

    // Another member cancelling a removed item's claim must not erase the claimer's reservation.
    await alice.delete(`/api/items/${id}`);
    await carol.delete(`/api/items/${id}/claim`);
    expect((await bob.get('/api/reservations')).body.items).toHaveLength(1);
  });

  it('migrates a database created before soft deletes existed', async () => {
    const old = createClient({ url: `file:${join(dir, 'old.db')}` });
    opened.push(old);
    await old.execute('CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, title TEXT NOT NULL, url TEXT, image TEXT, price TEXT, note TEXT, created_at TEXT NOT NULL DEFAULT (strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\')))');
    await old.execute("INSERT INTO items (owner, title) VALUES ('Stéphanie', 'Old')");
    old.close();
    const migrated = await openDb(`file:${join(dir, 'old.db')}`);
    opened.push(migrated);
    expect((await migrated.execute('SELECT deleted_at FROM items')).rows[0]['deleted_at']).toBeNull();
  });
});

describe('claiming by other family members', () => {
  it('shows others that an item is taken without saying by whom', async () => {
    const { bob, carol } = await aliceWithClaimedItem();

    const forCarol = (await carol.get('/api/people/St%C3%A9phanie/items')).body.items[0];
    expect(forCarol.claimed).toBe(true);
    expect(forCarol.claimedByMe).toBe(false);
    expect(JSON.stringify(forCarol)).not.toContain('Michaël');

    const forBob = (await bob.get('/api/people/St%C3%A9phanie/items')).body.items[0];
    expect(forBob.claimed).toBe(true);
    expect(forBob.claimedByMe).toBe(true);
    expect(JSON.stringify(forBob)).not.toContain('Michaël');
  });

  it('rejects a second claimer, and only the claimer can undo a claim', async () => {
    const { alice, bob, carol, id } = await aliceWithClaimedItem();
    expect((await carol.post(`/api/items/${id}/claim`)).status).toBe(409);

    await carol.delete(`/api/items/${id}/claim`);
    expect((await carol.get('/api/people/St%C3%A9phanie/items')).body.items[0].claimed).toBe(true);

    expect((await bob.post(`/api/items/${id}/claim`)).status).toBe(200); // idempotent
    await bob.delete(`/api/items/${id}/claim`);
    const after = (await carol.get('/api/people/St%C3%A9phanie/items')).body.items[0];
    expect(after.claimed).toBe(false);
    expect((await carol.post(`/api/items/${id}/claim`)).status).toBe(200);
    expect(alice).toBeDefined();
  });

  it('404s when claiming an item that does not exist', async () => {
    const bob = as(await login('Michaël'));
    expect((await bob.post('/api/items/999/claim')).status).toBe(404);
  });
});

describe('items', () => {
  it('lets people add link and free-text items, and only delete their own', async () => {
    const alice = as(await login('Stéphanie'));
    const bob = as(await login('Michaël'));
    const link = await alice.post('/api/items').send({ title: 'Lamp', url: 'https://shop.example/lamp', price: '$40' });
    const text = await alice.post('/api/items').send({ title: 'Gift card', note: 'Any store, ~$50' });
    expect(link.status).toBe(201);
    expect(text.status).toBe(201);
    expect(text.body.item.url).toBeNull();

    expect((await bob.delete(`/api/items/${link.body.item.id}`)).status).toBe(404);
    expect((await alice.get('/api/items')).body.items).toHaveLength(2);
  });

  it('validates input', async () => {
    const alice = as(await login('Stéphanie'));
    expect((await alice.post('/api/items').send({})).status).toBe(400);
    expect((await alice.post('/api/items').send({ title: 'x', url: 'javascript:alert(1)' })).status).toBe(400);
    expect((await alice.post('/api/items').send({ title: 'x', image: 'data:text/html,hi' })).status).toBe(400);
    expect((await alice.post('/api/items').send({ title: 'x'.repeat(201) })).status).toBe(400);
  });
});

describe('auth', () => {
  it('requires a valid session for everything but login and the name list', async () => {
    for (const path of ['/api/me', '/api/items', '/api/people', '/api/people/St%C3%A9phanie/items']) {
      expect((await request(app).get(path)).status).toBe(401);
    }
    expect((await request(app).get('/api/members')).body.members).toEqual(config.members);
  });

  it('rejects wrong passcodes and unknown names with the same response', async () => {
    const wrongPass = await request(app).post('/api/login').send({ name: 'Stéphanie', passcode: 'nope' });
    const wrongName = await request(app).post('/api/login').send({ name: 'Mallory', passcode: config.passcode });
    expect(wrongPass.status).toBe(401);
    expect(wrongName.status).toBe(401);
    expect(wrongPass.body).toEqual(wrongName.body);
  });

  it('rejects tampered or forged session cookies', async () => {
    const cookie = await login('Stéphanie');
    const [name, token] = cookie.split('=');
    const [payload, sig] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ u: 'Michaël', exp: Date.now() + 1e9 })).toString('base64url');
    expect((await request(app).get('/api/me').set('Cookie', `${name}=${forgedPayload}.${sig}`)).status).toBe(401);
    expect((await request(app).get('/api/me').set('Cookie', `${name}=${payload}.bad`)).status).toBe(401);
    expect((await request(app).get('/api/me').set('Cookie', cookie)).body.name).toBe('Stéphanie');
  });

  it('signs in regardless of accents, case or Unicode form, and always uses the canonical name', async () => {
    for (const typed of ['stephanie', 'STÉPHANIE', 'Ste\u0301phanie', ' Stéphanie ']) {
      const res = await request(app).post('/api/login').send({ name: typed, passcode: config.passcode });
      expect(res.status, typed).toBe(200);
      expect(res.body.name).toBe('Stéphanie');
    }
    const michael = await request(app).post('/api/login').send({ name: 'michael', passcode: config.passcode });
    expect(michael.body.name).toBe('Michaël');
  });

  it('finds people by accent-tolerant, URL-encoded names', async () => {
    const bob = as(await login('Michaël'));
    for (const seg of ['St%C3%A9phanie', 'stephanie', 'Ste%CC%81phanie']) {
      const res = await bob.get(`/api/people/${seg}/items`);
      expect(res.status, seg).toBe(200);
      expect(res.body.owner).toBe('Stéphanie');
    }
  });

  it('sets an HttpOnly cookie and clears it on logout', async () => {
    const res = await request(app).post('/api/login').send({ name: 'stephanie', passcode: config.passcode });
    expect(res.body.name).toBe('Stéphanie');
    expect(String(res.headers['set-cookie'])).toMatch(/HttpOnly/);
    const out = await request(app).post('/api/logout');
    expect(String(out.headers['set-cookie'])).toMatch(/Max-Age=0/);
  });

  it('blocks cross-site writes', async () => {
    const alice = as(await login('Stéphanie'));
    const res = await alice.post('/api/items').set('Origin', 'https://evil.example').send({ title: 'x' });
    expect(res.status).toBe(403);
  });
});
