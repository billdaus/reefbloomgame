import { state } from '../state.js';
import { BE_MAX } from '../constants.js';

// ── Event schedule ─────────────────────────────────────────────────────────────
// Entries recur EVERY YEAR on the month and day given (see "Yearly recurrence"
// below) — the year in startDate/endDate is only when the event was authored.
// Events 2.0 (calendar 2.0, Sep 2026): each event runs progressive quest
// sets that pay event tokens; daily quests add one token each while an event
// runs (recordQuestClaimed); tokens EARNED unlock the pass milestones and the
// Event Shop listings, and tokens are SPENT in the shop on the event's
// exclusive species — which stay event-bound: recording one puts it in the
// Journal but never in the normal market. The 3D edition drives the shop;
// Classic still unlocks exclusives straight from pass tiers.

// ── Quest sets ────────────────────────────────────────────────────────────────
// Every event runs a ladder of quest sets, gentle first and demanding later;
// the ladder's length scales with the event (a five-day tide gets three sets,
// the two-month winter event eight). Set i pays 2 + i tokens. Challenges are
// generated from one escalating template so the whole calendar stays balanced.
function _sets(labels) {
  return labels.map((label, i) => {
    const be = Math.round((200 * (i + 1) * Math.pow(1.35, i)) / 50) * 50;
    const pool = [
      { type: 'place_coral',   label: `Place ${3 + 3 * i} coral`,            target: 3 + 3 * i },
      { type: 'have_fish',     label: `Have ${3 + 2 * i} fish alive`,        target: 3 + 2 * i },
      { type: 'earn_be',       label: `Earn ${be.toLocaleString()} 🫧`,      target: be },
      { type: 'reach_harmony', label: `Reach ${Math.min(85, 30 + 10 * i)} Harmony`, target: Math.min(85, 30 + 10 * i) },
      { type: 'hatch_fish',    label: `Hatch ${2 + 2 * i} fish`,             target: 2 + 2 * i },
    ];
    // Two challenges for the first two sets, three after; rotate the picks.
    const n = i < 2 ? 2 : 3;
    const picks = [];
    for (let k = 0; k < n; k++) picks.push(pool[(i + k * 2) % pool.length]);
    return { label, tokenReward: 2 + i, challenges: picks };
  });
}
// Event Shop: exclusives are BOUGHT with event tokens, and each listing stays
// locked until the player has EARNED `unlockAt` tokens over the event — the
// threshold earns the right to buy, not the item. Prices and thresholds scale
// with the event's length (tokens ≈ quest-set tokens + one per daily quest).
const _shop = (...items) => items.map(([exclusive, unlockAt, cost]) => ({ exclusive, unlockAt, cost }));
// Milestones the pass pays out on tokens earned (currency only; the species
// live in the shop). Classic still unlocks exclusives from tiers, so the shop
// items are mirrored there as `exclusive` tiers at their unlock threshold.
function _pass(milestones, shop) {
  const tiers = milestones.map(([threshold, reward, label]) => ({ threshold, reward, label }));
  for (const it of shop) tiers.push({ threshold: it.unlockAt, reward: { exclusive: it.exclusive }, label: it.label ?? it.exclusive, shopOnly: true });
  tiers.sort((a, b) => a.threshold - b.threshold);
  return { tiers };
}

