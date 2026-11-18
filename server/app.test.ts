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
  members: ['Stéphanie', 'Michaël', 'Nathaniel', 'Orélie'],
  managed: { Orélie: 'Michaël' },
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

const PASSWORD = 'mon-mot-de-passe';

/** Creates the person's password on first use, then signs in with it. */
async function login(name: string): Promise<string> {
  let res = await request(app).post('/api/register').send({ name, passcode: config.passcode, password: PASSWORD });
  if (res.status === 409) res = await request(app).post('/api/login').send({ name, password: PASSWORD });
  expect(res.status).toBe(200);
  return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
}

const as = (cookie: string) => ({
  get: (url: string) => request(app).get(url).set('Cookie', cookie),
  post: (url: string) => request(app).post(url).set('Cookie', cookie),
  patch: (url: string) => request(app).patch(url).set('Cookie', cookie),
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
        ['createdAt', 'favorite', 'id', 'image', 'multi', 'note', 'owner', 'price', 'title', 'url'].sort(),
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
    expect((await request(app).get('/api/members')).body.members).toEqual(['Stéphanie', 'Michaël', 'Nathaniel']);
  });

  it('rejects wrong passwords and unknown names with the same response', async () => {
    await login('Stéphanie');
    const wrongPass = await request(app).post('/api/login').send({ name: 'Stéphanie', password: 'nope-nope' });
    const wrongName = await request(app).post('/api/login').send({ name: 'Mallory', password: PASSWORD });
    expect(wrongPass.status).toBe(401);
    expect(wrongName.status).toBe(401);
    expect(wrongPass.body).toEqual(wrongName.body);
    // The family passcode is not a password.
    expect((await request(app).post('/api/login').send({ name: 'Stéphanie', password: config.passcode })).status).toBe(401);
  });

  it('each person has their own password: one person cannot sign in as another', async () => {
    await login('Stéphanie');
    await request(app).post('/api/register').send({ name: 'Michaël', passcode: config.passcode, password: 'autre-secret' });
    expect((await request(app).post('/api/login').send({ name: 'Stéphanie', password: 'autre-secret' })).status).toBe(401);
    expect((await request(app).post('/api/login').send({ name: 'Michaël', password: 'autre-secret' })).status).toBe(200);
    expect((await request(app).post('/api/login').send({ name: 'Michaël', password: PASSWORD })).status).toBe(401);
  });

  it('first sign-in needs the family passcode and cannot overwrite an existing password', async () => {
    const bad = await request(app).post('/api/register').send({ name: 'Jade', passcode: 'nope', password: PASSWORD });
    expect(bad.status).toBe(401);
    const notMember = await request(app).post('/api/register').send({ name: 'Mallory', passcode: config.passcode, password: PASSWORD });
    expect(notMember.status).toBe(401);
    expect((await request(app).post('/api/login').send({ name: 'Stéphanie', password: PASSWORD })).status).toBe(409);

    await login('Stéphanie');
    const takeover = await request(app)
      .post('/api/register')
      .send({ name: 'Stéphanie', passcode: config.passcode, password: 'pirate-pass' });
    expect(takeover.status).toBe(409);
    expect((await request(app).post('/api/login').send({ name: 'Stéphanie', password: 'pirate-pass' })).status).toBe(401);
    expect((await request(app).post('/api/login').send({ name: 'Stéphanie', password: PASSWORD })).status).toBe(200);
  });

  it('rejects short passwords and stores only a salted hash', async () => {
    const short = await request(app).post('/api/register').send({ name: 'Stéphanie', passcode: config.passcode, password: '123' });
    expect(short.status).toBe(400);
    await login('Stéphanie');
    const row = (await db.execute('SELECT hash FROM credentials')).rows[0]['hash'] as string;
    expect(row).toMatch(/^scrypt\$/);
    expect(row).not.toContain(PASSWORD);
  });

  it('lists who already has a password so the sign-in form can adapt', async () => {
    await login('Stéphanie');
    const body = (await request(app).get('/api/members')).body;
    expect(body.members).toEqual(['Stéphanie', 'Michaël', 'Nathaniel']);
    expect(body.registered).toEqual(['Stéphanie']);
  });

  it('rate limits repeated wrong attempts', async () => {
    await login('Stéphanie');
    for (let i = 0; i < 10; i++) await request(app).post('/api/login').send({ name: 'Stéphanie', password: 'wrong-pass' });
    expect((await request(app).post('/api/login').send({ name: 'Stéphanie', password: PASSWORD })).status).toBe(429);
  });

  describe('password reset', () => {
    const reset = (body: object) => request(app).post('/api/reset-password').send(body);

    it('replaces the password with the family passcode: the old one stops working and the person is signed in', async () => {
      await login('Stéphanie');
      const before = (await db.execute('SELECT hash FROM credentials')).rows[0]['hash'];
      const res = await reset({ name: 'stephanie', passcode: config.passcode, password: 'nouveau-secret' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ name: 'Stéphanie' });
      expect(String(res.headers['set-cookie'])).toMatch(/HttpOnly/);
      const rows = (await db.execute('SELECT hash FROM credentials')).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]['hash']).not.toBe(before);
      expect(rows[0]['hash']).toMatch(/^scrypt\$/);
      expect((await request(app).post('/api/login').send({ name: 'Stéphanie', password: PASSWORD })).status).toBe(401);
      expect((await request(app).post('/api/login').send({ name: 'Stéphanie', password: 'nouveau-secret' })).status).toBe(200);
    });

    it('rejects a wrong passcode, unknown names and managed children with the same message, and changes nothing', async () => {
      await login('Stéphanie');
      const wrongCode = await reset({ name: 'Stéphanie', passcode: 'nope', password: 'nouveau-secret' });
      const unknown = await reset({ name: 'Mallory', passcode: config.passcode, password: 'nouveau-secret' });
      const unknownBadCode = await reset({ name: 'Mallory', passcode: 'nope', password: 'nouveau-secret' });
      expect(wrongCode.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrongCode.body).toEqual(unknown.body);
      expect(unknownBadCode.body).toEqual(unknown.body);
      expect((await reset({ name: 'Orélie', passcode: config.passcode, password: 'nouveau-secret' })).status).toBe(403);
      expect((await request(app).post('/api/login').send({ name: 'Stéphanie', password: PASSWORD })).status).toBe(200);
    });

    it('enforces the same password rules as the first sign-in', async () => {
      await login('Stéphanie');
      expect((await reset({ name: 'Stéphanie', passcode: config.passcode, password: '123' })).status).toBe(400);
      expect((await reset({ name: 'Stéphanie', passcode: config.passcode })).status).toBe(400);
      expect((await request(app).post('/api/login').send({ name: 'Stéphanie', password: PASSWORD })).status).toBe(200);
    });

    it('also works for someone who never set a password, and reveals nothing about claims', async () => {
      const res = await reset({ name: 'Nathaniel', passcode: config.passcode, password: 'nouveau-secret' });
      expect(res.status).toBe(200);
      expect(Object.keys(res.body)).toEqual(['name']);
    });

    it('rate limits wrong passcodes per address, then even the right one is refused', async () => {
      await login('Stéphanie');
      for (let i = 0; i < 10; i++) await reset({ name: 'Mallory', passcode: 'nope', password: 'nouveau-secret' });
      const res = await reset({ name: 'Stéphanie', passcode: config.passcode, password: 'nouveau-secret' });
      expect(res.status).toBe(429);
      expect((await request(app).post('/api/login').send({ name: 'Stéphanie', password: PASSWORD })).status).toBe(429);
    });

    it('rate limits per name even when the address changes', async () => {
      await login('Stéphanie');
      for (let i = 0; i < 10; i++) {
        await request(app).post('/api/reset-password').set('X-Forwarded-For', `10.0.0.${i}`).send({ name: 'Stéphanie', passcode: 'nope', password: 'nouveau-secret' });
      }
      const res = await request(app)
        .post('/api/reset-password')
        .set('X-Forwarded-For', '10.9.9.9')
        .send({ name: 'Stéphanie', passcode: config.passcode, password: 'nouveau-secret' });
      expect(res.status).toBe(429);
    });
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
    await login('Stéphanie');
    for (const typed of ['stephanie', 'STÉPHANIE', 'Ste\u0301phanie', ' Stéphanie ']) {
      const res = await request(app).post('/api/login').send({ name: typed, password: PASSWORD });
      expect(res.status, typed).toBe(200);
      expect(res.body.name).toBe('Stéphanie');
    }
    await login('Michaël');
    const michael = await request(app).post('/api/login').send({ name: 'michael', password: PASSWORD });
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
    await login('Stéphanie');
    const res = await request(app).post('/api/login').send({ name: 'stephanie', password: PASSWORD });
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

