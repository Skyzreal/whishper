import type { Client } from '@libsql/client';

/** What an owner sees about their own item. Deliberately has no claim-related fields. */
export interface OwnItem {
  id: number;
  owner: string;
  title: string;
  url: string | null;
  image: string | null;
  price: string | null;
  note: string | null;
  createdAt: string;
}

/** What someone else sees. The claimer's identity is never exposed, only whether it is them. */
export interface OtherItem extends OwnItem {
  claimed: boolean;
  claimedByMe: boolean;
}

export interface ItemInput {
  title: string;
  url?: string | null;
  image?: string | null;
  price?: string | null;
  note?: string | null;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function toOwnItem(row: Record<string, unknown>): OwnItem {
  return {
    id: Number(row['id']),
    owner: String(row['owner']),
    title: String(row['title']),
    url: (row['url'] as string | null) ?? null,
    image: (row['image'] as string | null) ?? null,
    price: (row['price'] as string | null) ?? null,
    note: (row['note'] as string | null) ?? null,
    createdAt: String(row['created_at']),
  };
}

/**
 * THE privacy boundary. When the viewer is the owner this reads only the `items`
 * table and returns objects without any claim fields. Everyone else gets a
 * `claimed` flag and `claimedByMe`, never the claimer's name.
 */
export async function getListForViewer(
  db: Client,
  viewer: string,
  owner: string,
): Promise<OwnItem[] | OtherItem[]> {
  if (viewer === owner) {
    const res = await db.execute({
      sql: 'SELECT id, owner, title, url, image, price, note, created_at FROM items WHERE owner = ? AND deleted_at IS NULL ORDER BY id DESC',
      args: [owner],
    });
    return res.rows.map((r) => toOwnItem(r as unknown as Record<string, unknown>));
  }

  const res = await db.execute({
    sql: `SELECT i.id, i.owner, i.title, i.url, i.image, i.price, i.note, i.created_at, c.claimer AS claimer
          FROM items i LEFT JOIN claims c ON c.item_id = i.id
          WHERE i.owner = ? AND i.deleted_at IS NULL ORDER BY i.id DESC`,
    args: [owner],
  });
  return res.rows.map((r) => {
    const row = r as unknown as Record<string, unknown>;
    const claimer = (row['claimer'] as string | null) ?? null;
    return { ...toOwnItem(row), claimed: claimer !== null, claimedByMe: claimer === viewer };
  });
}

export async function countItemsByOwner(db: Client): Promise<Map<string, number>> {
  const res = await db.execute('SELECT owner, COUNT(*) AS n FROM items WHERE deleted_at IS NULL GROUP BY owner');
  return new Map(res.rows.map((r) => [String(r['owner']), Number(r['n'])]));
}

export async function addItem(db: Client, owner: string, input: ItemInput): Promise<OwnItem> {
  const res = await db.execute({
    sql: `INSERT INTO items (owner, title, url, image, price, note) VALUES (?, ?, ?, ?, ?, ?)
          RETURNING id, owner, title, url, image, price, note, created_at`,
    args: [owner, input.title, input.url ?? null, input.image ?? null, input.price ?? null, input.note ?? null],
  });
  return toOwnItem(res.rows[0] as unknown as Record<string, unknown>);
}

/** `owners` is the viewer plus anyone whose list they manage; all of them get the owner view. */
export async function deleteOwnItem(db: Client, owners: string[], itemId: number): Promise<boolean> {
  const tx = await db.transaction('write');
  try {
    const found = await tx.execute({
      sql: `SELECT id FROM items WHERE id = ? AND owner IN (${owners.map(() => '?').join(',')}) AND deleted_at IS NULL`,
      args: [itemId, ...owners],
    });
    if (!found.rows.length) {
      await tx.rollback();
      return false;
    }
    // A claimed item is only hidden so the claimer keeps seeing it; either way the owner gets the same answer.
    const claimed = await tx.execute({ sql: 'SELECT 1 FROM claims WHERE item_id = ?', args: [itemId] });
    if (claimed.rows.length) {
      await tx.execute({
        sql: "UPDATE items SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        args: [itemId],
      });
    } else {
      await tx.execute({ sql: 'DELETE FROM items WHERE id = ?', args: [itemId] });
    }
    await tx.commit();
    return true;
  } finally {
    tx.close();
  }
}

export async function claimItem(db: Client, viewer: string, itemId: number, managedByViewer: string[] = []): Promise<void> {
  const item = await db.execute({ sql: 'SELECT owner FROM items WHERE id = ? AND deleted_at IS NULL', args: [itemId] });
  if (!item.rows.length) throw new HttpError(404, 'Cadeau introuvable');
  const owner = String(item.rows[0]['owner']);
  if (owner === viewer) throw new HttpError(403, 'Tu ne peux pas réserver un cadeau de ta propre liste');
  // A manager gets the owner view of the list, so they must not be able to claim (and thereby see claims).
  if (managedByViewer.includes(owner)) throw new HttpError(403, 'Tu gères cette liste : tu ne peux pas y réserver de cadeau');

  const ins = await db.execute({
    sql: 'INSERT OR IGNORE INTO claims (item_id, claimer) VALUES (?, ?)',
    args: [itemId, viewer],
  });
  if (ins.rowsAffected === 0) {
    const existing = await db.execute({ sql: 'SELECT claimer FROM claims WHERE item_id = ?', args: [itemId] });
    if (existing.rows[0]?.['claimer'] !== viewer) throw new HttpError(409, "Quelqu'un a déjà réservé ce cadeau");
  }
}

/** Only ever removes the viewer's own claim; succeeds silently otherwise so nothing can be probed. */
export async function unclaimItem(db: Client, viewer: string, itemId: number): Promise<void> {
  await db.execute({ sql: 'DELETE FROM claims WHERE item_id = ? AND claimer = ?', args: [itemId, viewer] });
  // Once nobody holds a claim on an item its owner removed, nothing needs it any more.
  await db.execute({
    sql: `DELETE FROM items WHERE id = ? AND deleted_at IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM claims WHERE item_id = items.id)`,
    args: [itemId],
  });
}

/** An item the viewer reserved. `removed` is true when its owner took it off their list. */
export interface Reservation extends OwnItem {
  removed: boolean;
}

export async function listReservations(db: Client, viewer: string): Promise<Reservation[]> {
  const res = await db.execute({
    sql: `SELECT i.id, i.owner, i.title, i.url, i.image, i.price, i.note, i.created_at, i.deleted_at
          FROM claims c JOIN items i ON i.id = c.item_id
          WHERE c.claimer = ? ORDER BY i.owner, i.id DESC`,
    args: [viewer],
  });
  return res.rows.map((r) => {
    const row = r as unknown as Record<string, unknown>;
    return { ...toOwnItem(row), removed: row['deleted_at'] != null };
  });
}
