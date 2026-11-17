import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'whishper_session';
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30;

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('base64url');

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPasscode(given: unknown, expected: string): boolean {
  return typeof given === 'string' && safeEqual(given.trim(), expected);
}

export function createSessionToken(name: string, secret: string, now = Date.now()): string {
  const payload = b64url(JSON.stringify({ u: name, exp: now + SESSION_MAX_AGE_S * 1000 }));
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns the signed-in member name, or null if the token is missing, tampered with, expired or stale. */
export function verifySessionToken(
  token: string | undefined,
  secret: string,
  members: string[],
  now = Date.now(),
): string | null {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  if (!safeEqual(token.slice(dot + 1), sign(payload, secret))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { u?: unknown; exp?: unknown };
    if (typeof data.u !== 'string' || typeof data.exp !== 'number' || data.exp < now) return null;
    return members.includes(data.u) ? data.u : null;
  } catch {
    return null;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* ignore malformed cookie */
    }
  }
  return out;
}