describe('editing an item and marking favorites', () => {
  it('the owner edits any field, and a partial patch leaves the others untouched', async () => {
    const alice = as(await login('Stéphanie'));
    const { body } = await alice.post('/api/items').send({ title: 'Socks', price: '10 $', note: 'blue', url: 'https://example.com/s' });
    const id = body.item.id as number;

    const res = await alice.patch(`/api/items/${id}`).send({ title: 'Wool socks', note: '' });
    expect(res.status).toBe(200);
    expect(res.body.item).toMatchObject({ id, title: 'Wool socks', note: null, price: '10 $', url: 'https://example.com/s', favorite: false });
    expect((await alice.get('/api/items')).body.items[0].title).toBe('Wool socks');
  });

  it('validates input', async () => {
    const alice = as(await login('Stéphanie'));
    const id = (await alice.post('/api/items').send({ title: 'Socks' })).body.item.id as number;
    expect((await alice.patch(`/api/items/${id}`).send({ title: '' })).status).toBe(400);
    expect((await alice.patch(`/api/items/${id}`).send({ url: 'javascript:alert(1)' })).status).toBe(400);
    expect((await alice.patch(`/api/items/${id}`).send({ favorite: 'yes' })).status).toBe(400);
    expect((await alice.patch(`/api/items/${id}`).send({})).status).toBe(400);
  });

  it('only the owner (or the manager of a managed list) can edit; others get 404', async () => {
    const alice = as(await login('Stéphanie'));
    const bob = as(await login('Michaël'));
    const id = (await alice.post('/api/items').send({ title: 'Socks' })).body.item.id as number;
    expect((await bob.patch(`/api/items/${id}`).send({ title: 'Hacked' })).status).toBe(404);
    expect((await alice.get('/api/items')).body.items[0].title).toBe('Socks');

    const child = (await bob.post('/api/items').send({ title: 'Lego', forName: 'Orélie' })).body.item.id as number;
    expect((await bob.patch(`/api/items/${child}`).send({ favorite: true })).status).toBe(200);
    expect((await alice.patch(`/api/items/${child}`).send({ title: 'Hacked' })).status).toBe(404);
  });

  it('favorites are visible to everyone and sorted first', async () => {
    const alice = as(await login('Stéphanie'));
    const bob = as(await login('Michaël'));
    const first = (await alice.post('/api/items').send({ title: 'First' })).body.item.id as number;
    await alice.post('/api/items').send({ title: 'Second' });
    await alice.patch(`/api/items/${first}`).send({ favorite: true });

    for (const who of [alice, bob]) {
      const items = (await who.get('/api/people/St%C3%A9phanie/items')).body.items;
      expect(items.map((i: { title: string }) => i.title)).toEqual(['First', 'Second']);
      expect(items[0].favorite).toBe(true);
    }
    await alice.patch(`/api/items/${first}`).send({ favorite: false });
    expect((await bob.get('/api/people/St%C3%A9phanie/items')).body.items[0].title).toBe('Second');
  });

  it('editing reveals nothing about claims: same response whether or not the item is claimed, and the claim survives', async () => {
    const alice = as(await login('Stéphanie'));
    const bob = as(await login('Michaël'));
    const plain = (await alice.post('/api/items').send({ title: 'Plain' })).body.item.id as number;
    const taken = (await alice.post('/api/items').send({ title: 'Taken' })).body.item.id as number;
    await bob.post(`/api/items/${taken}/claim`);

    const a = await alice.patch(`/api/items/${plain}`).send({ title: 'New', favorite: true });
    const b = await alice.patch(`/api/items/${taken}`).send({ title: 'New', favorite: true });
    expect(a.status).toBe(b.status);
    expect(Object.keys(b.body.item).sort()).toEqual(Object.keys(a.body.item).sort());
    expect(JSON.stringify(b.body).toLowerCase()).not.toContain('claim');

    const seen = (await bob.get('/api/people/St%C3%A9phanie/items')).body.items;
    expect(seen.find((i: { id: number }) => i.id === taken)).toMatchObject({ title: 'New', claimed: true, claimedByMe: true });
  });

  it('a removed item can no longer be edited', async () => {
    const alice = as(await login('Stéphanie'));
    const bob = as(await login('Michaël'));
    const id = (await alice.post('/api/items').send({ title: 'Socks' })).body.item.id as number;
    await bob.post(`/api/items/${id}/claim`);
    await alice.delete(`/api/items/${id}`);
    expect((await alice.patch(`/api/items/${id}`).send({ title: 'Back' })).status).toBe(404);
  });
});

