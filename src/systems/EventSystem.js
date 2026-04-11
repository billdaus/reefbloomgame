import { state } from '../state.js';
import { BE_MAX } from '../constants.js';

// ── Event schedule ─────────────────────────────────────────────────────────────
// Pass tiers unlock as the player completes daily quests after buying the pass.
// threshold = number of daily quests that must be claimed to unlock that tier.

export const EVENT_SCHEDULE = [
  {
    id:          'coral_bloom_2026',
    name:        'Coral Bloom Festival',
    icon:        '🌸',
    theme:       0xff8fab,
    startDate:   '2026-04-11',
    endDate:     '2026-04-17',
    description: 'The reef awakens in full bloom! Grow your coral and find harmony.',
    challenges: [
      { type: 'place_coral',   label: 'Place 15 coral',    target: 15 },
      { type: 'reach_harmony', label: 'Reach 60 Harmony',  target: 60 },
      { type: 'have_fish',     label: 'Have 10 fish alive', target: 10 },
    ],
    reward: { be: 300, pearls: 75 },
    pass: {
      tiers: [
        { threshold: 1, reward: { be: 100 },              label: '100 🫧'          },
        { threshold: 2, reward: { pearls: 20 },           label: '20 💎'           },
        { threshold: 3, reward: { be: 200 },              label: '200 🫧'          },
        { threshold: 4, reward: { exclusive: 'sakuraAnthias' }, label: '🌸 Sakura Anthias' },
      ],
    },
  },
  {
    id:          'moonfish_migration_2026',
    name:        'Moonfish Migration',
    icon:        '🐟',
    theme:       0x64b5f6,
    startDate:   '2026-05-01',
    endDate:     '2026-05-07',
    description: 'Schools of rare fish pass through — fill your reef with life!',
    challenges: [
      { type: 'hatch_fish',  label: 'Hatch 12 fish',         target: 12   },
      { type: 'earn_be',     label: 'Earn 1,000 🫧',          target: 1000 },
      { type: 'idle_streak', label: 'Trigger idle bonus 5×',  target: 5    },
    ],
    reward: { be: 250, pearls: 50 },
    pass: {
      tiers: [
        { threshold: 1, reward: { be: 75 },               label: '75 🫧'   },
        { threshold: 2, reward: { pearls: 15 },           label: '15 💎'   },
        { threshold: 3, reward: { be: 150 },              label: '150 🫧'  },
        { threshold: 4, reward: { exclusive: 'opah' },    label: '🐟 Opah' },
      ],
    },
  },
  {
    id:          'pearl_tide_2026',
    name:        'Pearl Tide',
    icon:        '💎',
    theme:       0xffd740,
    startDate:   '2026-06-01',
    endDate:     '2026-06-05',
    description: 'A rare tidal surge brings pearls to the surface. Seize the bounty!',
    challenges: [
      { type: 'place_coral',   label: 'Place 10 coral',   target: 10   },
      { type: 'earn_be',       label: 'Earn 2,000 🫧',     target: 2000 },
      { type: 'reach_harmony', label: 'Reach 80 Harmony', target: 80   },
    ],
    reward: { be: 200, pearls: 100 },
    pass: {
      tiers: [
        { threshold: 1, reward: { be: 75 },                          label: '75 🫧'            },
        { threshold: 2, reward: { pearls: 30 },                      label: '30 💎'            },
        { threshold: 3, reward: { exclusive: 'pearlOrganPipe' },     label: '💎 Pearl Organ Pipe' },
      ],
    },
  },
];

const INCREMENTAL_TYPES = new Set(['place_coral', 'hatch_fish', 'earn_be', 'idle_streak']);
const SNAPSHOT_TYPES    = new Set(['reach_harmony', 'have_fish', 'have_coral']);

let _onChange    = null;
let _onExclusive = null;   // (speciesId: string) => void

// ── Helpers ───────────────────────────────────────────────────────────────────

function _today() {
  return new Date().toISOString().slice(0, 10);
}

function _activeScheduled(today) {
  return EVENT_SCHEDULE.find(e => today >= e.startDate && today <= e.endDate) ?? null;
}

export function eventDaysRemaining(endDate) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const end = new Date(endDate + 'T00:00:00');
  return Math.max(0, Math.ceil((end - now) / 86400000));
}

