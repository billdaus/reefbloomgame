import { state } from '../state.js';
import {
  CLAM_TICK_MS, CLAM_SPAWN_CHANCE, AD_DAILY_LIMIT, AD_REWARDS,
  GRID_X, GRID_Y, GRID_W, GRID_H,
} from '../constants.js';

let _tickAccum  = 0;
let _clamActive = false;
let _onSpawn    = null;   // (x, y) => void
let _onDespawn  = null;   // () => void

export function initClamSystem({ onSpawn, onDespawn }) {
  _onSpawn   = onSpawn;
  _onDespawn = onDespawn;
}

/** Call every frame. Handles spawn timing and daily reset. */
export function tickClamSystem(deltaMS) {
  _resetDailyIfNeeded();
  if (_clamActive) return;
  if (state.clamWatchCount >= AD_DAILY_LIMIT) return;

  _tickAccum += deltaMS;
  if (_tickAccum < CLAM_TICK_MS) return;
  _tickAccum -= CLAM_TICK_MS;

  if (Math.random() < CLAM_SPAWN_CHANCE) _spawnClam();
}

/** True if a clam is on screen and the player hasn't hit today's limit. */
export function canWatch() {
  _resetDailyIfNeeded();
  return _clamActive && state.clamWatchCount < AD_DAILY_LIMIT;
}

/** Roll rewards, increment daily counter, return the reward package. */
export function collectAdReward() {
  state.clamWatchCount++;
  return _rollRewards();
}

/** Remove the active clam (called after reward is collected or clam times out). */
export function despawnClam() {
  if (!_clamActive) return;
  _clamActive = false;
  _onDespawn?.();
}

/** How many watches remain today (for UI). */
export function watchesRemaining() {
  _resetDailyIfNeeded();
  return Math.max(0, AD_DAILY_LIMIT - state.clamWatchCount);
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _spawnClam() {
  // Random position in the lower 60% of the grid so it feels floor-level
  const x = GRID_X + 40 + Math.random() * (GRID_W - 80);
  const y = GRID_Y + GRID_H * 0.55 + Math.random() * (GRID_H * 0.35);
  _clamActive = true;
  _onSpawn?.(x, y);
}

function _rollRewards() {
  const beRoll = Math.random();
  const be = beRoll < 0.50 ? AD_REWARDS.be[0]
           : beRoll < 0.80 ? AD_REWARDS.be[1]
           :                 AD_REWARDS.be[2];

  const pearls = Math.random() < 0.75 ? AD_REWARDS.pearls[0] : AD_REWARDS.pearls[1];
  const fishId = Math.random() < 0.99 ? AD_REWARDS.fish[0]   : AD_REWARDS.fish[1];

  return { be, pearls, fishId };
}

function _resetDailyIfNeeded() {
  const today = new Date().toDateString();
  if (state.clamWatchDate !== today) {
    state.clamWatchDate  = today;
    state.clamWatchCount = 0;
  }
}
