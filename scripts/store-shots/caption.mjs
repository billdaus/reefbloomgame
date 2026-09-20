import { createRequire } from 'node:module'; import { mkdirSync } from 'node:fs';
const sharp = createRequire(new URL('../../package.json', import.meta.url))('sharp');
const S = process.argv[2], OUT = process.argv[3]; mkdirSync(OUT, { recursive: true });
const SET = [['day-reef', 'Grow a living coral reef'], ['night-reef', 'Watch it glow after dark'], ['day-journal', 'Record 130 species, real and imagined'], ['day-species', 'Learn the science behind every fish'], ['day-packs', 'Earn packs with every level']];
for (const dev of [{ id: 'iphone65', w: 1284, h: 2778, fs: 66, band: 300 }, { id: 'ipad13', w: 2732, h: 2048, fs: 84, band: 260, bottom: true }]) {
  let n = 1;
  for (const [name, text] of SET) {
    const svg = `<svg width="${dev.w}" height="${dev.band}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="${dev.bottom ? 1 : 0}" x2="0" y2="${dev.bottom ? 0 : 1}"><stop offset="0" stop-color="#041424" stop-opacity="0.92"/><stop offset="1" stop-color="#041424" stop-opacity="0"/></linearGradient></defs><rect width="${dev.w}" height="${dev.band}" fill="url(#g)"/><text x="${dev.w / 2}" y="${dev.bottom ? dev.band * 0.62 : dev.band * 0.5}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${dev.fs}" font-weight="700" fill="#ffffff" stroke="#041424" stroke-width="6" paint-order="stroke" stroke-linejoin="round">${text}</text></svg>`;
    await sharp(`${S}/${dev.id}-${name}.png`).composite([{ input: Buffer.from(svg), top: dev.bottom ? dev.h - dev.band : 0, left: 0 }]).flatten({ background: '#041424' }).png({ compressionLevel: 9 }).toFile(`${OUT}/${dev.id}-${n}-${name}.png`);
    n++;
  }
}
console.log('captioned');
