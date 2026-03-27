import { state } from '../state.js';
import {
  TICK_MS, IDLE_STREAK_MS, IDLE_BONUS_BASE,
  BE_PER_TICK, CORAL_COST, FISH_COST, TIER,
  CORAL_SPECIES, FISH_SPECIES,
} from '../constants.js';

let tickAccum  = 0;
let onBEChange = null;  // callback(newBE)

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
  let earned = 0;
  state.placedCoral.forEach(({ speciesId }) => {
    const spec = CORAL_SPECIES[speciesId];
    if (!spec) return;
    earned += BE_PER_TICK[spec.tier] ?? 0;
  });
  if (earned > 0) {
    state.be += earned;
    onBEChange?.(state.be, `+${earned} 🫧`);
  }
}

function _checkIdleStreak() {
  const idle = Date.now() - state.lastInteractionTime;
  if (idle >= IDLE_STREAK_MS && !state.idleStreakActive) {
    state.idleStreakActive = true;
    const bonus = IDLE_BONUS_BASE + Math.floor(state.coralCount * 0.5);
    state.be += bonus;
    onBEChange?.(state.be, `+${bonus} 🫧 (watching...)`);
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
  const cost = FISH_COST[spec.tier] ?? 0;
  if (state.be < cost) return false;
  state.be -= cost;
  onBEChange?.(state.be, null);
  return true;
}

/** Refund 50% of placement cost when removing coral. */
export function refundCoral(speciesId) {
  const spec = CORAL_SPECIES[speciesId];
  if (!spec) return 0;
  const refund = Math.floor((CORAL_COST[spec.tier] ?? 0) / 2);
  state.be += refund;
  onBEChange?.(state.be, null);
  return refund;
}

/** Refund 50% of hatch cost when removing fish. */
export function refundFish(speciesId) {
  const spec = FISH_SPECIES[speciesId];
  if (!spec) return 0;
  const refund = Math.floor((FISH_COST[spec.tier] ?? 0) / 2);
  state.be += refund;
  onBEChange?.(state.be, null);
  return refund;
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