export const EVENT_SCHEDULE = [
  {
    id:          'coral_bloom_2026',
    name:        'Coral Bloom Festival',
    icon:        '🌸',
    theme:       0xff8fab,
    startDate:   '2026-04-01',
    endDate:     '2026-04-30',
    description: 'The reef awakens in full bloom! Grow your coral and find harmony.',
    reward: { be: 300, pearls: 75 },
    questSets: _sets(['First Bud', 'Petals', 'Full Bloom', 'Festival', 'Blossom Rain', 'Everbloom']),
    shop: _shop(['blossomCoral', 8, 8], ['sakuraAnthias', 20, 14]),
    pass: _pass([[3, { be: 100 }, '100 🫧'], [12, { pearls: 15 }, '15 💎'], [30, { be: 300 }, '300 🫧'], [45, { pearls: 25 }, '25 💎']],
      _shop(['blossomCoral', 8, 8], ['sakuraAnthias', 20, 14])),
  },
  {
    id:          'moonfish_migration_2026',
    name:        'Moonfish Migration',
    icon:        '🌙',
    theme:       0x64b5f6,
    startDate:   '2026-05-01',
    endDate:     '2026-05-07',
    description: 'Schools of rare fish pass through — fill your reef with life!',
    reward: { be: 250, pearls: 50 },
    questSets: _sets(['First Arrival', 'Schooling', 'Silver Tide', 'Full Migration']),
    shop: _shop(['tideCoral', 5, 5], ['opah', 12, 7]),
    pass: _pass([[2, { be: 75 }, '75 🫧'], [8, { pearls: 15 }, '15 💎'], [16, { be: 200 }, '200 🫧']],
      _shop(['tideCoral', 5, 5], ['opah', 12, 7])),
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
    questSets: _sets(['First Swell', 'Rising Tide', 'High Tide']),
    shop: _shop(['pearlOrganPipe', 4, 4], ['pearlfish', 9, 6]),
    pass: _pass([[2, { be: 75 }, '75 🫧'], [6, { pearls: 30 }, '30 💎'], [12, { pearls: 20 }, '20 💎']],
      _shop(['pearlOrganPipe', 4, 4], ['pearlfish', 9, 6])),
  },
  {
    id:          'shoreline_summer_2026',
    name:        'Shoreline Summer',
    icon:        '🏖️',
    theme:       0xffd54f,
    startDate:   '2026-06-15',
    endDate:     '2026-07-31',
    description: 'The tide pulls back and the shore comes alive — build the reef beneath the summer sun.',
    reward: { be: 400, pearls: 100 },
    questSets: _sets(['Low Tide', 'Sandbar', 'High Sun', 'Golden Hour', 'Heatwave', 'Sea Breeze', 'Endless Summer']),
    shop: _shop(['sunsetFan', 10, 10], ['goldenSeahorse', 25, 18]),
    pass: _pass([[4, { be: 100 }, '100 🫧'], [15, { pearls: 20 }, '20 💎'], [40, { be: 400 }, '400 🫧'], [60, { pearls: 30 }, '30 💎']],
      _shop(['sunsetFan', 10, 10], ['goldenSeahorse', 25, 18])),
  },
  {
    id:          'sea_dragon_days_2026',
    name:        'Sea Dragon Days',
    icon:        '🐉',
    theme:       0x66bb6a,
    startDate:   '2026-08-16',
    endDate:     '2026-08-22',
    description: 'Leafy and weedy sea dragons drift into the seagrass, dressed as the fronds they hide among.',
    reward: { be: 250, pearls: 60 },
    questSets: _sets(['Kelp Shadows', 'Drifting Fronds', 'Camouflage', 'Dragon Dance', 'Leafy Legend']),
    shop: _shop(['frondCoral', 5, 5], ['leafySeaDragon', 12, 8], ['weedySeaDragon', 18, 9]),
    pass: _pass([[2, { be: 75 }, '75 🫧'], [8, { pearls: 15 }, '15 💎'], [22, { be: 250 }, '250 🫧']],
      _shop(['frondCoral', 5, 5], ['leafySeaDragon', 12, 8], ['weedySeaDragon', 18, 9])),
  },
  {
    id:          'golden_kelp_2026',
    name:        'Golden Kelp Harvest',
    icon:        '🍂',
    theme:       0xd99a2b,
    startDate:   '2026-10-01',
    endDate:     '2026-10-31',
    description: 'Autumn light turns the kelp forest gold — gather the season\'s bounty before the first storms roll in.',
    reward: { be: 300, pearls: 75 },
    questSets: _sets(['First Leaves', 'Golden Canopy', 'Harvest Moon', 'Amber Light', 'Kelp Crown', 'Last Storm']),
    shop: _shop(['amberKelp', 8, 8], ['garibaldi', 20, 14]),
    pass: _pass([[3, { be: 100 }, '100 🫧'], [12, { pearls: 15 }, '15 💎'], [30, { be: 300 }, '300 🫧'], [45, { pearls: 25 }, '25 💎']],
      _shop(['amberKelp', 8, 8], ['garibaldi', 20, 14])),
  },
  {
    id:          'autumn_current_2026',
    name:        'Autumn Current',
    icon:        '🍁',
    theme:       0xe0653a,
    startDate:   '2026-11-01',
    endDate:     '2026-11-14',
    description: 'A cold current sweeps the coast and brings the open-ocean wanderers close to shore.',
    reward: { be: 300, pearls: 60 },
    questSets: _sets(['First Chill', 'Turning Tide', 'Drift Lines', 'Deep Pull', 'Current\'s End']),
    shop: _shop(['russetFan', 6, 6], ['molaMola', 14, 9], ['spinnerDolphin', 22, 10]),
    pass: _pass([[3, { be: 100 }, '100 🫧'], [10, { pearls: 15 }, '15 💎'], [28, { be: 250 }, '250 🫧']],
      _shop(['russetFan', 6, 6], ['molaMola', 14, 9], ['spinnerDolphin', 22, 10])),
  },
  {
    id:          'bioluminescence_night_2026',
    name:        'Bioluminescence Night',
    icon:        '✨',
    theme:       0x40c4ff,
    startDate:   '2026-12-01',
    endDate:     '2027-01-31',
    description: 'For two months the nights turn deep and the reef lights itself — glowing coral, drifting plankton, and the creatures that shine after dark.',
    reward: { be: 500, pearls: 120 },
    questSets: _sets(['First Glow', 'Blue Drift', 'Lantern Hour', 'Moonless', 'Glowing Shoals', 'Aurora', 'Deep Radiance', 'Night Eternal']),
    shop: _shop(['auroraCoral', 10, 8], ['orchidCoral', 18, 10], ['lumenCoral', 28, 12], ['moonSeahorse', 40, 16], ['glowEel', 55, 20]),
    pass: _pass([[5, { be: 100 }, '100 🫧'], [20, { pearls: 20 }, '20 💎'], [45, { be: 400 }, '400 🫧'], [70, { pearls: 30 }, '30 💎'], [90, { be: 600 }, '600 🫧']],
      _shop(['auroraCoral', 10, 8], ['orchidCoral', 18, 10], ['lumenCoral', 28, 12], ['moonSeahorse', 40, 16], ['glowEel', 55, 20])),
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

// ── Yearly recurrence ─────────────────────────────────────────────────────────
// Events come round every year. Only the MONTH and DAY of a schedule entry's
// startDate / endDate matter; the year written there is just the year the event
// was first authored. Everything outside this block works with "occurrences":
// a copy of the entry carrying that year's real dates and a per-year id
// (`coral_bloom_2027`), so a save's progress belongs to one year's run and the
// festival starts fresh the next time it comes round. Exclusives a player has
// unlocked are stored by species id, so they stay owned across years.
const _baseId = (id) => String(id).replace(/_\d{4}$/, '');
const _monthDay = (d) => d.slice(5);   // 'MM-DD'

function _occurrence(def, year) {
  const s = _monthDay(def.startDate), e = _monthDay(def.endDate);
  return {
    ...def,
    baseId:    _baseId(def.id),
    id:        `${_baseId(def.id)}_${year}`,
    startDate: `${year}-${s}`,
    endDate:   `${e >= s ? year : year + 1}-${e}`,   // a window may run over New Year
  };
}

/** The event running on `today` ('YYYY-MM-DD'), as this year's occurrence — or null. */
export function liveEvent(today = _today()) {
  const y = Number(today.slice(0, 4));
  for (const def of EVENT_SCHEDULE) {
    for (const yr of [y, y - 1]) {                   // y - 1 catches a window begun last December
      const o = _occurrence(def, yr);
      if (today >= o.startDate && today <= o.endDate) return o;
    }
  }
  return null;
}

/** The next event to start after `today`, this year or next — or null if the schedule is empty. */
export function nextEvent(today = _today()) {
  const y = Number(today.slice(0, 4));
  let best = null;
  for (const def of EVENT_SCHEDULE) {
    for (const yr of [y, y + 1]) {
      const o = _occurrence(def, yr);
      if (o.startDate > today && (!best || o.startDate < best.startDate)) best = o;
    }
  }
  return best;
}

/** Resolve a saved event id (any year, or a legacy unsuffixed one) to its occurrence — or null. */
export function eventById(id) {
  if (!id) return null;
  const def = EVENT_SCHEDULE.find(d => _baseId(d.id) === _baseId(id));
  if (!def) return null;
  const m = String(id).match(/_(\d{4})$/);
  return _occurrence(def, m ? Number(m[1]) : Number(def.startDate.slice(0, 4)));
}

function _activeScheduled(today) {
  return liveEvent(today);
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
    if (tier.reward.be)        state.be     = Math.min(state.be + tier.reward.be, state.beMax ?? BE_MAX);
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
  if (ev.reward.be)     state.be     = Math.min(state.be + ev.reward.be, state.beMax ?? BE_MAX);
  if (ev.reward.pearls) state.pearls += ev.reward.pearls;
  _onChange?.();
  return true;
}

export function getEventStatus() {
  return state.event?.status ?? null;
}
