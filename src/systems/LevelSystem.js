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
  { coralCount: 12, fishCount: 4,  harmony: 60 },
  { coralCount: 18, fishCount: 7,  harmony: 75 },
  { coralCount: 24, fishCount: 10, harmony: 78 },
  { coralCount: 30, fishCount: 13, harmony: 80 },  // unlocks Epic
  { coralCount: 38, fishCount: 17, harmony: 82 },
  { coralCount: 46, fishCount: 21, harmony: 85 },
  { coralCount: 55, fishCount: 25, harmony: 87 },  // unlocks Legendary
  { coralCount: 64, fishCount: 29, harmony: 89 },
  { coralCount: 74, fishCount: 34, harmony: 91 },  // unlocks Mythic
  { coralCount: 84, fishCount: 39, harmony: 93 },
  { coralCount: 95, fishCount: 45, harmony: 95 },
  { coralCount: 100, fishCount: 50, harmony: 98 }, // max
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