describe('managed lists (a child without an account)', () => {
  it('the manager adds and removes items for the child, and sees the list without claim data', async () => {
    const bob = as(await login('Michaël'));
    const alice = as(await login('Stéphanie'));
    const created = await bob.post('/api/items').send({ title: 'Lego', forName: 'orelie' });
    expect(created.status).toBe(201);
    expect(created.body.item.owner).toBe('Orélie');
    const id = created.body.item.id as number;

    expect((await alice.post(`/api/items/${id}/claim`)).status).toBe(200);
    const asManager = await bob.get('/api/people/Or%C3%A9lie/items');
    expect(asManager.body.canManage).toBe(true);
    expect(JSON.stringify(asManager.body)).not.toMatch(/claim/i);
    expect((await alice.get('/api/people/Or%C3%A9lie/items')).body.items[0].claimed).toBe(true);

    expect((await bob.delete(`/api/items/${id}`)).status).toBe(200);
    expect((await alice.get('/api/reservations')).body.items[0].removed).toBe(true);
  });

  it('the manager cannot claim on the managed list; others cannot manage it', async () => {
    const bob = as(await login('Michaël'));
    const alice = as(await login('Stéphanie'));
    const { body } = await bob.post('/api/items').send({ title: 'Lego', forName: 'Orélie' });
    expect((await bob.post(`/api/items/${body.item.id}/claim`)).status).toBe(403);
    expect((await alice.post('/api/items').send({ title: 'Hack', forName: 'Orélie' })).status).toBe(403);
    expect((await alice.delete(`/api/items/${body.item.id}`)).status).toBe(404);
    expect((await alice.get('/api/people/Or%C3%A9lie/items')).body.canManage).toBe(false);
    expect((await alice.get('/api/people')).body.people.every((p: { canManage: boolean }) => !p.canManage)).toBe(true);
  });

  it('the managed person cannot sign in or register, and is not offered on the sign-in page', async () => {
    const reg = await request(app).post('/api/register').send({ name: 'Orélie', passcode: config.passcode, password: PASSWORD });
    expect(reg.status).toBe(403);
    const log = await request(app).post('/api/login').send({ name: 'Orélie', password: PASSWORD });
    expect(log.status).toBe(403);
    expect((await request(app).get('/api/members')).body.members).not.toContain('Orélie');
  });
});

