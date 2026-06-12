import { Application } from 'pixi.js';
import { ReefScene }   from './scenes/ReefScene.js';
import { SCREEN_W, SCREEN_H, IS_PORTRAIT } from './constants.js';
import { setCurrentSlot, setCurrentBiome, getSlotPreview, clearSlot, clearBiome, getBiomePreview,
         getProfile, defaultProfile } from './save.js';
import { isAuthAvailable, onAuthChange, signIn, signOutUser } from './auth.js';
import { initCloudSave, onCloudSynced } from './cloudsave.js';
import { state } from './state.js';

async function main() {
  const app = new Application();

  // Begin PixiJS init immediately (runs while player reads start / slot pages)
  const initPromise = app.init({
    width:           SCREEN_W,
    height:          SCREEN_H,
    antialias:       true,
    backgroundColor: 0x1878c8,
    resolution:      Math.min(window.devicePixelRatio || 1, 2),
    autoDensity:     true,
  });

  function resize() {
    if (IS_PORTRAIT) {
      // Canvas matches viewport — just pin it; no letterboxing needed
      app.canvas.style.width  = `${SCREEN_W}px`;
      app.canvas.style.height = `${SCREEN_H}px`;
    } else {
      const scale = Math.min(window.innerWidth / SCREEN_W, window.innerHeight / SCREEN_H);
      app.canvas.style.width  = `${SCREEN_W * scale}px`;
      app.canvas.style.height = `${SCREEN_H * scale}px`;
    }
  }
  window.addEventListener('resize', resize);

  // 1. Start page → Begin
  await waitForBegin();

  // 2. Slot selection → choose a slot (always enter coral reef first)
  const slotIdx = await waitForSlotChoice();
  setCurrentSlot(slotIdx);
  setCurrentBiome('coral');

  // Seed state.profile from the slot — or fall back to a default if the slot
  // has no profile yet (empty slot, or legacy save from before profiles).
  state.profile = getProfile(slotIdx) ?? defaultProfile();

  // 3. Boot game
  await initPromise;
  document.body.appendChild(app.canvas);
  resize();
  new ReefScene(app);
  requestAnimationFrame(() => app.canvas.classList.add('visible'));
}

// ── Start page ─────────────────────────────────────────────────────────────

function waitForBegin() {
  return new Promise(resolve => {
    const btn = document.getElementById('start-btn');
    if (!btn) { resolve(); return; }
    btn.addEventListener('click', () => {
      document.body.classList.add('game-active');
      const sp = document.getElementById('start-page');
      if (sp) {
        sp.classList.add('fade-out');
        setTimeout(() => {
          sp.classList.add('hidden');
          sp.classList.remove('fade-out');
          openSlotPage();
        }, 480);
      }
      resolve();
    }, { once: true });
  });
}

// ── Slot selection page ────────────────────────────────────────────────────

function openSlotPage() {
  const pg = document.getElementById('slot-page');
  if (!pg) return;
  pg.classList.remove('hidden');
  requestAnimationFrame(() => pg.classList.add('visible'));
}

function waitForSlotChoice() {
  return new Promise(resolve => {
    buildSlotCards(resolve);
    initAuthUI(() => buildSlotCards(resolve));

    const back = document.getElementById('slp-back');
    if (back) back.addEventListener('click', () => window.location.reload(), { once: true });
  });
}

/**
 * Sign-in row above the slot cards. Renders nothing when cloud sync isn't
 * configured (firebase-config.js is null) — the game stays fully local.
 */
function initAuthUI(rebuildCards) {
  const row = document.getElementById('slp-auth');
  if (!row || !isAuthAvailable()) return;

  initCloudSave();
  onCloudSynced(rebuildCards);   // cloud pull changed local slots → refresh cards

  const render = user => {
    row.innerHTML = '';
    if (user) {
      row.appendChild(el('span', 'slp-auth-status',
        `☁️ Reefs synced — ${user.displayName ?? user.email ?? 'signed in'}`));
      const out = el('button', 'slp-auth-signout', 'Sign out');
      out.addEventListener('click', async () => {
        await signOutUser();
      });
      row.appendChild(out);
    } else {
      const btn = el('button', 'slp-auth-btn', '☁️ Sign in to sync your reefs');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Signing in…';
        try {
          await signIn();
        } catch (e) {
          console.warn('[auth] sign-in failed', e);
          render(null);
        }
      });
      row.appendChild(btn);
    }
  };

  render(null);
  onAuthChange(render);
}

