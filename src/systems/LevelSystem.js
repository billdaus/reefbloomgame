import { state } from '../state.js';

/**
 * LevelSystem — milestone-based leveling.
 * Checks reef state each tick; levels up when conditions are met.
 * Values are prototype-tuned — designer will provide final thresholds.
 */

// Index = level you're trying to REACH (so index 2 = "what you need to hit level 2")
const REQUIREMENTS = [
  null,  // 0 — unused
  null,  // 1 — starting level, no requirement
  { coralCount: 3 },
  { coralCount: 6,  fishCount: 2 },
  { coralCount: 12, fishCount: 4, harmony: 60 },
  { coralCount: 18, fishCount: 7, harmony: 75 },
];

export const MAX_LEVEL = REQUIREMENTS.length - 1;

let _onLevelUp = null;

export function initLevelSystem(onLevelUp) {
  _onLevelUp = onLevelUp;
}

/** Call after any state change that could trigger a level up. */
export function checkLevelUp() {
  if (state.level >= MAX_LEVEL) return;

  const req = REQUIREMENTS[state.level + 1];
  if (!req) return;

  const meets = (
    (!req.coralCount || state.coralCount >= req.coralCount) &&
    (!req.fishCount  || state.fishCount  >= req.fishCount)  &&
    (!req.harmony    || state.harmony    >= req.harmony)
  );

  if (meets) {
    state.level++;
    _onLevelUp?.(state.level);
  }
}
