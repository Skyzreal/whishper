export interface Item {
  id: number;
  owner: string;
  title: string;
  url: string | null;
  image: string | null;
  /** True when `image` is a picture someone uploaded rather than a link preview. */
  hasPicture?: boolean;
  price: string | null;
  note: string | null;
  createdAt: string;
  /** Only present on other people's lists, never on your own. */
  claimed?: boolean;
  claimedByMe?: boolean;
  /** Several people can reserve it. */
  multi?: boolean;
  /** The owner especially wants this one; shown first with a star. */
  favorite?: boolean;
  /** Names of everyone who reserved a multi item (never filled for other items). */
  claimers?: string[];
  /** Only on the reservations page: the owner took this item off their list. */
  removed?: boolean;
}

export interface Person {
  name: string;
  itemCount: number;
  /** True when you manage this person's list (they have no account of their own). */
  canManage?: boolean;
}

export interface Preview {
  title: string;
  image: string | null;
  price: string | null;
  url: string;
  /** True when the page gave no real title (blocked or generic), so the user should check the fields. */
  partial: boolean;
}

export interface NewItem {
  /** Optional when there is a link or a picture. */
  title?: string;
  url?: string;
  image?: string;
  /** A JPEG/PNG/WebP/GIF data URL, already shrunk by the browser. */
  picture?: string;
  price?: string;
  note?: string;
  multi?: boolean;
  favorite?: boolean;
  /** Add to the list of someone whose list you manage, instead of your own. */
  forName?: string;
}

/** Empty strings clear a field; a missing key leaves it unchanged. */
export interface ItemPatch {
  title?: string;
  url?: string;
  image?: string;
  /** A new picture as a data URL, or null to remove the uploaded one. */
  picture?: string | null;
  price?: string;
  note?: string;
  multi?: boolean;
  favorite?: boolean;
}

export const PICTURE_ONLY_LABEL = 'Idée cadeau';

/** What to call an item: its title, else the site of its link, else a neutral label (picture-only items). */
export function itemLabel(item: Pick<Item, 'title' | 'url'>): string {
  const title = item.title.trim();
  if (title) return title;
  try {
    return new URL(item.url ?? '').hostname.replace(/^www\./, '') || PICTURE_ONLY_LABEL;
  } catch {
    return PICTURE_ONLY_LABEL;
  }
}

export interface PersonList {
  owner: string;
  isMe: boolean;
  canManage?: boolean;
  items: Item[];
}
