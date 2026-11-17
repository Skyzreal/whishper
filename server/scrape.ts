import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface Preview {
  title: string;
  image: string | null;
  price: string | null;
  url: string;
  partial: boolean;
}

export type Resolver = (hostname: string) => Promise<string[]>;

const defaultResolver: Resolver = async (hostname) =>
  (await dnsLookup(hostname, { all: true })).map((r) => r.address);

// Shops often serve a bot-check page to unknown clients, so look like an ordinary browser.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
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
    throw new Error('Lien invalide');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Seuls les liens http(s) sont acceptés');
  if (url.username || url.password) throw new Error('Les liens avec identifiants ne sont pas permis');

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error("Cette adresse n'est pas permise");
  }
  const addresses = isIP(host) ? [host] : await resolve(host);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error("Cette adresse n'est pas permise");
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

const AMAZON_HOST = /(^|\.)amazon\.[a-z.]{2,6}$/i;

export function isAmazon(url: URL): boolean {
  return AMAZON_HOST.test(url.hostname);
}

/** "www.amazon.co.uk" -> "amazon" */
function brandName(url: URL): string {
  const parts = url.hostname.replace(/^www\./i, '').toLowerCase().split('.');
  if (parts.length < 2) return parts[0];
  const sld = parts[parts.length - 2];
  return ['co', 'com', 'org', 'net', 'ac'].includes(sld) && parts.length > 2 ? parts[parts.length - 3] : sld;
}

const GENERIC_TITLE_EXACT =
  /^(sorry|oops|error|not found|page not found|sign in|log in|login|please wait|forbidden|service unavailable|d[ée]sol[ée]e?|erreur|page introuvable|connexion|s'identifier)[ !.]*$/i;
const GENERIC_TITLE_CONTAINS =
  /robot check|captcha|are you a (robot|human)|access denied|just a moment|attention required|verifying you are human|enter the characters|v[ée]rification|human verification/i;

/** True for site names ("Amazon"), error pages and bot-check interstitials: titles that say nothing about the product. */
export function isGenericTitle(title: string, pageUrl: URL): boolean {
  const n = title.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!n) return true;
  const brand = brandName(pageUrl);
  const host = pageUrl.hostname.replace(/^www\./i, '').toLowerCase();
  const withoutTld = n.replace(/\.[a-z.]{2,6}$/, '');
  if (n === brand || n === host || withoutTld === brand) return true;
  if (/^[a-z]+ ?(\.[a-z.]+)?( ?[-:|] ?| )(sign.?in|log.?in|connexion|error|erreur)$/.test(n) && n.startsWith(brand)) return true;
  return GENERIC_TITLE_EXACT.test(n) || GENERIC_TITLE_CONTAINS.test(n);
}

const BLOCKED_PAGE =
  /validateCaptcha|enter the characters you see below|type the characters you see in this image|api-services-support@amazon|automated access to amazon|cf-browser-verification|id="challenge-form"|<title>\s*(robot check|just a moment\.\.\.|attention required)/i;

export function isBlockedPage(html: string): boolean {
  return BLOCKED_PAGE.test(html);
}

/** Site-wide logos, favicons and placeholders are not a picture of the gift. */
export function isGenericImage(src: string, pageUrl: URL): boolean {
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return true;
  }
  if (/(^|[/_.-])(logo|favicon|sprite|placeholder|brand|og[-_]?default|default[-_]?image)([/_.\d-]|$)/i.test(u.pathname)) return true;
  // Amazon product pictures live under /images/I/; everything else (/images/G/ ...) is site chrome.
  if (isAmazon(pageUrl) && !u.pathname.includes('/images/I/')) return true;
  return false;
}

/** "/CAROTE-Cookware-Induction/dp/B0ABC12345" -> "CAROTE Cookware Induction" */
export function titleFromAmazonUrl(url: URL): string | null {
  if (!isAmazon(url)) return null;
  const segs = url.pathname.split('/').filter(Boolean);
  const i = segs.findIndex((s) => ['dp', 'product', 'd'].includes(s.toLowerCase()));
  const raw = i > 0 ? segs[i - 1] : null;
  if (!raw) return null;
  let slug = raw;
  try {
    slug = decodeURIComponent(raw);
  } catch {
    /* keep the raw segment */
  }
  slug = slug.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (slug.length < 3 || /^[A-Z0-9]{10}$/.test(slug) || ['gp', 'dp', 'product', 'exec', 'ref'].includes(slug.toLowerCase())) return null;
  return slug.slice(0, 200);
}

