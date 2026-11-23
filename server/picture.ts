import { HttpError } from './items';

/** The browser shrinks photos before sending them, so anything bigger is refused. */
export const MAX_PICTURE_BYTES = 400 * 1024;
/** Room for MAX_PICTURE_BYTES as base64 plus the rest of the JSON body. */
export const PICTURE_BODY_LIMIT = '700kb';

export interface Picture {
  mime: string;
  data: Buffer;
}

const DATA_URL = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/;

/** Detects the real type from the first bytes; the declared type is never trusted. SVG and anything else is refused. */
export function sniffImageType(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 6 && (b.subarray(0, 6).toString('latin1') === 'GIF87a' || b.subarray(0, 6).toString('latin1') === 'GIF89a')) return 'image/gif';
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

export function parsePicture(value: unknown): Picture {
  if (typeof value !== 'string') throw new HttpError(400, 'La photo est invalide');
  // Cheap bound before running the regex or decoding anything.
  if (value.length > Math.ceil((MAX_PICTURE_BYTES * 4) / 3) + 64) throw new HttpError(413, 'La photo est trop lourde');
  const m = DATA_URL.exec(value);
  if (!m) throw new HttpError(400, 'La photo doit être une image JPEG, PNG, WebP ou GIF');
  const data = Buffer.from(m[2], 'base64');
  if (data.length > MAX_PICTURE_BYTES) throw new HttpError(413, 'La photo est trop lourde');
  const mime = sniffImageType(data);
  if (!mime || mime !== m[1]) throw new HttpError(400, 'La photo doit être une image JPEG, PNG, WebP ou GIF');
  return { mime, data };
}
