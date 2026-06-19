import { state } from '../state.js';
import { TICK_MS, BE_MAX, POLYP_MAX } from '../constants.js';
import { beRatePerTick, polypRatePerTick } from './BEEconomy.js';

/**
 * RetentionSystem — the "Welcome Back" return reward.
 *
 * On load it grants two things and returns a summary for the modal:
 *  1. Idle earnings: BE + polyps your reef produced while you were away
 *     (capped at OFFLINE_CAP_MS of accrual, and clamped to your BE cap — so
 *     a Storage vault lets you bank a bigger overnight haul).
 *  2. A daily login-streak bonus that escalates for consecutive days played
 *     and resets if you skip a day — the reason to come back tomorrow.
 *
 * Returns null when there's nothing worth interrupting the player for.
 */

const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;   // earn up to 8h of idle income
const MIN_AWAY_MS    = 60 * 1000;            // ignore sub-minute reloads
const STREAK_CAP     = 7;                     // rewards stop growing after a week

function _dayString(ms) { return new Date(ms).toDateString(); }

export function applyReturnRewards(lastSeenMs, nowMs) {
  const cap = state.beMax ?? BE_MAX;
  const r = {
    awayMs: 0,
    offlineBE: 0, offlinePolyps: 0, offlineCapped: false,
    isNewDay: false, streakDay: 0, streakBE: 0, streakPolyps: 0, streakPearls: 0,
  };

  // ── 1. Idle earnings while away ──────────────────────────────────────────
  if (lastSeenMs && nowMs > lastSeenMs) {
    r.awayMs = nowMs - lastSeenMs;
    const away = Math.min(OFFLINE_CAP_MS, r.awayMs);
    if (away >= MIN_AWAY_MS) {
      const ticks  = away / TICK_MS;
      const beWant = Math.floor(beRatePerTick() * ticks);
      const pWant  = Math.floor(polypRatePerTick() * ticks);

      const beBefore = state.be;
      state.be = Math.min(state.be + beWant, cap);
      r.offlineBE = state.be - beBefore;
      r.offlineCapped = r.offlineBE < beWant;

      const pBefore = state.polyps;
      state.polyps = Math.min(state.polyps + pWant, POLYP_MAX);
      r.offlinePolyps = state.polyps - pBefore;
    }
  }

  // ── 2. Daily login streak ────────────────────────────────────────────────
  const today = _dayString(nowMs);
  if (state.lastLoginDate !== today) {
    const yesterday = _dayString(nowMs - 24 * 60 * 60 * 1000);
    state.loginStreak = (state.lastLoginDate === yesterday) ? (state.loginStreak ?? 0) + 1 : 1;
    state.lastLoginDate = today;

    const s = Math.min(state.loginStreak, STREAK_CAP);
    r.isNewDay      = true;
    r.streakDay     = state.loginStreak;
    r.streakBE      = 60 * s;
    r.streakPolyps  = 8 * s;
    r.streakPearls  = Math.floor(s / 2);

    state.be     = Math.min(state.be + r.streakBE, cap);
    state.polyps = Math.min(state.polyps + r.streakPolyps, POLYP_MAX);
    state.pearls += r.streakPearls;
  }

  const worth = r.isNewDay || r.offlineBE > 0 || r.offlinePolyps > 0;
  return worth ? r : null;
}
