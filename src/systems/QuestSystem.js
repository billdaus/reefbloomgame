import { state } from '../state.js';
import { BE_MAX } from '../constants.js';

// ── Challenge pool ────────────────────────────────────────────────────────────

const CHALLENGE_POOL = [
  {
    type: 'place_coral',
    labels:  ['Place {n} coral', 'Place {n} coral', 'Place {n} coral'],
    targets: [3, 6, 10],
    be:      [40, 65, 100],
  },
  {
    type: 'hatch_fish',
    labels:  ['Hatch {n} fish', 'Hatch {n} fish', 'Hatch {n} fish'],
    targets: [2, 4, 6],
    be:      [35, 60, 95],
  },
  {
    type: 'earn_be',
    labels:  ['Earn {n} 🫧 today', 'Earn {n} 🫧 today', 'Earn {n} 🫧 today'],
    targets: [100, 250, 500],
    be:      [45, 75, 110],
  },
  {
    type: 'idle_streak',
    labels:  ['Trigger idle bonus once', 'Trigger idle bonus {n}×', 'Trigger idle bonus {n}×'],
    targets: [1, 2, 3],
    be:      [30, 55, 85],
  },
  {
    type: 'reach_harmony',
    labels:  ['Reach {n} Harmony', 'Reach {n} Harmony', 'Reach {n} Harmony'],
    targets: [25, 50, 75],
    be:      [40, 70, 0],
    pearls:  [0,  0,  25],
  },
  {
    type: 'have_fish',
    labels:  ['Have {n} fish alive', 'Have {n} fish alive', 'Have {n} fish alive'],
    targets: [3, 8, 15],
    be:      [30, 55, 0],
    pearls:  [0,  0,  25],
  },
  {
    type: 'have_coral',
    labels:  ['Have {n} coral placed', 'Have {n} coral placed', 'Have {n} coral placed'],
    targets: [5, 12, 20],
    be:      [30, 55, 0],
    pearls:  [0,  0,  25],
  },
];

const SNAPSHOT_TYPES    = new Set(['reach_harmony', 'have_fish', 'have_coral']);
const INCREMENTAL_TYPES = new Set(['place_coral', 'hatch_fish', 'earn_be', 'idle_streak']);

// ── Internal ──────────────────────────────────────────────────────────────────

let _onChange = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function _today() {
  return new Date().toISOString().slice(0, 10);
}

function _tier() {
  return Math.min(2, Math.floor((state.level - 1) / 3));
}

function _generateQuest(today) {
  const tier = _tier();

  // Deterministic shuffle seeded by date
  let seed = 0;
  for (let i = 0; i < today.length; i++) seed = (seed * 31 + today.charCodeAt(i)) >>> 0;

  const pool = [...CHALLENGE_POOL];
  const picked = [];
  while (picked.length < 3 && pool.length > 0) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const idx = seed % pool.length;
    picked.push(pool.splice(idx, 1)[0]);
  }

  const challenges = picked.map((def, i) => ({
    id:       `${def.type}_${i}`,
    type:     def.type,
    label:    def.labels[tier].replace('{n}', def.targets[tier]),
    target:   def.targets[tier],
    progress: 0,
    done:     false,
  }));

  // Combined reward = sum of all challenge payouts
  const totalBE     = picked.reduce((s, d) => s + (d.be?.[tier]     ?? 0), 0);
  const totalPearls = picked.reduce((s, d) => s + (d.pearls?.[tier] ?? 0), 0);

  return {
    date:       today,
    status:     'available',   // 'available' | 'active' | 'complete' | 'claimed'
    challenges,
    reward:     { be: totalBE, pearls: totalPearls },
  };
}

function _updateStatus() {
  const q = state.quest;
  if (!q || q.status === 'claimed' || q.status === 'available') return;
  const allDone = q.challenges.every(c => c.done);
  if (allDone && q.status !== 'complete') {
    q.status = 'complete';
    _onChange?.();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Call once at scene startup. Generates a fresh quest if date has changed. */
export function initQuests(onChange) {
  _onChange = onChange;
  const today = _today();
  if (!state.quest || state.quest.date !== today) {
    state.quest = _generateQuest(today);
    _onChange?.();
  }
  checkSnapshotQuests();
}

/** Player tapped the clam — move from 'available' → 'active'. */
export function acceptQuest() {
  const q = state.quest;
  if (!q || q.status !== 'available') return;
  q.status = 'active';
  _onChange?.();
}

/** Fire for incremental events: 'place_coral', 'hatch_fish', 'earn_be', 'idle_streak'. */
export function recordQuestEvent(type, amount = 1) {
  const q = state.quest;
  if (!q || q.status !== 'active') return;
  let changed = false;
  for (const c of q.challenges) {
    if (c.done || !INCREMENTAL_TYPES.has(c.type) || c.type !== type) continue;
    c.progress = Math.min(c.target, c.progress + amount);
    if (c.progress >= c.target) c.done = true;
    changed = true;
  }
  if (changed) {
    _updateStatus();
    _onChange?.();
  }
}

/** Re-check snapshot challenges against live state. */
export function checkSnapshotQuests() {
  const q = state.quest;
  if (!q || q.status === 'available' || q.status === 'claimed') return;
  let changed = false;
  for (const c of q.challenges) {
    if (!SNAPSHOT_TYPES.has(c.type)) continue;
    let val = 0;
    if (c.type === 'reach_harmony') val = state.harmony;
    if (c.type === 'have_fish')     val = state.fishCount;
    if (c.type === 'have_coral')    val = state.coralCount;
    const prev = c.done;
    c.progress = Math.min(c.target, val);
    c.done     = val >= c.target;
    if (c.done !== prev) changed = true;
  }
  if (changed) {
    _updateStatus();
    _onChange?.();
  }
}

/** Player tapped the glowing clam — apply reward, mark claimed. Returns true on success. */
export function claimQuest() {
  const q = state.quest;
  if (!q || q.status !== 'complete') return false;
  q.status = 'claimed';
  if (q.reward.be)     state.be     = Math.min(state.be + q.reward.be, BE_MAX);
  if (q.reward.pearls) state.pearls += q.reward.pearls;
  _onChange?.();
  return true;
}

export function getQuestStatus() {
  return state.quest?.status ?? null;
}

export function hasUnclaimed() {
  return state.quest?.status === 'complete';
}
