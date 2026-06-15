import { state } from '../state.js';
import {
  CORAL_SPECIES, CORAL_MAX_LEVEL, POLYP_BE_BONUS, BE_PER_TICK,
} from '../constants.js';

/**
 * CoralUpgrade — corals can be grown by spending Polyps.
 *
 * Each placed coral carries a `level` (1..CORAL_MAX_LEVEL). Higher levels
 * produce more BE per tick (POLYP_BE_BONUS of base per level above 1) and
 * render a larger sprite (see Coral.setLevel / GridLayer). Polyps drip
 * passively from corals while the reef ticks (see BEEconomy).
 */

/** Clamp a possibly-missing level to the valid range. */
export function coralLevel(entry) {
  const lvl = entry?.level ?? 1;
  return Math.max(1, Math.min(CORAL_MAX_LEVEL, lvl));
}

export function isMaxLevel(entry) {
  return coralLevel(entry) >= CORAL_MAX_LEVEL;
}

/** BE produced per tick by a coral of this species at this level. */
export function coralBEPerTick(spec, level) {
  const base = BE_PER_TICK[spec.tier] ?? 0;
  const lvl  = Math.max(1, Math.min(CORAL_MAX_LEVEL, level ?? 1));
  return base * (1 + (lvl - 1) * POLYP_BE_BONUS);
}

/** Polyps required to upgrade FROM the given level to the next. */
export function upgradeCost(level) {
  const lvl = Math.max(1, level ?? 1);
  return 4 * lvl;   // 1→2: 4, 2→3: 8, 3→4: 12, 4→5: 16  (40 total to max)
}

export function canUpgrade(entry) {
  if (!entry || isMaxLevel(entry)) return false;
  return state.polyps >= upgradeCost(coralLevel(entry));
}

/**
 * Spend polyps and bump the coral's level in place.
 * Returns the new level, or null if the upgrade couldn't happen.
 */
export function applyUpgrade(entry) {
  if (!entry) return null;
  const spec = CORAL_SPECIES[entry.speciesId];
  if (!spec || isMaxLevel(entry)) return null;
  const cost = upgradeCost(coralLevel(entry));
  if (state.polyps < cost) return null;
  state.polyps -= cost;
  entry.level = coralLevel(entry) + 1;
  return entry.level;
}
