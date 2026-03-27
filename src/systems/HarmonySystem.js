import { state } from '../state.js';

/**
 * Set saturation via a proper luminance-preserving color matrix.
 * sat = 1 → full color, sat = 0 → greyscale.
 */
function _applySaturationMatrix(filter, sat) {
  const s   = Math.max(0, Math.min(1, sat));
  const lr  = 0.2126, lg = 0.7152, lb = 0.0722;
  filter.matrix = [
    lr + s * (1 - lr), lg - s * lg,         lb - s * lb,         0, 0,
    lr - s * lr,         lg + s * (1 - lg), lb - s * lb,         0, 0,
    lr - s * lr,         lg - s * lg,         lb + s * (1 - lb), 0, 0,
    0,                   0,                   0,                   1, 0,
  ];
}

/**
 * Harmony — represents reef balance (0–100).
 * Rises as the reef becomes more diverse and balanced.
 * Never permanently decreases. Drives world saturation.
 */

const SMOOTH_RATE = 0.008;   // saturation filter lerp per frame

/** Compute a target Harmony value from current reef state. */
export function computeHarmony() {
  const {
    coralCount, coralTypesSeen,
    fishCount,  fishTypesSeen,
    fishLayerCounts,
  } = state;

  if (coralCount === 0) return Math.max(state.harmony, 20);  // floor at 20

  let score = 0;

  // Coral diversity (up to 40 pts)
  score += Math.min(coralTypesSeen.size * 8, 40);

  // Fish presence (up to 30 pts)
  score += Math.min(fishCount * 5, 20);
  score += Math.min(fishTypesSeen.size * 5, 10);

  // Layer balance (up to 15 pts) — both layers populated
  const hasA = fishLayerCounts.A > 0;
  const hasB = fishLayerCounts.B > 0;
  score += hasA && hasB ? 15 : hasA || hasB ? 7 : 0;

  // Coral+fish ratio bonus (up to 15 pts)
  if (coralCount > 0 && fishCount > 0) {
    const ratio = Math.min(fishCount, coralCount) / Math.max(fishCount, coralCount);
    score += Math.round(ratio * 15);
  }

  // Harmony never decreases permanently
  const target = Math.min(Math.max(score, state.harmony * 0.9), 100);
  return Math.round(target);
}

/** Call each frame to smoothly transition the harmony saturation filter. */
export function updateHarmonyFilter(worldContainer) {
  state.harmony = computeHarmony();

  // Smooth toward real harmony
  state.harmonySmoothed += (state.harmony - state.harmonySmoothed) * SMOOTH_RATE;

  const h = state.harmonySmoothed;
  // Map 0→0 (greyscale), 100→1 (full color)

  const filters = worldContainer.filters;
  if (filters && filters.length > 0) {
    _applySaturationMatrix(filters[0], h / 100);
  }
}
