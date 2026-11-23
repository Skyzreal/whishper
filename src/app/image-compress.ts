/** Longest side of an uploaded picture, in pixels. */
export const MAX_SIDE = 1000;
/** Target size of the compressed picture. The server refuses anything above 400 KB. */
export const TARGET_BYTES = 300 * 1024;
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

/** Scales (width, height) down so the longest side is at most `max`; never scales up. */
export function fitSize(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Decoded size of a base64 data URL. */
export function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() };
    } catch {
      /* fall back to an <img> element below */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("Ce fichier n'est pas une image que je sais lire");
  }
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

/** Shrinks a photo in the browser to a JPEG data URL of at most ~300 KB, so uploads stay small and fast. */
export async function compressImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') throw new Error("Ce fichier n'est pas une photo");
  if (file.size > MAX_INPUT_BYTES) throw new Error('Cette photo est vraiment trop grosse');
  const { source, width, height, release } = await decode(file);
  try {
    let side = MAX_SIDE;
    for (let attempt = 0; attempt < 6; attempt++) {
      const size = fitSize(width, height, side);
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Impossible de préparer la photo sur cet appareil");
      // JPEG has no transparency: put transparent PNGs on white instead of black.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.drawImage(source, 0, 0, size.width, size.height);
      for (const quality of [0.82, 0.7, 0.58, 0.45]) {
        const out = canvas.toDataURL('image/jpeg', quality);
        if (!out.startsWith('data:image/jpeg')) throw new Error("Impossible de préparer la photo sur cet appareil");
        if (dataUrlBytes(out) <= TARGET_BYTES) return out;
      }
      side = Math.round(side * 0.75);
    }
  } finally {
    release();
  }
  throw new Error('Cette photo est trop lourde, essaie-en une autre');
}
