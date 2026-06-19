import { state } from './state.js';

export const SLOT_KEYS = ['reef-bloom-save-0', 'reef-bloom-save-1', 'reef-bloom-save-2'];
const CURRENT_SLOT_KEY = 'reef-bloom-current-slot';

// Cloud sync hook — cloudsave.js registers here; fired after any slot write.
let _onSlotWritten = null;
export function onSlotWritten(cb) { _onSlotWritten = cb; }
function _notifyWrite(idx, info) { _onSlotWritten?.(idx, info); }

let _currentSlot  = 0;
let _currentBiome = 'coral';

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

export function setCurrentBiome(biome) {
  _currentBiome = biome;
}

export function getCurrentBiome() {
  return _currentBiome;
}

// ── Save / load ──────────────────────────────────────────────────────────────

/** Serialize current biome's grid state; shared economy fields are written too. */
export function saveGame() {
  const biomeData = {
    grid:           state.grid.map(row => [...row]),
    placedCoral:    state.placedCoral.map(c => ({ uid: c.uid, col: c.col, row: c.row, speciesId: c.speciesId, level: c.level ?? 1, pendingBE: Math.floor(c.pendingBE ?? 0) })),
    placedDecor:    state.placedDecor.map(d => ({ uid: d.uid, col: d.col, row: d.row, speciesId: d.speciesId })),
    placedStations: state.placedStations.map(s => ({ uid: s.uid, col: s.col, row: s.row, level: s.level ?? 1 })),
    fishTypes:      state.fish.map(f => f.speciesId),   // kept for slot-preview counts
    fish:           state.fish.map(f => ({ id: f.speciesId, x: Math.round(f.x), y: Math.round(f.y) })),
    coralTypesSeen: [...state.coralTypesSeen],
    fishTypesSeen:  [...state.fishTypesSeen],
    decorTypesSeen: [...state.decorTypesSeen],
  };

  // Read existing slot data so we don't clobber the OTHER biome's grid
  let full = _readRaw() ?? {};

  // Migrate old flat-format saves (before biome split)
  if (full.grid) {
    const oldCoral = {
      grid:           full.grid,
      placedCoral:    full.placedCoral    ?? [],
      fishTypes:      full.fishTypes      ?? [],
      coralTypesSeen: full.coralTypesSeen ?? [],
      fishTypesSeen:  full.fishTypesSeen  ?? [],
    };
    full = {
      be:             full.be,
      harmony:        full.harmony,
      level:          full.level,
      pearls:         full.pearls,
      clamWatchCount: full.clamWatchCount,
      clamWatchDate:  full.clamWatchDate,
      coral:    oldCoral,
      seagrass: null,
    };
  }

  // Update shared economy fields
  full.be             = state.be;
  full.harmony        = state.harmony;
  full.level          = state.level;
  full.pearls         = state.pearls;
  full.polyps         = state.polyps;
  full.clamWatchCount = state.clamWatchCount;
  full.clamWatchDate  = state.clamWatchDate;
  full.quest              = state.quest;
  full.event              = state.event;
  full.eventUnlocked      = state.eventUnlocked ?? [];
  full.timeOfDay          = state.timeOfDay;
  full.loginStreak        = state.loginStreak ?? 0;
  full.lastLoginDate      = state.lastLoginDate ?? null;
  full.achievements       = state.achievements ?? [];
  full.bredCount          = state.bredCount ?? 0;
  full.feedCount          = state.feedCount ?? 0;
  full.sawNight           = state.sawNight ?? false;
  full.account            = state.account;
  if (state.profile) full.profile = state.profile;

  // Write current biome's grid state
  full[_currentBiome] = biomeData;
  full.savedAt = Date.now();

  try {
    localStorage.setItem(SLOT_KEYS[_currentSlot], JSON.stringify(full));
    _notifyWrite(_currentSlot);
  } catch (e) {
    console.warn('[save] write failed', e);
  }
}

/**
 * Load the current biome from the active slot.
 * Returns a flat object with shared fields merged with biome-specific fields,
 * or null if the slot is empty.
 */
export function loadGame() {
  const full = _readRaw();
  if (!full) return null;

  // Migrate old flat-format saves
  if (full.grid) {
    return full; // _restoreFromSave handles old format fine
  }

  const biomeData = full[_currentBiome] ?? {};

  return {
    be:             full.be,
    harmony:        full.harmony,
    level:          full.level,
    pearls:         full.pearls,
    polyps:         full.polyps,
    clamWatchCount: full.clamWatchCount,
    clamWatchDate:  full.clamWatchDate,
    quest:              full.quest              ?? null,
    event:              full.event              ?? null,
    eventUnlocked:      full.eventUnlocked      ?? [],
    timeOfDay:          full.timeOfDay          ?? 0.30,
    loginStreak:        full.loginStreak        ?? 0,
    lastLoginDate:      full.lastLoginDate      ?? null,
    achievements:       full.achievements       ?? [],
    bredCount:          full.bredCount          ?? 0,
    feedCount:          full.feedCount          ?? 0,
    sawNight:           full.sawNight           ?? false,
    savedAt:            full.savedAt            ?? null,
    account:            full.account            ?? null,
    profile:            full.profile            ?? null,
    grid:           biomeData.grid           ?? null,
    placedCoral:    biomeData.placedCoral    ?? [],
    placedDecor:    biomeData.placedDecor    ?? [],
    placedStations: biomeData.placedStations ?? [],
    fishTypes:      biomeData.fishTypes      ?? [],
    fish:           biomeData.fish           ?? null,
    coralTypesSeen: biomeData.coralTypesSeen ?? [],
    fishTypesSeen:  biomeData.fishTypesSeen  ?? [],
    decorTypesSeen: biomeData.decorTypesSeen ?? [],
  };
}

