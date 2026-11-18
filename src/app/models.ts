export interface Item {
  id: number;
  owner: string;
  title: string;
  url: string | null;
  image: string | null;
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
  title: string;
  url?: string;
  image?: string;
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
  price?: string;
  note?: string;
  multi?: boolean;
  favorite?: boolean;
}

export interface PersonList {
  owner: string;
  isMe: boolean;
  canManage?: boolean;
  items: Item[];
}
