// Génère les icônes de l'app dans public/ à partir des deux images sources.
// Usage : npm i --no-save sharp && node scripts/build-icons.mjs <icone-fond-bleu.png> <boite-transparente.png>
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const [appIcon, boxIcon] = process.argv.slice(2);
if (!appIcon || !boxIcon) {
  console.error('Usage: node scripts/build-icons.mjs <icone-fond-bleu.png> <boite-transparente.png>');
  process.exit(1);
}

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const NAVY = { r: 20, g: 38, b: 72, alpha: 1 };
await mkdir(out, { recursive: true });

// Boîte sans fond : on rogne au contenu, puis on la centre sur un carré transparent.
const trimmed = await sharp(boxIcon).trim({ threshold: 1 }).png().toBuffer();
const square = async (size, pad = 0.04) => {
  const inner = Math.round(size * (1 - pad * 2));
  const box = await sharp(trimmed)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: box, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
};

const favicon16 = await square(16, 0);
const favicon32 = await square(32, 0.02);
const favicon48 = await square(48, 0.02);
await writeFile(join(out, 'favicon-16.png'), favicon16);
await writeFile(join(out, 'favicon-32.png'), favicon32);

// .ico multi-tailles (PNG intégrés : 16, 32, 48).
const images = [favicon16, favicon32, favicon48];
const sizes = [16, 32, 48];
const header = Buffer.alloc(6 + images.length * 16);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((img, i) => {
  const e = 6 + i * 16;
  header.writeUInt8(sizes[i], e);
  header.writeUInt8(sizes[i], e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(img.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += img.length;
});
await writeFile(join(out, 'favicon.ico'), Buffer.concat([header, ...images]));

// Icône d'app (fond bleu arrondi).
const app = (size) => sharp(appIcon).resize(size, size).png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 });
await app(180).toFile(join(out, 'apple-touch-icon.png'));
await app(192).toFile(join(out, 'icon-192.png'));
await app(512).toFile(join(out, 'icon-512.png'));
await app(128).toFile(join(out, 'logo.png'));

// Variante "maskable" : fond bleu plein, icône réduite dans la zone de sécurité (80 %).
const inner = await app(Math.round(512 * 0.78)).toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: NAVY } })
  .composite([{ input: inner, gravity: 'centre' }])
  .png({ compressionLevel: 9 })
  .toFile(join(out, 'icon-maskable-512.png'));

console.log('Icônes générées dans', out);
