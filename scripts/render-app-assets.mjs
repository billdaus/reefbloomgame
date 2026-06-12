// Renders assets/icon.svg into the PNG sources that @capacitor/assets
// consumes (icon.png 1024², splash.png / splash-dark.png 2732²).
// Usage: node scripts/render-app-assets.mjs
import sharp from 'sharp';

await sharp('assets/icon.svg').resize(1024, 1024).png().toFile('assets/icon.png');

const art = await sharp('assets/icon.svg').resize(1200, 1200).png().toBuffer();

for (const [file, background] of [
  ['assets/splash.png', '#1468b0'],
  ['assets/splash-dark.png', '#0a3050'],
]) {
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background } })
    .composite([{ input: art, gravity: 'center' }])
    .png()
    .toFile(file);
}

console.log('Rendered assets/icon.png, splash.png, splash-dark.png');
