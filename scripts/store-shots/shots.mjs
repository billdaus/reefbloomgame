import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const ZONES = { seagrass: { cx: -32, cz: 0, floorY: 0.5 }, coral: { cx: 0, cz: 0, floorY: -0.1 }, deepTwilight: { cx: 32, cz: 0, floorY: -4.5 } };
const LAYER_B = new Set(['yellowTang','blueTang','moorishIdol','cuttlefish','dolphin','flameAngelfish','pufferfish','spottedEagleRay','seaTurtle','anglerfish','nautilus']);
const corals = []; const plant = (b, list) => list.forEach(([id, c, r]) => corals.push({ b, c, r, id }));
plant('coral', [['starter',0,0],['starter',9,9],['firetip',1,2],['ghost',8,1],['staghorn',2,7],['finger',7,7],['brain',3,3],['lettuce',6,2],['star',1,6],['bubble',8,5],['candycane',0,4],['toadstool',5,8],['elkhorn',9,3],['pillar',2,0],['table',5,5],['staghorn',7,4],['brain',4,1],['lettuce',1,8],['star',8,8],['bubble',3,6],['anemoneHome',4,4],['essenceVault',9,6],['firetip',6,0],['ghost',0,9],['candycane',9,0],['toadstool',2,4],['finger',5,2]]);
plant('seagrass', [['barnacles',1,1],['redSeagrass',3,2],['seaweed',5,1],['seagrass',7,3],['kelp',2,6],['sunCoral',8,7],['lagoonFan',4,8],['seagrass',6,6],['seaweed',1,8],['redSeagrass',8,1],['kelp',5,4],['barnacles',0,5],['fireCoral',3,5],['tidepoolAnemone',7,8]]);
plant('deepTwilight', [['twilightBrain',2,2],['abyssalFan',6,1],['lanternCoral',4,5],['phantomPolyp',8,4],['wispCoral',1,7],['twilightBrain',7,7],['abyssalFan',3,8],['lanternCoral',8,8],['wispCoral',5,3],['reefCave',0,0]]);
const fish = []; let fi = 0;
const school = (b, id, n) => { for (let k = 0; k < n; k++) { const i = fi++, z = ZONES[b], half = 13, R = Math.min(3 + (i % 5) * 1.2, half - 1);
  const cx = z.cx + ((i * 7) % 9 - 4), cz = z.cz + ((i * 5) % 9 - 4);
  fish.push({ id, b, cx: Math.max(z.cx - (half - R), Math.min(z.cx + (half - R), cx)), cz: Math.max(z.cz - (half - R), Math.min(z.cz + (half - R), cz)), R,
    y: z.floorY + 1.9 + (i % 4) * 1.1 + (LAYER_B.has(id) ? 1.5 : 0), w: (0.12 + (i % 4) * 0.05) * (i % 2 ? 1 : -1), phase: i * 1.37, bob: 0.4 + (i % 3) * 0.2, bobw: 0.6 + (i % 3) * 0.3 }); } };
[['coral','blueChromis',4],['coral','chromis',4],['coral','clownfish',2],['coral','yellowTang',2],['coral','blueTang',1],['coral','butterflyfish',2],['coral','moorishIdol',1],['coral','seahorse',1],['coral','neonGoby',2],['coral','royalGramma',1],['coral','flameAngelfish',1],['coral','mandarinfish',1],['coral','cuttlefish',1],['coral','dolphin',1],['coral','cardinalfish',2],
 ['seagrass','pipefish',2],['seagrass','horseshoeCrab',1],['seagrass','pufferfish',1],['seagrass','parrotfish',2],['seagrass','spottedEagleRay',1],['seagrass','seaTurtle',1],['seagrass','sandDollar',1],
 ['deepTwilight','lanternfish',3],['deepTwilight','flashlightFish',2],['deepTwilight','dragonfish',1],['deepTwilight','anglerfish',1],['deepTwilight','nautilus',1],['deepTwilight','hatchetfish',2]].forEach(a => school(...a));
const seen = [...new Set([...corals.map(c => c.id), ...fish.map(f => f.id)])]; const now = Date.now();
const save = (timeOfDay) => ({ be: 4260, polyps: 262, pearls: 184, harmony: 88, level: 12, timeOfDay, corals, fish, seen, exp: {}, eggs: [], stations: [], ev3: null, excl: [], dq: null,
  ach: ['first_coral','reef_keeper','coral_variety','full_house','aquarist','harmonious','thriving','janitor','collector','nightfall','expander','beachcomber','deep_roots'],
  sawNight: true, packs: { rare: 1, epic: 1 }, vouchers: { brain: 1 }, seasonPacks: [], nest: [{ t: 'rare', at: now + 240e3 }, { t: 'legendary', at: now + 2500e3 }],
  starterEggs: true, starterPack: true, survey: null, coralDisc: true, quiz: null, dailyPack: '', tut: true, tutp: true });
const DEVICES = [{ name: 'iphone65', viewport: { width: 428, height: 926 }, dpr: 3, mobile: true }, { name: 'ipad13', viewport: { width: 1366, height: 1024 }, dpr: 2, mobile: false }];
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true }); const wait = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--enable-unsafe-swiftshader'] });
for (const dev of DEVICES) for (const [tag, tod] of [['day', 0.3], ['night', 0.9]]) {
  const ctx = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.dpr, isMobile: dev.mobile, hasTouch: dev.mobile });
  await ctx.addInitScript((s) => { if (location.pathname.endsWith('threed.html') && !sessionStorage.getItem('seeded')) { localStorage.setItem('reefbloom_3d_slot', '1'); localStorage.setItem('reefbloom_3d_save_v1_s1', JSON.stringify(s)); localStorage.setItem('rb3d_music', 'off'); sessionStorage.setItem('seeded', '1'); } }, save(tod));
  const page = await ctx.newPage(); page.on('pageerror', e => console.log('  pageerror:', e.message));
  await page.goto('http://localhost:5173/threed.html', { waitUntil: 'load' }); await wait(9000);
  const shot = async (name) => { await page.screenshot({ path: `${OUT}/${dev.name}-${tag}-${name}.png`, type: 'png' }); };
  const tidy = () => page.evaluate(() => { document.querySelectorAll('.modal3d').forEach(m => { m.style.display = 'none'; }); const so = document.getElementById('shop-overlay'); if (so) so.style.display = 'none'; document.getElementById('boot-error')?.remove();
    if (!document.getElementById('shot-css')) { const st = document.createElement('style'); st.id = 'shot-css'; st.textContent = '#bubbles-speech,#menu3d,#back,#slots,#hint,#version-badge-3d,#fish-toast{display:none!important}'; document.head.appendChild(st); }
    document.documentElement.classList.add('app-shell'); });
  const palette = (v) => page.evaluate((show) => document.getElementById('palette')?.classList.toggle('hidden', !show), v);
  await tidy(); await palette(false); await wait(400); await shot('reef'); await palette(true);
  if (tag === 'day') {
    const menu = (t) => page.evaluate((x) => [...document.querySelectorAll('.menu-btn')].find(b => b.textContent.includes(x))?.click(), t);
    await menu('Journal'); await wait(1500); await shot('journal');
    await page.evaluate(() => document.querySelector('.modal3d [data-sp="clownfish"]')?.click()); await wait(800); await shot('species');
    await tidy(); await menu('🎁'); await wait(800); await shot('packs'); await tidy();
  }
  await ctx.close();
}
await browser.close(); console.log('captured');
