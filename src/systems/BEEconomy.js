import { state } from '../state.js';
import {
  TICK_MS, IDLE_STREAK_MS, IDLE_BONUS_BASE, BE_MAX,
  BE_PER_TICK, CORAL_COST, FISH_COST, TIER,
  CORAL_SPECIES, FISH_SPECIES, DECOR_SPECIES,
  POLYP_PER_CORAL_TICK, POLYP_MAX,
} from '../constants.js';
import { coralBEPerTick, coralLevel } from './CoralUpgrade.js';
import { recordQuestEvent } from './QuestSystem.js';
import { recordEventProgress } from './EventSystem.js';

let tickAccum  = 0;
let onBEChange = null;  // callback(newBE)
let _beCarry    = 0;    // fractional BE carried between ticks (from level multipliers)
let _polypCarry = 0;    // fractional polyps carried between ticks

export function initEconomy(onChange) {
  onBEChange = onChange;
}

/** Called every game frame. dt = PixiJS ticker.deltaMS */
export function tickEconomy(deltaMS) {
  tickAccum += deltaMS;

  if (tickAccum >= TICK_MS) {
    tickAccum -= TICK_MS;
    _applyCoralTick();
  }

  _checkIdleStreak();
}

function _applyCoralTick() {
  const cap = state.coralBufferCap ?? 120;
  let polyps = 0;

  // Each active-biome coral fills its OWN BE buffer (collected via its upgrade
  // menu), up to the per-coral cap. Storage corals provide BE buffer but raise
  // the cap rather than producing their own income.
  state.placedCoral.forEach((entry) => {
    const spec = CORAL_SPECIES[entry.speciesId];
    if (!spec) return;
    const lvl = coralLevel(entry);
    polyps += POLYP_PER_CORAL_TICK * lvl;
    if (spec.storage) return;                          // vaults store, don't produce
    entry._beFrac = (entry._beFrac ?? 0) + coralBEPerTick(spec, lvl);
    const whole = Math.floor(entry._beFrac);
    if (whole > 0) {
      entry._beFrac -= whole;
      entry.pendingBE = Math.min((entry.pendingBE ?? 0) + whole, cap);
    }
  });

  // Passive income from the inactive biome still auto-banks (you're not there
  // to collect it).
  _beCarry += state.passiveBEPerTick ?? 0;
  const wholeBE = Math.floor(_beCarry);
  _beCarry -= wholeBE;
  if (wholeBE > 0) {
    state.be = Math.min(state.be + wholeBE, BE_MAX);
    recordQuestEvent('earn_be', wholeBE);
    recordEventProgress('earn_be', wholeBE);
  }

  // Polyps drip automatically with a fractional carry
  _polypCarry += polyps;
  const wholePolyps = Math.floor(_polypCarry);
  _polypCarry -= wholePolyps;
  if (wholePolyps > 0) state.polyps = Math.min(state.polyps + wholePolyps, POLYP_MAX);

  if (wholeBE > 0 || wholePolyps > 0) {
    const parts = [];
    if (wholeBE > 0)     parts.push(`+${wholeBE} 🫧`);
    if (wholePolyps > 0) parts.push(`+${wholePolyps} 🪸`);
    onBEChange?.(state.be, parts.join('  '));
  }
}

/** Collect a coral's buffered BE into the wallet. Returns the amount banked. */
export function collectCoralBE(entry) {
  const amt = Math.floor(entry?.pendingBE ?? 0);
  if (amt <= 0) return 0;
  state.be = Math.min(state.be + amt, BE_MAX);
  entry.pendingBE = 0;
  recordQuestEvent('earn_be', amt);
  recordEventProgress('earn_be', amt);
  onBEChange?.(state.be, `+${amt} 🫧`);
  return amt;
}

function _checkIdleStreak() {
  const idle = Date.now() - state.lastInteractionTime;
  if (idle >= IDLE_STREAK_MS && !state.idleStreakActive) {
    state.idleStreakActive = true;
    const bonus = IDLE_BONUS_BASE + Math.floor(state.coralCount * 0.5);
    state.be = Math.min(state.be + bonus, BE_MAX);
    onBEChange?.(state.be, `+${bonus} 🫧 (watching...)`);
    recordQuestEvent('idle_streak', 1);
    recordEventProgress('idle_streak', 1);
  }
}