describe('multi items (several people reserve the same gift, e.g. a gift card)', () => {
  async function giftCard() {
    const alice = as(await login('Stéphanie'));
    const bob = as(await login('Michaël'));
    const carol = as(await login('Nathaniel'));
    const { body } = await alice.post('/api/items').send({ title: 'Carte-cadeau', multi: true });
    return { alice, bob, carol, id: body.item.id as number };
  }

  it('lets several people reserve it and shows them each other, but never shows the owner', async () => {
    const { alice, bob, carol, id } = await giftCard();
    expect((await bob.post(`/api/items/${id}/claim`)).status).toBe(200);
    expect((await carol.post(`/api/items/${id}/claim`)).status).toBe(200);

    const seen = (await carol.get('/api/people/St%C3%A9phanie/items')).body.items[0];
    expect(seen.claimers).toEqual(['Michaël', 'Nathaniel']);
    expect(seen.claimed).toBe(false);
    expect(seen.claimedByMe).toBe(true);

    for (const url of ['/api/items', '/api/people', '/api/people/St%C3%A9phanie/items']) {
      expect(JSON.stringify((await alice.get(url)).body), url).not.toMatch(/claim/i);
    }
    for (const url of ['/api/items', '/api/people/St%C3%A9phanie/items']) {
      expect(JSON.stringify((await alice.get(url)).body), url).not.toMatch(/Michaël|Nathaniel/);
    }
    expect((await alice.get('/api/items')).body.items[0].multi).toBe(true);
  });

  it('only removes your own reservation, and the item stays for the others', async () => {
    const { bob, carol, id } = await giftCard();
    await bob.post(`/api/items/${id}/claim`);
    await carol.post(`/api/items/${id}/claim`);
    await bob.delete(`/api/items/${id}/claim`);
    const seen = (await carol.get('/api/people/St%C3%A9phanie/items')).body.items[0];
    expect(seen.claimers).toEqual(['Nathaniel']);
    expect((await bob.get('/api/reservations')).body.items).toHaveLength(0);
    expect((await carol.get('/api/reservations')).body.items).toHaveLength(1);
  });

  it('keeps single items exclusive and hides names on them', async () => {
    const alice = as(await login('Stéphanie'));
    const bob = as(await login('Michaël'));
    const carol = as(await login('Nathaniel'));
    const { body } = await alice.post('/api/items').send({ title: 'Socks' });
    const id = body.item.id as number;
    expect((await bob.post(`/api/items/${id}/claim`)).status).toBe(200);
    expect((await bob.post(`/api/items/${id}/claim`)).status).toBe(200);
    expect((await carol.post(`/api/items/${id}/claim`)).status).toBe(409);
    const seen = (await carol.get('/api/people/St%C3%A9phanie/items')).body.items[0];
    expect(seen).toMatchObject({ claimed: true, claimedByMe: false, claimers: [] });
  });

  it('upgrades a database whose claims table only allowed one claimer per item', async () => {
    const url = `file:${join(dir, `old-${Date.now()}.db`)}`;
    const old = createClient({ url });
    await old.batch(
      [
        'CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, title TEXT NOT NULL, url TEXT, image TEXT, price TEXT, note TEXT, created_at TEXT NOT NULL DEFAULT (datetime()))',
        'CREATE TABLE claims (item_id INTEGER PRIMARY KEY REFERENCES items (id) ON DELETE CASCADE, claimer TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime()))',
        "INSERT INTO items (owner, title) VALUES ('Stéphanie', 'Socks')",
        "INSERT INTO claims (item_id, claimer) VALUES (1, 'Michaël')",
      ],
      'write',
    );
    old.close();
    const upgraded = await openDb(url);
    opened.push(upgraded);
    await upgraded.execute("UPDATE items SET multi = 1 WHERE id = 1");
    await upgraded.execute("INSERT INTO claims (item_id, claimer) VALUES (1, 'Nathaniel')");
    expect((await upgraded.execute('SELECT claimer FROM claims ORDER BY claimer')).rows.map((r) => r['claimer'])).toEqual(['Michaël', 'Nathaniel']);
  });
});