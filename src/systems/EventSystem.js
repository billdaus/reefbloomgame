import { state } from '../state.js';
import { BE_MAX } from '../constants.js';

// ── Event schedule ─────────────────────────────────────────────────────────────
// Add future events here. startDate/endDate are ISO date strings (inclusive).

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
      { type: 'place_coral',   label: 'Place 15 coral',     target: 15 },
      { type: 'reach_harmony', label: 'Reach 60 Harmony',   target: 60 },
      { type: 'have_fish',     label: 'Have 10 fish alive',  target: 10 },
    ],
    reward: { be: 300, pearls: 75 },
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
      { type: 'hatch_fish',  label: 'Hatch 12 fish',          target: 12   },
      { type: 'earn_be',     label: 'Earn 1,000 🫧',           target: 1000 },
      { type: 'idle_streak', label: 'Trigger idle bonus 5×',   target: 5    },
    ],
    reward: { be: 250, pearls: 50 },
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
      { type: 'place_coral',   label: 'Place 10 coral',      target: 10   },
      { type: 'earn_be',       label: 'Earn 2,000 🫧',        target: 2000 },
      { type: 'reach_harmony', label: 'Reach 80 Harmony',    target: 80   },
    ],
    reward: { be: 200, pearls: 100 },
  },
];

const INCREMENTAL_TYPES = new Set(['place_coral', 'hatch_fish', 'earn_be', 'idle_streak']);
const SNAPSHOT_TYPES    = new Set(['reach_harmony', 'have_fish', 'have_coral']);

let _onChange = null;

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
    challenges:  def.challenges.map((c, i) => ({
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
export function initEventSystem(onChange) {
  _onChange = onChange;
  const today = _today();
  const def   = _activeScheduled(today);

  if (!def) {
    // Clear any event whose window has passed
    if (state.event && state.event.endDate < today) state.event = null;
    return;
  }

  if (state.event?.id === def.id) {
    // Resume saved progress for this event
    checkEventSnapshots();
    return;
  }

  // A new event just opened — initialise fresh state
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

/** Apply reward and mark claimed. Returns true on success. */
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