export function clearSave() {
  try {
    localStorage.removeItem(SLOT_KEYS[_currentSlot]);
    _notifyWrite(_currentSlot, { deleted: true });
  } catch { /* ignore */ }
}

/** Returns {level, coralCount, fishCount, profile} for display, or null if the slot is empty. */
export function getSlotPreview(idx) {
  try {
    const raw = localStorage.getItem(SLOT_KEYS[idx]);
    if (!raw) return null;
    const d = JSON.parse(raw);

    // Old flat format
    if (d.grid) {
      return {
        level:      d.level || 1,
        coralCount: (d.placedCoral || []).length,
        fishCount:  (d.fishTypes   || []).length,
        profile:    d.profile    ?? null,
      };
    }

    // New biome-split format — aggregate across all biomes
    const coral        = d.coral        ?? {};
    const seagrass     = d.seagrass     ?? {};
    const deepTwilight = d.deepTwilight ?? {};
    return {
      level:      d.level || 1,
      coralCount: (coral.placedCoral    || []).length,
      fishCount:  (coral.fishTypes      || []).length
                + (seagrass.fishTypes   || []).length
                + (deepTwilight.fishTypes || []).length,
      profile:    d.profile    ?? null,
    };
  } catch {
    return null;
  }
}

// ── Profile helpers ──────────────────────────────────────────────────────────

/** Returns the profile stored on a slot, or null. Works on any slot index. */
export function getProfile(idx) {
  try {
    const raw = localStorage.getItem(SLOT_KEYS[idx]);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d.profile ?? null;
  } catch {
    return null;
  }
}

/**
 * Write a profile to the given slot, preserving any other slot data.
 * Creates the slot file if it doesn't exist yet (so a fresh slot can hold a
 * profile before the player has placed anything).
 */
export function setProfile(idx, profile) {
  try {
    const raw = localStorage.getItem(SLOT_KEYS[idx]);
    const data = raw ? JSON.parse(raw) : {};
    data.profile = profile;
    data.savedAt = Date.now();
    localStorage.setItem(SLOT_KEYS[idx], JSON.stringify(data));
    _notifyWrite(idx);
  } catch (e) {
    console.warn('[save] profile write failed', e);
  }
}

/** Default profile used when a slot has none yet. */
export function defaultProfile() {
  return {
    name:        'Reef Keeper',
    avatar:      '🪸',
    createdDate: new Date().toISOString().slice(0, 10),
  };
}

/** Permanently delete a specific slot. */
export function clearSlot(idx) {
  try {
    localStorage.removeItem(SLOT_KEYS[idx]);
    _notifyWrite(idx, { deleted: true });
  } catch { /* ignore */ }
}

/** Clear only one biome's data within a slot, preserving the other biome and economy. */
export function clearBiome(slotIdx, biome) {
  try {
    const raw = localStorage.getItem(SLOT_KEYS[slotIdx]);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.grid) {
      // Old flat format — coral is the only biome; clearing it = clearing the slot
      if (biome === 'coral') {
        localStorage.removeItem(SLOT_KEYS[slotIdx]);
        _notifyWrite(slotIdx, { deleted: true });
      }
      return;
    }
    delete data[biome];
    data.savedAt = Date.now();
    localStorage.setItem(SLOT_KEYS[slotIdx], JSON.stringify(data));
    _notifyWrite(slotIdx);
  } catch { /* ignore */ }
}

/**
 * Returns basic info about one biome within a slot, or null if that biome
 * has no placed entities (never visited / already cleared).
 */
export function getBiomePreview(slotIdx, biome) {
  try {
    const raw = localStorage.getItem(SLOT_KEYS[slotIdx]);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d.grid) {
      // Old flat format — only coral data at top level
      if (biome !== 'coral') return null;
      const n = (d.placedCoral || []).length + (d.fishTypes || []).length;
      return n > 0 ? { count: n } : null;
    }
    const bd = d[biome];
    if (!bd) return null;
    const n = (bd.placedCoral || []).length + (bd.fishTypes || []).length;
    return n > 0 ? { count: n } : null;
  } catch {
    return null;
  }
}

/**
 * Returns the combined placedCoral arrays from ALL inactive biomes.
 * Used to compute passive BE production from inactive biomes.
 */
export function getInactiveBiomesPlacedCoral() {
  try {
    const full = _readRaw();
    if (!full) return [];
    if (full.grid) {
      // Old flat-format save — only coral data at top level
      return _currentBiome === 'coral' ? [] : (full.placedCoral ?? []);
    }
    const allBiomes = ['coral', 'seagrass', 'deepTwilight'];
    return allBiomes
      .filter(b => b !== _currentBiome)
      .flatMap(b => full[b]?.placedCoral ?? []);
  } catch {
    return [];
  }
}

// ── Internal ─────────────────────────────────────────────────────────────────

function _readRaw() {
  try {
    const raw = localStorage.getItem(SLOT_KEYS[_currentSlot]);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[save] read failed', e);
    return null;
  }
}
