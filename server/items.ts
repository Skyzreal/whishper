import type { Client } from '@libsql/client';
import type { Picture } from './picture';

const COLUMNS = 'id, owner, title, url, image, price, note, multi, favorite, picture_v, created_at';
const NEEDS_SOMETHING = 'Ajoute au moins un titre, un lien ou une photo';

/** What an owner sees about their own item. Deliberately has no claim-related fields. */
export interface OwnItem {
  id: number;
  owner: string;
  /** Empty for picture-only items. */
  title: string;
  url: string | null;
  /** The uploaded picture when there is one, otherwise the preview scraped from the link. */
  image: string | null;
  /** True when `image` is an uploaded picture rather than a scraped one. */
  hasPicture: boolean;
  price: string | null;
  note: string | null;
  /** Several people may each reserve it (e.g. a gift card), and they can see each other's names. */
  multi: boolean;
  /** Marked by the owner as something they especially want; visible to everyone and sorted first. */
  favorite: boolean;
  createdAt: string;
}

/** What someone else sees. The claimer's identity is never exposed, only whether it is them. */
export interface OtherItem extends OwnItem {
  /** Always false for multi items: they stay available. */
  claimed: boolean;
  claimedByMe: boolean;
  /** Only filled for multi items, where reservers are meant to see each other. Always empty otherwise. */
  claimers: string[];
}

export interface ItemInput {
  title: string;
  url?: string | null;
  image?: string | null;
  price?: string | null;
  note?: string | null;
  multi?: boolean;
  favorite?: boolean;
  picture?: Picture | null;
}

/** Fields to change on an existing item; a missing key is left untouched, null clears the field. */
export interface ItemPatch {
  title?: string;
  url?: string | null;
  image?: string | null;
  price?: string | null;
  note?: string | null;
  multi?: boolean;
  favorite?: boolean;
  picture?: Picture | null;
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
  const id = Number(row['id']);
  const pictureV = row['picture_v'] == null ? null : Number(row['picture_v']);
  return {
    id,
    owner: String(row['owner']),
    title: String(row['title']),
    url: (row['url'] as string | null) ?? null,
    image: pictureV !== null ? `/api/items/${id}/picture?v=${pictureV}` : ((row['image'] as string | null) ?? null),
    hasPicture: pictureV !== null,
    price: (row['price'] as string | null) ?? null,
    note: (row['note'] as string | null) ?? null,
    multi: Number(row['multi']) === 1,
    favorite: Number(row['favorite']) === 1,
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
      sql: `SELECT ${COLUMNS} FROM items WHERE owner = ? AND deleted_at IS NULL ORDER BY favorite DESC, id DESC`,
      args: [owner],
    });
    return res.rows.map((r) => toOwnItem(r as unknown as Record<string, unknown>));
  }

  const res = await db.execute({
    sql: `SELECT i.id, i.owner, i.title, i.url, i.image, i.price, i.note, i.multi, i.favorite, i.picture_v, i.created_at, c.claimer AS claimer
          FROM items i LEFT JOIN claims c ON c.item_id = i.id
          WHERE i.owner = ? AND i.deleted_at IS NULL ORDER BY i.favorite DESC, i.id DESC, c.created_at, c.claimer`,
    args: [owner],
  });
  const byId = new Map<number, OtherItem>();
  for (const r of res.rows) {
    const row = r as unknown as Record<string, unknown>;
    const claimer = (row['claimer'] as string | null) ?? null;
    const base = toOwnItem(row);
    let item = byId.get(base.id);
    if (!item) {
      item = { ...base, claimed: false, claimedByMe: false, claimers: [] };
      byId.set(base.id, item);
    }
    if (claimer === null) continue;
    if (claimer === viewer) item.claimedByMe = true;
    if (base.multi) item.claimers.push(claimer);
    else item.claimed = true;
  }
  return [...byId.values()];
}

export async function countItemsByOwner(db: Client): Promise<Map<string, number>> {
  const res = await db.execute('SELECT owner, COUNT(*) AS n FROM items WHERE deleted_at IS NULL GROUP BY owner');
  return new Map(res.rows.map((r) => [String(r['owner']), Number(r['n'])]));
}

