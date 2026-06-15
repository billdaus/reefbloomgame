import {
  START_BE, START_HARMONY, START_LEVEL, START_PEARLS, START_POLYPS,
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
  polyps:  START_POLYPS,   // spent to upgrade corals; drips from corals over time

  // ── Ad / clam tracking ─────────────────────────────────────────────────────
  clamWatchCount: 0,           // watches used today
  clamWatchDate:  '',          // date string — resets count when day changes

  // ── Daily quest ────────────────────────────────────────────────────────────
  quest: null,      // { date, status, challenges, reward } — regenerated each day

  // ── Selection (placement mode) ─────────────────────────────────────────────
  selectedType: null,   // 'coral' | 'fish' | 'decor' | null
  selectedId:   null,   // species id string
  removeMode:   false,  // true = tap to remove entities

  // ── Grid ───────────────────────────────────────────────────────────────────
  // [row][col] = speciesId string | null
  grid: Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null)),

  // ── Placed entities ────────────────────────────────────────────────────────
  placedCoral: [],   // [{ uid, col, row, speciesId, level }]
  placedDecor: [],   // [{ uid, col, row, speciesId }] — purely aesthetic props
  placedStations: [], // [{ uid, col, row, level }] — 2×2 cleaning stations (col,row = top-left)
  cleaningActive: 0, // fish currently being cleaned across all stations (drives harmony)
  cleansPerMin:   0, // completed cleans in the last 60s (drives capacity advice)
  fish:        [],   // Fish instances (added by FishLayer)
  decorTypesSeen: new Set(),

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

  // ── Account (placeholder — feature not yet live) ───────────────────────────
  account: null,   // null = not signed in; { displayName, joinDate } when active

  // ── Profile (local, tied to the active save slot) ─────────────────────────
  profile: null,   // { name, avatar, createdDate } — see save.js getProfile/setProfile

  // ── UID counter ────────────────────────────────────────────────────────────
  _nextUid: 1,
  nextUid() { return this._nextUid++; },
};