function buildSlotCards(onChoose) {
  const wrap = document.getElementById('slp-cards');
  if (!wrap) return;
  wrap.innerHTML = '';

  for (let i = 0; i < 3; i++) {
    const preview = getSlotPreview(i);
    const card = el('div', 'slp-card');

    // Header — profile name + avatar when present, otherwise "Reef N"
    const profile = preview?.profile ?? null;
    const headerText = profile
      ? `${profile.avatar} ${profile.name}`
      : `Reef ${i + 1}`;
    card.appendChild(el('div', 'slp-card-header', headerText));

    // Body
    const body = el('div', 'slp-card-body');
    if (preview) {
      body.appendChild(el('div', 'slp-stat-level', `Level ${preview.level}`));
      const row = el('div', 'slp-stat-row');
      row.appendChild(el('span', '', `${preview.coralCount} coral`));
      row.appendChild(el('span', '', `${preview.fishCount} fish`));
      body.appendChild(row);
    } else {
      body.appendChild(el('div', 'slp-empty', 'Empty'));
    }
    card.appendChild(body);

    // Button row: Load + Erase (Erase only on occupied slots)
    const btnRow = el('div', 'slp-btn-row');

    const playBtn = el('button', 'slp-play-btn', preview ? 'Load' : 'Start');
    playBtn.addEventListener('click', () => {
      const pg = document.getElementById('slot-page');
      if (pg) { pg.classList.add('fade-out'); setTimeout(() => pg.remove(), 520); }
      onChoose(i);
    });
    btnRow.appendChild(playBtn);

    if (preview) {
      const eraseBtn = el('button', 'slp-erase-btn', 'Erase');
      let confirmTimeout = null;

      eraseBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (eraseBtn.classList.contains('confirming')) {
          // Second click — confirmed
          clearTimeout(confirmTimeout);
          clearSlot(i);
          buildSlotCards(onChoose);
        } else {
          // First click — ask for confirmation
          eraseBtn.classList.add('confirming');
          eraseBtn.textContent = 'Sure?';
          confirmTimeout = setTimeout(() => {
            eraseBtn.classList.remove('confirming');
            eraseBtn.textContent = 'Erase';
          }, 3000);
        }
      });
      btnRow.appendChild(eraseBtn);
    }

    card.appendChild(btnRow);

    // Biome chips — show occupancy; chips with data are resettable
    const onRebuild = () => buildSlotCards(onChoose);
    const biomesRow = el('div', 'slp-biomes');
    biomesRow.appendChild(makeBiomeChip(i, 'coral',        '🪸', 'Coral Reef',  onRebuild));
    biomesRow.appendChild(makeBiomeChip(i, 'seagrass',     '🌿', 'Seagrass',    onRebuild));
    biomesRow.appendChild(makeBiomeChip(i, 'deepTwilight', '🌌', 'Twilight',    onRebuild));
    card.appendChild(biomesRow);

    wrap.appendChild(card);
  }
}

/** Tiny helper to create a DOM element. */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls)  e.className   = cls;
  if (text) e.textContent = text;
  return e;
}

/**
 * Build a biome chip for the slot card.
 * If the biome has data, the chip is a button with a confirm-to-reset flow.
 * If empty, it renders as a dim non-interactive label.
 */
/**
 * Build a biome chip for the slot card.
 * If the biome has saved data, the chip is a button with a confirm-to-reset flow.
 * If empty, it renders as a dim non-interactive label.
 * onReset() should rebuild the slot card list.
 */
function makeBiomeChip(slotIdx, biome, icon, label, onReset) {
  const hasData = !!getBiomePreview(slotIdx, biome);
  const chip    = el('button', 'slp-biome-chip' + (hasData ? '' : ' slp-biome-empty'), `${icon} ${label}`);

  if (!hasData) {
    chip.disabled = true;
    return chip;
  }

  let confirming     = false;
  let confirmTimeout = null;

  chip.addEventListener('click', e => {
    e.stopPropagation();
    if (confirming) {
      clearTimeout(confirmTimeout);
      clearBiome(slotIdx, biome);
      onReset();
    } else {
      confirming = true;
      chip.textContent = '✕ Reset?';
      chip.classList.add('confirming');
      confirmTimeout = setTimeout(() => {
        confirming = false;
        chip.textContent = `${icon} ${label}`;
        chip.classList.remove('confirming');
      }, 3000);
    }
  });

  return chip;
}

main().catch(console.error);