/** Record any player interaction — resets idle streak. */
export function recordInteraction() {
  state.lastInteractionTime = Date.now();
  state.idleStreakActive = false;
}

/**
 * Try to spend BE on coral placement. Returns true if successful.
 * @param {string} speciesId
 */
export function spendForCoral(speciesId) {
  const spec = CORAL_SPECIES[speciesId];
  if (!spec) return false;
  if (spec.pearlCost) return false;  // pearl species not purchasable with BE
  const cost = CORAL_COST[spec.tier] ?? 0;
  if (state.be < cost) return false;
  state.be -= cost;
  onBEChange?.(state.be, null);
  return true;
}

/**
 * Try to spend BE on a fish hatch. Returns true if successful.
 * @param {string} speciesId
 */
export function spendForFish(speciesId) {
  const spec = FISH_SPECIES[speciesId];
  if (!spec) return false;
  if (spec.pearlCost) return false;  // pearl species not purchasable with BE
  const cost = FISH_COST[spec.tier] ?? 0;
  if (state.be < cost) return false;
  state.be -= cost;
  onBEChange?.(state.be, null);
  return true;
}

/** Refund 50% of placement cost when removing coral. */
export function refundCoral(speciesId) {
  const spec = CORAL_SPECIES[speciesId];
  if (!spec || spec.pearlCost || spec.polypCost) return 0;   // non-BE corals: no BE refund
  const refund = Math.floor((CORAL_COST[spec.tier] ?? 0) / 2);
  state.be = Math.min(state.be + refund, BE_MAX);
  onBEChange?.(state.be, null);
  return refund;
}

/** Try to spend BE on decor placement. Returns true if successful. */
export function spendForDecor(speciesId) {
  const spec = DECOR_SPECIES[speciesId];
  if (!spec) return false;
  const cost = spec.cost ?? 0;
  if (state.be < cost) return false;
  state.be -= cost;
  onBEChange?.(state.be, null);
  return true;
}

/** Refund 50% of placement cost when removing decor. */
export function refundDecor(speciesId) {
  const spec = DECOR_SPECIES[speciesId];
  if (!spec) return 0;
  const refund = Math.floor((spec.cost ?? 0) / 2);
  state.be = Math.min(state.be + refund, BE_MAX);
  onBEChange?.(state.be, null);
  return refund;
}

/** Refund 50% of hatch cost when removing fish. */
export function refundFish(speciesId) {
  const spec = FISH_SPECIES[speciesId];
  if (!spec || spec.pearlCost) return 0;
  const refund = Math.floor((FISH_COST[spec.tier] ?? 0) / 2);
  state.be = Math.min(state.be + refund, BE_MAX);
  onBEChange?.(state.be, null);
  return refund;
}

/** Spend pearls for a pearl-only coral. Returns true if successful. */
export function spendForCoralPearl(speciesId) {
  const spec = CORAL_SPECIES[speciesId];
  if (!spec || !spec.pearlCost) return false;
  if (state.pearls < spec.pearlCost) return false;
  state.pearls -= spec.pearlCost;
  return true;
}

/** Spend polyps for a polyp-cost coral (Storage corals). Returns true if ok. */
export function spendForCoralPolyp(speciesId) {
  const spec = CORAL_SPECIES[speciesId];
  if (!spec || !spec.polypCost) return false;
  if (state.polyps < spec.polypCost) return false;
  state.polyps -= spec.polypCost;
  return true;
}

/** Spend polyps directly (e.g. for cleaning stations). Returns true if ok. */
export function spendPolyps(amount) {
  if (state.polyps < amount) return false;
  state.polyps -= amount;
  return true;
}

/** Spend pearls for a pearl-only fish. Returns true if successful. */
export function spendForFishPearl(speciesId) {
  const spec = FISH_SPECIES[speciesId];
  if (!spec || !spec.pearlCost) return false;
  if (state.pearls < spec.pearlCost) return false;
  state.pearls -= spec.pearlCost;
  return true;
}

/** Cost string for display. */
export function coralCostStr(speciesId) {
  const spec = CORAL_SPECIES[speciesId];
  return spec ? String(CORAL_COST[spec.tier] ?? '?') : '?';
}

export function fishCostStr(speciesId) {
  const spec = FISH_SPECIES[speciesId];
  return spec ? String(FISH_COST[spec.tier] ?? '?') : '?';
}
