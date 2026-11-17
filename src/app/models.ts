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
  /** Add to the list of someone whose list you manage, instead of your own. */
  forName?: string;
}

export interface PersonList {
  owner: string;
  isMe: boolean;
  canManage?: boolean;
  items: Item[];
}