export async function addItem(db: Client, owner: string, input: ItemInput): Promise<OwnItem> {
  if (!input.title && !input.url && !input.picture) throw new HttpError(400, NEEDS_SOMETHING);
  const tx = await db.transaction('write');
  try {
    const res = await tx.execute({
      sql: `INSERT INTO items (owner, title, url, image, price, note, multi, favorite, picture_v) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING ${COLUMNS}`,
      args: [owner, input.title, input.url ?? null, input.image ?? null, input.price ?? null, input.note ?? null, input.multi ? 1 : 0, input.favorite ? 1 : 0, input.picture ? Date.now() : null],
    });
    const row = res.rows[0] as unknown as Record<string, unknown>;
    if (input.picture) {
      await tx.execute({
        sql: 'INSERT INTO item_pictures (item_id, mime, data) VALUES (?, ?, ?)',
        args: [Number(row['id']), input.picture.mime, new Uint8Array(input.picture.data)],
      });
    }
    await tx.commit();
    return toOwnItem(row);
  } finally {
    tx.close();
  }
}

/**
 * `owners` is the viewer plus anyone whose list they manage. Touches only the `items` and `item_pictures` tables
 * and answers the same whether or not the item is claimed, so editing can't be used to probe claims.
 */
export async function updateOwnItem(db: Client, owners: string[], itemId: number, patch: ItemPatch): Promise<OwnItem | null> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  const set = (column: string, value: string | number | null) => {
    sets.push(`${column} = ?`);
    args.push(value);
  };
  if (patch.title !== undefined) set('title', patch.title);
  if (patch.url !== undefined) set('url', patch.url);
  if (patch.image !== undefined) set('image', patch.image);
  if (patch.price !== undefined) set('price', patch.price);
  if (patch.note !== undefined) set('note', patch.note);
  if (patch.multi !== undefined) set('multi', patch.multi ? 1 : 0);
  if (patch.favorite !== undefined) set('favorite', patch.favorite ? 1 : 0);
  if (patch.picture !== undefined) set('picture_v', patch.picture ? Date.now() : null);
  if (!sets.length) throw new HttpError(400, 'Rien à modifier');

  const tx = await db.transaction('write');
  try {
    const current = await tx.execute({
      sql: `SELECT title, url, picture_v FROM items WHERE id = ? AND owner IN (${owners.map(() => '?').join(',')}) AND deleted_at IS NULL`,
      args: [itemId, ...owners],
    });
    if (!current.rows.length) {
      await tx.rollback();
      return null;
    }
    const cur = current.rows[0];
    const title = patch.title !== undefined ? patch.title : String(cur['title']);
    const url = patch.url !== undefined ? patch.url : ((cur['url'] as string | null) ?? null);
    const hasPicture = patch.picture !== undefined ? patch.picture !== null : cur['picture_v'] != null;
    if (!title && !url && !hasPicture) throw new HttpError(400, NEEDS_SOMETHING);

    const res = await tx.execute({
      sql: `UPDATE items SET ${sets.join(', ')} WHERE id = ? RETURNING ${COLUMNS}`,
      args: [...args, itemId],
    });
    if (patch.picture) {
      await tx.execute({
        sql: 'INSERT INTO item_pictures (item_id, mime, data) VALUES (?, ?, ?) ON CONFLICT (item_id) DO UPDATE SET mime = excluded.mime, data = excluded.data',
        args: [itemId, patch.picture.mime, new Uint8Array(patch.picture.data)],
      });
    } else if (patch.picture === null) {
      await tx.execute({ sql: 'DELETE FROM item_pictures WHERE item_id = ?', args: [itemId] });
    }
    await tx.commit();
    return toOwnItem(res.rows[0] as unknown as Record<string, unknown>);
  } finally {
    tx.close();
  }
}

/**
 * The uploaded picture of an item, or null. Visible on a live item to any signed-in member; once the owner
 * removed the item only the people holding a claim on it can still see it. Every other case is
 * indistinguishable from "no such picture", so this reveals nothing about claims.
 */