function cleanTitle(raw: string | undefined, pageUrl: URL): string {
  let t = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (isAmazon(pageUrl)) {
    // "Amazon.ca: Product name: Home & Kitchen" -> "Product name"
    t = t.replace(/^amazon\.[a-z.]+\s*:\s*/i, '');
    const parts = t.split(/\s*:\s+/);
    if (parts.length > 1 && parts[parts.length - 1].length <= 40) t = parts.slice(0, -1).join(': ');
  }
  return t;
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

interface LdProduct {
  name?: string;
  image?: string;
}

function findLdProduct(node: unknown): LdProduct | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findLdProduct(n);
      if (f) return f;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  const o = node as Record<string, unknown>;
  const type = o['@type'];
  if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) {
    const img = Array.isArray(o['image']) ? o['image'][0] : o['image'];
    return {
      name: typeof o['name'] === 'string' ? o['name'] : undefined,
      image: typeof img === 'string' ? img : typeof (img as { url?: unknown })?.url === 'string' ? (img as { url: string }).url : undefined,
    };
  }
  return findLdProduct(o['@graph']);
}

function jsonLdProduct(html: string): LdProduct {
  for (const block of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const found = findLdProduct(JSON.parse(block[1]));
      if (found) return found;
    } catch {
      /* ignore invalid JSON-LD */
    }
  }
  return {};
}

function amazonDom(html: string): { title?: string; image?: string } {
  const title = html.match(/<span[^>]+id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
  const imgTag = html.match(/<img[^>]+id=["']landingImage["'][^>]*>/i)?.[0] ?? '';
  const attr = (name: string) => imgTag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1];
  let image = attr('data-old-hires') || undefined;
  if (!image) {
    const dyn = attr('data-a-dynamic-image');
    if (dyn) {
      try {
        image = Object.keys(JSON.parse(decodeEntities(dyn)))[0];
      } catch {
        /* ignore */
      }
    }
  }
  return { title: title ? stripTags(title) : undefined, image: image || attr('src') };
}

export function parsePreview(rawHtml: string, pageUrl: URL): Preview {
  const html = isBlockedPage(rawHtml) ? '' : rawHtml;
  const meta = metaTags(html);
  const ld = jsonLdProduct(html);
  const dom = isAmazon(pageUrl) ? amazonDom(html) : {};
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  const titles = [
    dom.title,
    meta.get('og:title'),
    meta.get('twitter:title'),
    ld.name,
    titleTag ? decodeEntities(titleTag) : undefined,
  ];
  let found = '';
  for (const raw of titles) {
    const t = cleanTitle(raw, pageUrl);
    if (t && !isGenericTitle(t, pageUrl)) {
      found = t;
      break;
    }
  }

  let image: string | null = null;
  for (const raw of [meta.get('og:image'), meta.get('twitter:image'), ld.image, dom.image]) {
    const abs = absolutize(raw, pageUrl);
    if (abs && !isGenericImage(abs, pageUrl)) {
      image = abs;
      break;
    }
  }

  const amount = meta.get('product:price:amount') ?? meta.get('og:price:amount');
  const currency = meta.get('product:price:currency') ?? meta.get('og:price:currency');
  const price = amount ? (currency ? `${amount} ${currency}` : amount) : jsonLdPrice(html);

  return {
    title: (found || titleFromAmazonUrl(pageUrl) || '').slice(0, 200),
    image,
    price: price ? price.slice(0, 50) : null,
    url: pageUrl.toString(),
    // True when the page gave us no real title, so the UI can ask the user to fill it in.
    partial: !found,
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
          'user-agent': BROWSER_UA,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'fr-CA,fr;q=0.9,en-CA;q=0.8,en;q=0.7',
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
