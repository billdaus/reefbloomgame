import {
  START_BE, START_HARMONY, START_LEVEL, START_PEARLS,
  GRID_ROWS, GRID_COLS,
} from './constants.js';

export const state = {
  // ── Biome ──────────────────────────────────────────────────────────────────
  biome: 'coral',   // 'coral' | 'seagrass'

  // ── Resources ──────────────────────────────────────────────────────────────
  be:      START_BE,
  harmony: START_HARMONY,
  level:   START_LEVEL,
  pearls:  START_PEARLS,

  // ── Ad / clam tracking ─────────────────────────────────────────────────────
  clamWatchCount: 0,           // watches used today
  clamWatchDate:  '',          // date string — resets count when day changes

  // ── Daily quest ────────────────────────────────────────────────────────────
  quest: null,      // { date, status, challenges, reward } — regenerated each day

  // ── Selection (placement mode) ─────────────────────────────────────────────
  selectedType: null,   // 'coral' | 'fish' | null
  selectedId:   null,   // species id string
  removeMode:   false,  // true = tap to remove entities

  // ── Grid ───────────────────────────────────────────────────────────────────
  // [row][col] = speciesId string | null
  grid: Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null)),

  // ── Placed entities ────────────────────────────────────────────────────────
  placedCoral: [],   // [{ uid, col, row, speciesId }]
  fish:        [],   // Fish instances (added by FishLayer)

  // ── Idle streak ────────────────────────────────────────────────────────────
  lastInteractionTime: Date.now(),

  // ── Stats (for Harmony calculation) ───────────────────────────────────────
  coralCount:      0,
  coralTierCounts: { common: 0, uncommon: 0, rare: 0, superRare: 0, epic: 0, legendary: 0, mythic: 0 },
  coralTypesSeen:  new Set(),   // unique speciesIds placed

  fishCount:      0,
  fishTierCounts: { common: 0, uncommon: 0, rare: 0, superRare: 0, epic: 0, legendary: 0, mythic: 0 },
  fishLayerCounts: { A: 0, B: 0 },
  fishTypesSeen:  new Set(),

  // ── Harmony display (smoothed, for saturation filter) ─────────────────────
  harmonySmoothed: START_HARMONY,

  // ── Cross-biome passive income ─────────────────────────────────────────────
  // BE/tick contributed by entities in the currently inactive biome
  passiveBEPerTick: 0,

  // ── Limited time event ─────────────────────────────────────────────────────
  event: null,   // { id, name, icon, theme, description, startDate, endDate, status, challenges, reward }

  // ── Newsletter ─────────────────────────────────────────────────────────────
  newsletterLastRead: '',   // weekOf (YYYY-MM-DD) of most recently opened issue

  // ── Account (placeholder — feature not yet live) ───────────────────────────
  account: null,   // null = not signed in; { displayName, joinDate } when active

  // ── UID counter ────────────────────────────────────────────────────────────
  _nextUid: 1,
  nextUid() { return this._nextUid++; },
};