export async function getPictureForViewer(db: Client, viewer: string, itemId: number): Promise<Picture | null> {
  const res = await db.execute({
    sql: `SELECT p.mime, p.data FROM item_pictures p JOIN items i ON i.id = p.item_id
          WHERE p.item_id = ? AND (i.deleted_at IS NULL
            OR EXISTS (SELECT 1 FROM claims c WHERE c.item_id = i.id AND c.claimer = ?))`,
    args: [itemId, viewer],
  });
  if (!res.rows.length) return null;
  const data = res.rows[0]['data'];
  return { mime: String(res.rows[0]['mime']), data: Buffer.from(data as ArrayBuffer) };
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
      await tx.execute({ sql: 'DELETE FROM item_pictures WHERE item_id = ?', args: [itemId] });
      await tx.execute({ sql: 'DELETE FROM items WHERE id = ?', args: [itemId] });
    }
    await tx.commit();
    return true;
  } finally {
    tx.close();
  }
}

export async function claimItem(db: Client, viewer: string, itemId: number, managedByViewer: string[] = []): Promise<void> {
  const item = await db.execute({ sql: 'SELECT owner, multi FROM items WHERE id = ? AND deleted_at IS NULL', args: [itemId] });
  if (!item.rows.length) throw new HttpError(404, 'Cadeau introuvable');
  const owner = String(item.rows[0]['owner']);
  if (owner === viewer) throw new HttpError(403, 'Tu ne peux pas réserver un cadeau de ta propre liste');
  // A manager gets the owner view of the list, so they must not be able to claim (and thereby see claims).
  if (managedByViewer.includes(owner)) throw new HttpError(403, 'Tu gères cette liste : tu ne peux pas y réserver de cadeau');

  // Single-claimer items are claimed atomically; multi items let everyone add their own claim.
  const multi = Number(item.rows[0]['multi']) === 1;
  const ins = await db.execute({
    sql: multi
      ? 'INSERT OR IGNORE INTO claims (item_id, claimer) VALUES (?, ?)'
      : 'INSERT INTO claims (item_id, claimer) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM claims WHERE item_id = ?)',
    args: multi ? [itemId, viewer] : [itemId, viewer, itemId],
  });
  if (ins.rowsAffected === 0 && !multi) {
    const existing = await db.execute({ sql: 'SELECT 1 FROM claims WHERE item_id = ? AND claimer = ?', args: [itemId, viewer] });
    if (!existing.rows.length) throw new HttpError(409, "Quelqu'un a déjà réservé ce cadeau");
  }
}

/** Only ever removes the viewer's own claim; succeeds silently otherwise so nothing can be probed. */
export async function unclaimItem(db: Client, viewer: string, itemId: number): Promise<void> {
  await db.execute({ sql: 'DELETE FROM claims WHERE item_id = ? AND claimer = ?', args: [itemId, viewer] });
  // Once nobody holds a claim on an item its owner removed, nothing needs it any more.
  await db.batch(
    [
      {
        sql: `DELETE FROM item_pictures WHERE item_id = ?
              AND EXISTS (SELECT 1 FROM items WHERE id = item_pictures.item_id AND deleted_at IS NOT NULL)
              AND NOT EXISTS (SELECT 1 FROM claims WHERE item_id = item_pictures.item_id)`,
        args: [itemId],
      },
      {
        sql: `DELETE FROM items WHERE id = ? AND deleted_at IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM claims WHERE item_id = items.id)`,
        args: [itemId],
      },
    ],
    'write',
  );
}

/** An item the viewer reserved. `removed` is true when its owner took it off their list. */
export interface Reservation extends OwnItem {
  removed: boolean;
}

export async function listReservations(db: Client, viewer: string): Promise<Reservation[]> {
  const res = await db.execute({
    sql: `SELECT i.id, i.owner, i.title, i.url, i.image, i.price, i.note, i.multi, i.favorite, i.picture_v, i.created_at, i.deleted_at
          FROM claims c JOIN items i ON i.id = c.item_id
          WHERE c.claimer = ? ORDER BY i.owner, i.id DESC`,
    args: [viewer],
  });
  return res.rows.map((r) => {
    const row = r as unknown as Record<string, unknown>;
    return { ...toOwnItem(row), removed: row['deleted_at'] != null };
  });
}
