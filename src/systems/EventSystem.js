import { state } from '../state.js';
import { BE_MAX } from '../constants.js';

// ── Event schedule ─────────────────────────────────────────────────────────────
// Each event now has progressive quest sets. Earlier sets are gentle; later sets
// demand more. Claiming a set grants tokens. Tokens unlock pass tiers.
// Daily quests still contribute 1 bonus token each via recordQuestClaimed().

export const EVENT_SCHEDULE = [
  {
    id:          'coral_bloom_2026',
    name:        'Coral Bloom Festival',
    icon:        '🌸',
    theme:       0xff8fab,
    startDate:   '2026-04-11',
    endDate:     '2026-04-17',
    description: 'The reef awakens in full bloom! Grow your coral and find harmony.',
    reward: { be: 300, pearls: 75 },
    questSets: [
      { label: 'First Bloom', tokenReward: 2, challenges: [
        { type: 'place_coral',   label: 'Place 5 coral',    target: 5  },
        { type: 'reach_harmony', label: 'Reach 30 Harmony', target: 30 },
      ]},
      { label: 'Full Bloom', tokenReward: 3, challenges: [
        { type: 'place_coral', label: 'Place 10 coral',     target: 10 },
        { type: 'have_fish',   label: 'Have 6 fish alive',  target: 6  },
      ]},
      { label: 'Festival', tokenReward: 4, challenges: [
        { type: 'reach_harmony', label: 'Reach 60 Harmony',  target: 60 },
        { type: 'have_fish',     label: 'Have 10 fish alive', target: 10 },
        { type: 'place_coral',   label: 'Place 15 coral',     target: 15 },
      ]},
    ],
    pass: {
      tiers: [
        { threshold: 1, reward: { be: 100 },              label: '100 🫧'          },
        { threshold: 3, reward: { pearls: 20 },           label: '20 💎'           },
        { threshold: 5, reward: { be: 200 },              label: '200 🫧'          },
        { threshold: 7, reward: { exclusive: 'sakuraAnthias' }, label: '🌸 Sakura Anthias' },
      ],
    },
  },
  {
    id:          'bioluminescence_2026',
    name:        'Bioluminescence Bloom',
    icon:        '✨',
    theme:       0x40c4ff,
    startDate:   '2026-04-20',
    endDate:     '2026-04-26',
    description: 'Ghostly lights drift through the abyss — coax the glow back to the reef.',
    reward: { be: 250, pearls: 80 },
    questSets: [
      { label: 'Soft Glow', tokenReward: 2, challenges: [
        { type: 'place_coral', label: 'Place 3 coral',    target: 3 },
        { type: 'have_fish',   label: 'Have 3 fish alive', target: 3 },
      ]},
      { label: 'Deep Drift', tokenReward: 3, challenges: [
        { type: 'hatch_fish', label: 'Hatch 6 fish',  target: 6   },
        { type: 'earn_be',    label: 'Earn 400 🫧',    target: 400 },
      ]},
      { label: 'Radiant Bloom', tokenReward: 4, challenges: [
        { type: 'reach_harmony', label: 'Reach 60 Harmony', target: 60   },
        { type: 'place_coral',   label: 'Place 10 coral',   target: 10   },
        { type: 'earn_be',       label: 'Earn 1,000 🫧',     target: 1000 },
      ]},
    ],
    pass: {
      tiers: [
        { threshold: 1, reward: { be: 50 },                       label: '50 🫧'           },
        { threshold: 3, reward: { pearls: 20 },                   label: '20 💎'           },
        { threshold: 5, reward: { exclusive: 'glowEel' },         label: '⚡ Glow Eel'      },
        { threshold: 8, reward: { exclusive: 'moonSeahorse' },    label: '🌙 Moon Seahorse' },
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
    reward: { be: 250, pearls: 50 },
    questSets: [
      { label: 'First Arrival', tokenReward: 2, challenges: [
        { type: 'hatch_fish', label: 'Hatch 4 fish',  target: 4   },
        { type: 'earn_be',    label: 'Earn 300 🫧',    target: 300 },
      ]},
      { label: 'Schooling', tokenReward: 3, challenges: [
        { type: 'hatch_fish',  label: 'Hatch 8 fish',          target: 8   },
        { type: 'earn_be',     label: 'Earn 700 🫧',            target: 700 },
        { type: 'idle_streak', label: 'Trigger idle bonus 2×', target: 2   },
      ]},
      { label: 'Full Migration', tokenReward: 4, challenges: [
        { type: 'hatch_fish',  label: 'Hatch 12 fish',          target: 12   },
        { type: 'earn_be',     label: 'Earn 1,500 🫧',           target: 1500 },
        { type: 'idle_streak', label: 'Trigger idle bonus 5×',  target: 5    },
      ]},
    ],
    pass: {
      tiers: [
        { threshold: 1, reward: { be: 75 },               label: '75 🫧'   },
        { threshold: 3, reward: { pearls: 15 },           label: '15 💎'   },
        { threshold: 5, reward: { be: 150 },              label: '150 🫧'  },
        { threshold: 7, reward: { exclusive: 'opah' },    label: '🐟 Opah' },
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
    reward: { be: 200, pearls: 100 },
    questSets: [
      { label: 'First Swell', tokenReward: 2, challenges: [
        { type: 'place_coral', label: 'Place 4 coral', target: 4   },
        { type: 'earn_be',     label: 'Earn 500 🫧',   target: 500 },
      ]},
      { label: 'Rising Tide', tokenReward: 3, challenges: [
        { type: 'place_coral',   label: 'Place 8 coral',    target: 8  },
        { type: 'reach_harmony', label: 'Reach 50 Harmony', target: 50 },
      ]},
      { label: 'High Tide', tokenReward: 4, challenges: [
        { type: 'place_coral',   label: 'Place 12 coral',   target: 12   },
        { type: 'reach_harmony', label: 'Reach 80 Harmony', target: 80   },
        { type: 'earn_be',       label: 'Earn 2,500 🫧',     target: 2500 },
      ]},
    ],
    pass: {
      tiers: [
        { threshold: 1, reward: { be: 75 },                          label: '75 🫧'            },
        { threshold: 3, reward: { pearls: 30 },                      label: '30 💎'            },
        { threshold: 6, reward: { exclusive: 'pearlOrganPipe' },     label: '💎 Pearl Organ Pipe' },
      ],
    },
  },
];

const INCREMENTAL_TYPES = new Set(['place_coral', 'hatch_fish', 'earn_be', 'idle_streak']);
const SNAPSHOT_TYPES    = new Set(['reach_harmony', 'have_fish', 'have_coral']);

// Days past endDate before state.event is fully cleared.
const END_GRACE_DAYS = 2;

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

function _daysPast(endDate) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const end = new Date(endDate + 'T00:00:00');
  return Math.floor((now - end) / 86400000);
}

export function getCurrentSet(ev = state.event) {
  if (!ev?.questSets) return null;
  return ev.questSets[ev.currentSetIdx] ?? null;
}

export function isSetComplete(ev = state.event) {
  const set = getCurrentSet(ev);
  return !!set && set.challenges.every(c => c.done);
}

function _cloneSetChallenges(set) {
  return set.challenges.map((c, i) => ({
    id:       `${set.label}_${c.type}_${i}`,
    type:     c.type,
    label:    c.label,
    target:   c.target,
    progress: 0,
    done:     false,
  }));
}

function _buildFromDef(def) {
  const sets = def.questSets.map(s => ({
    label:       s.label,
    tokenReward: s.tokenReward,
    challenges:  _cloneSetChallenges(s),
  }));
  return {
    id:          def.id,
    name:        def.name,
    icon:        def.icon,
    theme:       def.theme,
    description: def.description,
    startDate:   def.startDate,
    endDate:     def.endDate,
    status:      'available',   // 'available' | 'active' | 'complete' | 'claimed'
    ended:       false,
    currentSetIdx:  0,
    setsClaimed:    [],
    eventTokens:    0,
    tiersUnlocked:  [],
    questSets:   sets,
    pass: def.pass ? { tiers: def.pass.tiers.map(t => ({ ...t })) } : null,
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
  const allSetsClaimed = ev.questSets && ev.setsClaimed.length >= ev.questSets.length;
  if (allSetsClaimed && ev.status !== 'complete') {
    ev.status = 'complete';
    _onChange?.();
  }
}

/** Flip `ended` once past endDate; clear event after grace period. */
function _checkEventEnd() {
  const ev = state.event;
  if (!ev) return;
  const today = _today();
  if (today <= ev.endDate) return;

  const gracePast = _daysPast(ev.endDate) >= END_GRACE_DAYS;
  const nothingLeftToClaim =
    ev.status === 'claimed' ||
    (ev.status === 'available');

  if (gracePast || nothingLeftToClaim) {
    state.event = null;
    _onChange?.();
    return;
  }

  if (!ev.ended) {
    ev.ended = true;
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

  // Saved event whose window has passed → run end logic
  if (state.event && (!def || state.event.id !== def.id) && state.event.endDate < today) {
    _checkEventEnd();
    if (!state.event) return;
  }

  if (!def) return;

  if (state.event?.id === def.id) {
    _migrateLegacy(def);
    _checkEventEnd();
    checkEventSnapshots();
    return;
  }

  state.event = _buildFromDef(def);
  _onChange?.();
}

/** Upgrade a save that predates the questSets refactor. */
function _migrateLegacy(def) {
  const ev = state.event;
  ev.passPurchased = true;

  if (!ev.questSets) {
    // Old flat-challenges shape — seed fresh quest sets and preserve tokens/tiers.
    ev.questSets     = def.questSets.map(s => ({
      label:       s.label,
      tokenReward: s.tokenReward,
      challenges:  _cloneSetChallenges(s),
    }));
    ev.currentSetIdx = 0;
    ev.setsClaimed   = [];
    ev.eventTokens   = ev.eventTokens ?? ev.passQuestsCompleted ?? 0;
    ev.tiersUnlocked = ev.tiersUnlocked ?? [];
    ev.reward        = ev.reward ?? { ...def.reward };
    delete ev.challenges;
    delete ev.passQuestsCompleted;
  }
  if (!ev.pass?.tiers && def.pass) {
    ev.pass = { tiers: def.pass.tiers.map(t => ({ ...t })) };
  }
  if (ev.ended === undefined) ev.ended = false;
}

/** Move from 'available' → 'active'. Blocked if the event has already ended. */
export function acceptEvent() {
  const ev = state.event;
  if (!ev || ev.status !== 'available' || ev.ended) return;
  ev.status = 'active';
  _onChange?.();
}

/** Fire for incremental challenge types. No-op once the event has ended. */
export function recordEventProgress(type, amount = 1) {
  _checkEventEnd();
  const ev = state.event;
  if (!ev || ev.status !== 'active' || ev.ended) return;
  const set = getCurrentSet(ev);
  if (!set) return;
  let changed = false;
  for (const c of set.challenges) {
    if (c.done || !INCREMENTAL_TYPES.has(c.type) || c.type !== type) continue;
    c.progress = Math.min(c.target, c.progress + amount);
    if (c.progress >= c.target) c.done = true;
    changed = true;
  }
  if (changed) { _onChange?.(); }
}

/** Re-evaluate snapshot-style challenges against live state. */
export function checkEventSnapshots() {
  _checkEventEnd();
  const ev = state.event;
  if (!ev || ev.status === 'available' || ev.status === 'claimed' || ev.ended) return;
  const set = getCurrentSet(ev);
  if (!set) return;
  let changed = false;
  for (const c of set.challenges) {
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
  if (changed) { _onChange?.(); }
}

/**
 * Claim the currently-complete quest set. Grants its tokens, checks tier
 * unlocks, and advances to the next set (if any).
 */
export function claimCurrentSet() {
  const ev = state.event;
  if (!ev || ev.status !== 'active') return false;
  if (!isSetComplete(ev)) return false;

  const idx = ev.currentSetIdx;
  const set = ev.questSets[idx];
  if (ev.setsClaimed.includes(idx)) return false;

  ev.setsClaimed.push(idx);
  ev.eventTokens = (ev.eventTokens ?? 0) + (set.tokenReward ?? 0);
  _checkTierUnlocks();

  const nextIdx = idx + 1;
  if (nextIdx < ev.questSets.length) {
    ev.currentSetIdx = nextIdx;
  }
  _updateStatus();
  _onChange?.();
  return true;
}

/**
 * Daily-quest integration — each daily quest claim contributes a small bonus
 * token. Secondary pathway; quest sets are the primary source.
 */
export function recordQuestClaimed() {
  const ev = state.event;
  if (!ev?.pass?.tiers || ev.ended) return;
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
