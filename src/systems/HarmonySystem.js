import { state } from '../state.js';
import {
  CLEANING_HARMONY_PER, CLEANING_HARMONY_MAX, CLEANING_MISSING_PENALTY, FISH_SPECIES,
} from '../constants.js';

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

  // Cleaning stations (up to CLEANING_HARMONY_MAX pts) — scales with the number
  // of fish actively being cleaned right now, which requires a staffed station
  // (cleaner wrasse present) and rises with station capacity (upgrades).
  if (state.cleaningActive > 0) {
    score += Math.min(state.cleaningActive * CLEANING_HARMONY_PER, CLEANING_HARMONY_MAX);
  }

  // No cleaning station while fish are present → parasites build up, harmony
  // suffers. The penalty grows with the fish population (capped).
  if (fishCount > 0 && state.placedStations.length === 0) {
    score -= Math.min(fishCount * 2, CLEANING_MISSING_PENALTY);
  }

  score = Math.max(0, score);

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

// ── Harmony advisor (suggestions + fish opinions) ─────────────────────────────

/** A one-line status word for the current harmony level. */
function _harmonyStatus(h) {
  if (h >= 90) return 'Thriving';
  if (h >= 70) return 'Healthy';
  if (h >= 45) return 'Settling in';
  return 'Struggling';
}

/**
 * Actionable suggestions for raising harmony, derived from the same rubric
 * computeHarmony() uses, so the advice always matches what actually helps.
 */
export function getHarmonyAdvice() {
  const s = state;
  const suggestions = [];

  if (s.coralCount === 0) {
    suggestions.push('Plant some coral to start your reef.');
    return { harmony: Math.round(s.harmony), status: _harmonyStatus(s.harmony), suggestions };
  }

  if (s.coralTypesSeen.size < 5) {
    suggestions.push(`Plant more coral varieties — diversity counts (${s.coralTypesSeen.size}/5).`);
  }
  if (s.fishCount < 6) {
    suggestions.push('Hatch more fish to bring the reef to life.');
  }
  if (s.fishTypesSeen.size < 3) {
    suggestions.push('Add a few different fish species.');
  }
  const hasA = s.fishLayerCounts.A > 0, hasB = s.fishLayerCounts.B > 0;
  if (s.fishCount > 0 && !(hasA && hasB)) {
    suggestions.push('Add fish that swim at the other depth (mix layer A and B).');
  }
  if (s.coralCount > 0 && s.fishCount > 0) {
    const ratio = Math.min(s.fishCount, s.coralCount) / Math.max(s.fishCount, s.coralCount);
    if (ratio < 0.5) suggestions.push('Balance your fish-to-coral numbers.');
  }
  if (s.fishCount > 0 && s.placedStations.length === 0) {
    suggestions.push('Build a cleaning station — without one, fish get parasites and harmony drops.');
  } else if (s.placedStations.length > 0) {
    const cleaners = s.fish.filter(f => FISH_SPECIES[f.speciesId]?.cleaner).length;
    const clients  = s.fishCount - cleaners;
    const capacity = s.placedStations.reduce((a, st) => a + (st.level ?? 1), 0);
    if (cleaners === 0) {
      suggestions.push('Hatch a cleaner wrasse or shrimp to staff your station.');
    } else if (cleaners < capacity) {
      suggestions.push(`Your stations have ${capacity} slots but only ${cleaners} cleaner${cleaners === 1 ? '' : 's'} — hatch more cleaners to fill them.`);
    }
    if (clients > capacity * 2) {
      suggestions.push(`Cleaning stations are crowded (capacity ${capacity} for ${clients} fish) — upgrade a station or build another.`);
    }
  }

  if (suggestions.length === 0) {
    suggestions.push('Your reef is in beautiful balance — keep it up!');
  }
  return { harmony: Math.round(s.harmony), status: _harmonyStatus(s.harmony), suggestions };
}

const _OPINIONS = {
  dirty:   ['I\'m so itchy… we really need a cleaning station.',
            'My scales could use a good scrub.',
            'Is anyone going to deal with these parasites?'],
  lonely:  ['It\'s a little quiet down here — could use more company.',
            'I wish more fish would move in.',
            'Feels empty. Where is everyone?'],
  oneLayer:['Nobody swims up where I am.',
            'I\'d love some neighbours at a different depth.'],
  crowded: ['The cleaning station queue is endless — we need more capacity!',
            'I\'ve been waiting ages for a cleaner. Upgrade the station?',
            'Too many of us, not enough cleaning slots.'],
  bare:    ['Could use more coral to hide in.',
            'A few more corals would make this feel like home.'],
  happy:   ['The water\'s never felt better!',
            'Best reef in the sea, if you ask me.',
            'I could stay here forever.',
            'So clean, so balanced — chef\'s kiss.'],
  ok:      ['Not bad. Coming along nicely.',
            'Pretty comfy here, mostly.',
            'I\'ve seen worse reefs.'],
};

/** A few in-character fish opinions reflecting the reef's current condition. */
export function getFishOpinions() {
  const present = [...new Set(state.fish.map(f => f.speciesId))]
    .map(id => FISH_SPECIES[id]?.name)
    .filter(Boolean);
  if (present.length === 0) return [];

  // Choose condition pools that apply right now
  const pools = [];
  if (state.fishCount > 0 && state.placedStations.length === 0) pools.push('dirty');
  if (state.placedStations.length > 0) {
    const cleaners = state.fish.filter(f => FISH_SPECIES[f.speciesId]?.cleaner).length;
    const clients  = state.fishCount - cleaners;
    const capacity = state.placedStations.reduce((a, st) => a + (st.level ?? 1), 0);
    if (clients > capacity * 2) pools.push('crowded');
  }
  if (state.fishCount > 0 && state.fishCount < 4) pools.push('lonely');
  const hasA = state.fishLayerCounts.A > 0, hasB = state.fishLayerCounts.B > 0;
  if (state.fishCount > 0 && !(hasA && hasB)) pools.push('oneLayer');
  if (state.coralTypesSeen.size < 3) pools.push('bare');
  if (pools.length === 0) pools.push(state.harmony >= 75 ? 'happy' : 'ok');

  const count = Math.min(3, present.length, Math.max(pools.length, 1) + 1);
  const opinions = [];
  const usedTexts = new Set();
  for (let i = 0; i < count; i++) {
    const pool = _OPINIONS[pools[i % pools.length]];
    // pick a not-yet-used line from this pool when possible
    let text = pool[(i + state.fishCount) % pool.length];
    let guard = 0;
    while (usedTexts.has(text) && guard < pool.length) {
      text = pool[(pool.indexOf(text) + 1) % pool.length]; guard++;
    }
    usedTexts.add(text);
    const speaker = present[i % present.length];   // distinct speakers (i < present.length)
    opinions.push({ speaker, text });
  }
  return opinions;
}
