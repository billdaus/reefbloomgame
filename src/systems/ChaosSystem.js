import { state } from '../state.js';
import { CHAOS_MAX } from '../constants.js';

/**
 * ChaosSystem — tracks state.chaos (0..CHAOS_MAX).
 *
 * Gavin (the fish) adds chaos as he emits farts and poops. When chaos reaches
 * CHAOS_MAX, the reef catharsis fires: harmony jumps to 100 and chaos resets
 * to 0. A brief flash is queued on state.chaosFlashMs for the HUD to read.
 *
 * Chaos has a slow passive decay so a still reef will eventually calm down.
 */

const DECAY_PER_SEC = 0.6;     // chaos points bled off per second of idle
const FLASH_MS      = 1200;    // duration the HUD flash sits at full intensity

/** Add some chaos. Triggers the discharge if it would cross the cap. */
export function addChaos(amount) {
  if (amount <= 0) return;
  state.chaos += amount;
  if (state.chaos >= CHAOS_MAX) _discharge();
}

/** Update — call once per frame from ReefScene. */
export function updateChaos(deltaMS) {
  // Passive decay
  if (state.chaos > 0) {
    state.chaos = Math.max(0, state.chaos - DECAY_PER_SEC * deltaMS / 1000);
  }
  // Fade the HUD flash hook
  if (state.chaosFlashMs > 0) {
    state.chaosFlashMs = Math.max(0, state.chaosFlashMs - deltaMS);
  }
}

function _discharge() {
  state.chaos          = 0;
  state.harmony        = 100;
  state.harmonySmoothed = 100;
  state.chaosFlashMs   = FLASH_MS;
}
