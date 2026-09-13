// Renders the App Store Connect promotional images (1024×1024, opaque, no
// rounded corners) for each in-app purchase — one per pearl pack.
// Usage: node scripts/render-iap-images.mjs   → assets/iap/<productSuffix>.png
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

// Keep in sync with the Pearl Shop in src/3d/ReefScene3D.js and App Store Connect.
const PACKS = [
  { id: 'pearls10', pearls: 10, label: 'Small Pack' },
  { id: 'pearls35', pearls: 35, label: 'Medium Pack' },
  { id: 'pearls60', pearls: 60, label: 'Large Pack' },
];

// Pearl pile layouts, as [x, y, r] relative to the clam's centre.
const PILES = {
  pearls10: [[-70, -10, 58], [70, -10, 58], [0, -80, 66]],
  pearls35: [[-118, 0, 50], [-40, 4, 52], [42, 4, 52], [120, 0, 50],
             [-80, -80, 50], [0, -88, 54], [80, -80, 50]],
  pearls60: [[-150, 6, 46], [-78, 8, 50], [0, 10, 52], [78, 8, 50], [150, 6, 46],
             [-115, -70, 48], [-38, -74, 50], [38, -74, 50], [115, -70, 48],
             [-76, -146, 48], [0, -152, 52], [76, -146, 48],
             [-38, -222, 46], [38, -222, 46]],
};

const pearl = ([x, y, r]) => `
  <circle cx="${x}" cy="${y}" r="${r}" fill="url(#pearl)"/>
  <ellipse cx="${x - r * 0.32}" cy="${y - r * 0.38}" rx="${r * 0.26}" ry="${r * 0.16}"
           fill="#ffffff" opacity="0.85" transform="rotate(-30 ${x - r * 0.32} ${y - r * 0.38})"/>`;

const sparkle = (x, y, s, o = 0.9) => `
  <path d="M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s} Z"
        fill="#ffffff" opacity="${o}"/>`;

const bubble = (x, y, r, w, o) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#ffffff" stroke-width="${w}" opacity="${o}"/>`;

function svgFor(pack) {
  const pile = PILES[pack.id];
  const sparkles = {
    pearls10: [[300, 470, 22], [740, 430, 16]],
    pearls35: [[270, 440, 22], [760, 400, 18], [700, 560, 12]],
    pearls60: [[250, 420, 24], [780, 380, 20], [700, 300, 14], [330, 330, 12], [760, 560, 12]],
  }[pack.id];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#70d4f8"/>
      <stop offset="40%" stop-color="#28a0e0"/>
      <stop offset="75%" stop-color="#1468b0"/>
      <stop offset="100%" stop-color="#0a3050"/>
    </linearGradient>
    <radialGradient id="pearl" cx="0.38" cy="0.34" r="0.75">
      <stop offset="0%"   stop-color="#ffffff"/>
      <stop offset="45%"  stop-color="#f4eef2"/>
      <stop offset="80%"  stop-color="#d7c6d3"/>
      <stop offset="100%" stop-color="#a98fa6"/>
    </radialGradient>
    <linearGradient id="shellTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#ffb8c8"/>
      <stop offset="100%" stop-color="#d9708f"/>
    </linearGradient>
    <linearGradient id="shellBot" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#ffd0da"/>
      <stop offset="100%" stop-color="#c85d80"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%"  stop-color="#ffffff" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1024" height="1024" fill="url(#sea)"/>

  <!-- light rays -->
  <polygon points="300,0 420,0 260,620 200,600" fill="#ffffff" opacity="0.08"/>
  <polygon points="520,0 660,0 560,560 470,540" fill="#ffffff" opacity="0.06"/>

  <!-- bubbles -->
  ${bubble(820, 330, 26, 8, 0.5)}
  ${bubble(880, 230, 16, 6, 0.4)}
  ${bubble(770, 440, 12, 5, 0.35)}
  ${bubble(190, 380, 18, 6, 0.4)}
  ${bubble(150, 470, 10, 5, 0.3)}

  <!-- sand mound -->
  <ellipse cx="512" cy="980" rx="620" ry="160" fill="#e8c98a"/>
  <ellipse cx="512" cy="1000" rx="620" ry="150" fill="#d4b070" opacity="0.6"/>

  <!-- glow behind the clam -->
  <ellipse cx="512" cy="640" rx="360" ry="300" fill="url(#glow)"/>

  <!-- clam, open: top shell tilted back, pearls sit on the bottom shell -->
  <g transform="translate(512 700)">
    <!-- top shell -->
    <g transform="rotate(-22) translate(0 -40)">
      <path d="M-250 0 C-250 -170 -120 -260 0 -260 C120 -260 250 -170 250 0 Z" fill="url(#shellTop)"/>
      <g stroke="#ffffff" stroke-width="10" fill="none" opacity="0.35" stroke-linecap="round">
        <path d="M0 -12 L-150 -190"/><path d="M0 -12 L-70 -235"/>
        <path d="M0 -12 L0 -250"/><path d="M0 -12 L70 -235"/><path d="M0 -12 L150 -190"/>
      </g>
      <!-- lip shadow -->
      <path d="M-250 0 C-160 -30 160 -30 250 0 Z" fill="#7a2f52" opacity="0.35"/>
    </g>

    <!-- pearls -->
    ${pile.map(pearl).join('')}

    <!-- bottom shell (in front of the pearls) -->
    <path d="M-250 -10 C-250 130 -120 200 0 200 C120 200 250 130 250 -10 Z" fill="url(#shellBot)"/>
    <g stroke="#ffffff" stroke-width="10" fill="none" opacity="0.30" stroke-linecap="round">
      <path d="M0 0 L-150 150"/><path d="M0 0 L-70 185"/>
      <path d="M0 0 L0 195"/><path d="M0 0 L70 185"/><path d="M0 0 L150 150"/>
    </g>
    <path d="M-250 -10 C-160 20 160 20 250 -10 Z" fill="#ffffff" opacity="0.35"/>
  </g>

  ${sparkles.map(([x, y, s]) => sparkle(x, y, s)).join('')}

  <!-- label -->
  <text x="512" y="175" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="150" font-weight="800" fill="#ffffff" stroke="#0a3050" stroke-width="14"
        paint-order="stroke" stroke-linejoin="round">${pack.pearls}</text>
  <text x="512" y="270" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="84" font-weight="700" fill="#ffffff" stroke="#0a3050" stroke-width="10"
        paint-order="stroke" stroke-linejoin="round" letter-spacing="4">PEARLS</text>
</svg>`;
}

await mkdir('assets/iap', { recursive: true });
for (const pack of PACKS) {
  const out = `assets/iap/${pack.id}.png`;
  await sharp(Buffer.from(svgFor(pack))).resize(1024, 1024).flatten({ background: '#0a3050' }).png().toFile(out);
  console.log(`Rendered ${out} (${pack.label}, ${pack.pearls} pearls)`);
}
