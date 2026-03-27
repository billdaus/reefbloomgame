import { state } from './state.js';

const SLOT_KEYS        = ['reef-bloom-save-0', 'reef-bloom-save-1', 'reef-bloom-save-2'];
const CURRENT_SLOT_KEY = 'reef-bloom-current-slot';

let _currentSlot = 0;

export function setCurrentSlot(idx) {
  _currentSlot = idx;
  try { localStorage.setItem(CURRENT_SLOT_KEY, String(idx)); } catch { /* ignore */ }
}

export function getCurrentSlot() {
  try {
    const s = localStorage.getItem(CURRENT_SLOT_KEY);
    if (s !== null) _currentSlot = parseInt(s, 10);
  } catch { /* ignore */ }
  return _currentSlot;
}

export function saveGame() {
  const data = {
    be:      state.be,
    harmony: state.harmony,
    level:   state.level,
    pearls:  state.pearls,
    clamWatchCount: state.clamWatchCount,
    clamWatchDate:  state.clamWatchDate,
    grid:    state.grid.map(row => [...row]),
    placedCoral:    state.placedCoral.map(c => ({ uid: c.uid, col: c.col, row: c.row, speciesId: c.speciesId })),
    fishTypes:      state.fish.map(f => f.speciesId),
    coralTypesSeen: [...state.coralTypesSeen],
    fishTypesSeen:  [...state.fishTypesSeen],
  };
  try {
    localStorage.setItem(SLOT_KEYS[_currentSlot], JSON.stringify(data));
  } catch (e) {
    console.warn('[save] write failed', e);
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SLOT_KEYS[_currentSlot]);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[save] read failed', e);
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SLOT_KEYS[_currentSlot]); } catch { /* ignore */ }
}

/** Returns {level, coralCount, fishCount} for display, or null if the slot is empty. */
export function getSlotPreview(idx) {
  try {
    const raw = localStorage.getItem(SLOT_KEYS[idx]);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return {
      level:      d.level || 1,
      coralCount: (d.placedCoral || []).length,
      fishCount:  (d.fishTypes  || []).length,
    };
  } catch {
    return null;
  }
}

/** Permanently delete a specific slot. */
export function clearSlot(idx) {
  try { localStorage.removeItem(SLOT_KEYS[idx]); } catch { /* ignore */ }
}