function _buildFromDef(def) {
  return {
    id:          def.id,
    name:        def.name,
    icon:        def.icon,
    theme:       def.theme,
    description: def.description,
    startDate:   def.startDate,
    endDate:     def.endDate,
    status:      'available',   // 'available' | 'active' | 'complete' | 'claimed'
    passPurchased:  true,
    eventTokens:    0,    // tokens earned from quests; each quest gives 1 token
    tiersUnlocked:  [],   // indices into pass.tiers that have been granted
    pass: def.pass ? {
      tiers: def.pass.tiers.map(t => ({ ...t })),
    } : null,
    challenges: def.challenges.map((c, i) => ({
      id:       `${c.type}_${i}`,
      type:     c.type,
      label:    c.label,
      target:   c.target,
      progress: 0,
      done:     false,
    })),
    reward: { ...def.reward },
  };
}

/** Check each pass tier and apply rewards for any newly-reached threshold. */
function _checkTierUnlocks() {
  const ev = state.event;
  if (!ev?.pass?.tiers) return;
  if (!ev.tiersUnlocked) ev.tiersUnlocked = [];
  const qc = ev.eventTokens ?? 0;
  for (let i = 0; i < ev.pass.tiers.length; i++) {
    if (ev.tiersUnlocked.includes(i)) continue;
    const tier = ev.pass.tiers[i];
    if (qc < tier.threshold) continue;
    ev.tiersUnlocked.push(i);
    if (tier.reward.be)        state.be     = Math.min(state.be + tier.reward.be, BE_MAX);
    if (tier.reward.pearls)    state.pearls += tier.reward.pearls;
    if (tier.reward.exclusive) _onExclusive?.(tier.reward.exclusive);
  }
}

function _updateStatus() {
  const ev = state.event;
  if (!ev || ev.status === 'claimed' || ev.status === 'available') return;
  if (ev.challenges.every(c => c.done) && ev.status !== 'complete') {
    ev.status = 'complete';
    _onChange?.();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Call once after save is restored. Initialises or resumes the active event. */
export function initEventSystem(onChange, onExclusive) {
  _onChange    = onChange;
  _onExclusive = onExclusive;

  const today = _today();
  const def   = _activeScheduled(today);

  if (!def) {
    if (state.event && state.event.endDate < today) state.event = null;
    return;
  }

  if (state.event?.id === def.id) {
    // Migrate saves made before the token system was added
    if (!state.event.pass?.tiers) {
      state.event.pass         = def.pass ? { tiers: def.pass.tiers.map(t => ({ ...t })) } : null;
      state.event.eventTokens  = state.event.passQuestsCompleted ?? state.event.eventTokens ?? 0;
      state.event.tiersUnlocked = state.event.tiersUnlocked ?? [];
    }
    state.event.passPurchased = true;
    if (state.event.eventTokens === undefined) {
      state.event.eventTokens = state.event.passQuestsCompleted ?? 0;
    }
    checkEventSnapshots();
    return;
  }

  state.event = _buildFromDef(def);
  _onChange?.();
}

/** Move from 'available' → 'active'. */
export function acceptEvent() {
  if (state.event?.status !== 'available') return;
  state.event.status = 'active';
  _onChange?.();
}

/** Fire for incremental challenge types. */
export function recordEventProgress(type, amount = 1) {
  const ev = state.event;
  if (!ev || ev.status !== 'active') return;
  let changed = false;
  for (const c of ev.challenges) {
    if (c.done || !INCREMENTAL_TYPES.has(c.type) || c.type !== type) continue;
    c.progress = Math.min(c.target, c.progress + amount);
    if (c.progress >= c.target) c.done = true;
    changed = true;
  }
  if (changed) { _updateStatus(); _onChange?.(); }
}

/** Re-evaluate snapshot-style challenges against live state. */
export function checkEventSnapshots() {
  const ev = state.event;
  if (!ev || ev.status === 'available' || ev.status === 'claimed') return;
  let changed = false;
  for (const c of ev.challenges) {
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
  if (changed) { _updateStatus(); _onChange?.(); }
}

/**
 * Call this whenever the player claims any quest reward (daily or event challenge).
 * Awards 1 event token and checks for tier unlocks.
 */
export function recordQuestClaimed() {
  const ev = state.event;
  if (!ev?.pass?.tiers) return;
  ev.eventTokens = (ev.eventTokens ?? 0) + 1;
  _checkTierUnlocks();
  _onChange?.();
}

/** Apply base event reward and mark claimed. Returns true on success. */
export function claimEvent() {
  const ev = state.event;
  if (!ev || ev.status !== 'complete') return false;
  ev.status = 'claimed';
  if (ev.reward.be)     state.be     = Math.min(state.be + ev.reward.be, BE_MAX);
  if (ev.reward.pearls) state.pearls += ev.reward.pearls;
  _onChange?.();
  return true;
}

export function getEventStatus() {
  return state.event?.status ?? null;
}
