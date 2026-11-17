import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface Preview {
  title: string;
  image: string | null;
  price: string | null;
  url: string;
}

export type Resolver = (hostname: string) => Promise<string[]>;

const defaultResolver: Resolver = async (hostname) =>
  (await dnsLookup(hostname, { all: true })).map((r) => r.address);

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 3;

export function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase();
  if (isIP(v) === 6) {
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('fc') || v.startsWith('fd') || /^fe[89ab]/.test(v)) return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  const [a, b] = v.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export async function assertPublicUrl(raw: string, resolve: Resolver = defaultResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http(s) links are supported');
  if (url.username || url.password) throw new Error('URLs with credentials are not allowed');

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('That address is not allowed');
  }
  const addresses = isIP(host) ? [host] : await resolve(host);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error('That address is not allowed');
  return url;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function metaTags(html: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? '';
    }
    const key = (attrs['property'] ?? attrs['name'] ?? attrs['itemprop'] ?? '').toLowerCase();
    if (key && attrs['content'] && !map.has(key)) map.set(key, decodeEntities(attrs['content']).trim());
  }
  return map;
}

function jsonLdPrice(html: string): string | null {
  for (const block of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const m = block[1].match(/"price"\s*:\s*"?([0-9][0-9.,]*)"?/);
    if (m) {
      const cur = block[1].match(/"priceCurrency"\s*:\s*"([A-Za-z]{3})"/);
      return cur ? `${m[1]} ${cur[1].toUpperCase()}` : m[1];
    }
  }
  return null;
}

function absolutize(maybe: string | undefined, base: URL): string | null {
  if (!maybe) return null;
  try {
    const u = new URL(maybe, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function parsePreview(html: string, pageUrl: URL): Preview {
  const meta = metaTags(html);
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = (meta.get('og:title') ?? meta.get('twitter:title') ?? (titleTag ? decodeEntities(titleTag) : ''))
    .replace(/\s+/g, ' ')
    .trim();

  const amount = meta.get('product:price:amount') ?? meta.get('og:price:amount');
  const currency = meta.get('product:price:currency') ?? meta.get('og:price:currency');
  const price = amount ? (currency ? `${amount} ${currency}` : amount) : jsonLdPrice(html);

  return {
    title: (title || pageUrl.hostname.replace(/^www\./, '')).slice(0, 200),
    image: absolutize(meta.get('og:image') ?? meta.get('twitter:image'), pageUrl),
    price: price ? price.slice(0, 50) : null,
    url: pageUrl.toString(),
  };
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks));
}

/** Never throws for fetch problems: falls back to a hostname-only preview so adding an item always works. */
export async function fetchPreview(
  raw: string,
  opts: { fetchImpl?: typeof fetch; resolve?: Resolver } = {},
): Promise<Preview> {
  const doFetch = opts.fetchImpl ?? fetch;
  let url = await assertPublicUrl(raw, opts.resolve);
  const fallback = parsePreview('', url);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await doFetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; WhishperBot/1.0; family wishlist link preview)',
          accept: 'text/html,application/xhtml+xml',
        },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = await assertPublicUrl(new URL(res.headers.get('location')!, url).toString(), opts.resolve);
        continue;
      }
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !/html|xml/i.test(type)) return parsePreview('', url);
      return parsePreview(await readCapped(res), url);
    }
  } catch {
    return fallback;
  }
  return fallback;
}
