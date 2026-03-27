// ─── Screen & Layout ─────────────────────────────────────────────────────────
export const SCREEN_W = 1024;
export const SCREEN_H = 768;

// ─── Grid ────────────────────────────────────────────────────────────────────
export const TILE_SIZE  = 60;
export const GRID_COLS  = 10;
export const GRID_ROWS  = 10;
export const GRID_X     = 16;
export const GRID_Y     = 80;
export const GRID_W     = TILE_SIZE * GRID_COLS;   // 600
export const GRID_H     = TILE_SIZE * GRID_ROWS;   // 600

// ─── HUD (top bar) ───────────────────────────────────────────────────────────
export const HUD_H = GRID_Y;  // 80

// ─── Right panel ─────────────────────────────────────────────────────────────
export const PANEL_X = GRID_X + GRID_W + 16;              // 632
export const PANEL_Y = GRID_Y;                              // 80
export const PANEL_W = SCREEN_W - PANEL_X - 8;            // 384
export const PANEL_H = GRID_H;                             // 600

// ─── Economy (prototype-tuned; final values from designer) ───────────────────
export const TICK_MS          = 5000;   // BE tick every 5 s
export const IDLE_STREAK_MS   = 20000;  // 20 s without touch = idle streak
export const IDLE_BONUS_BASE  = 12;     // BE awarded on idle streak

// Per-tick BE output by tier
export const BE_PER_TICK = { common: 1, rare: 2, epic: 3 };

// Coral placement cost by tier
export const CORAL_COST = { common: 5, rare: 20, epic: 50 };

// Fish hatch cost by tier
export const FISH_COST = { common: 10, rare: 25, epic: 60 };

// Starting resources
export const START_BE      = 20;
export const START_HARMONY = 50;
export const START_LEVEL   = 1;

// ─── Tier enum ───────────────────────────────────────────────────────────────
export const TIER = { COMMON: 'common', RARE: 'rare', EPIC: 'epic' };

// ─── Palette ─────────────────────────────────────────────────────────────────
export const COLORS = {
  bg_deep:        0x0d1b2a,
  bg_mid:         0x132842,
  bg_light:       0x1e4068,
  ray:            0x3a7fb5,
  grid_floor:     0x1a2e22,
  grid_line:      0x243d2e,
  grid_hover:     0x2e5a42,
  grid_select:    0x3a7a58,
  panel_bg:       0x080e18,
  panel_border:   0x1a2e3e,
  hud_bg:         0x080e18,
  text_primary:   0xddeeff,
  text_secondary: 0x7ab0cc,
  text_dim:       0x3a5a6a,
  be_icon:        0x64b5f6,
  harmony_fill:   0x81c784,
  harmony_empty:  0x1a3a1a,
  tier_common:    0x42a5f5,
  tier_rare:      0x66bb6a,
  tier_epic:      0xef5350,
  selected_hl:    0xffd740,
  bubble_color:   0x7ecce8,
  rocky_outcrop:  0x2a3a2e,
};

// ─── Coral species ───────────────────────────────────────────────────────────
export const CORAL_SPECIES = {
  staghorn: {
    id: 'staghorn', name: 'Staghorn Coral', scientific: 'Acropora cervicornis',
    tier: TIER.COMMON,   tall: true,  color: 0x00d4e8, unlockLevel: 1,
  },
  finger: {
    id: 'finger',   name: 'Finger Coral',  scientific: 'Porites compressa',
    tier: TIER.COMMON,   tall: true,  color: 0xe040fb, unlockLevel: 1,
  },
  brain: {
    id: 'brain',    name: 'Brain Coral',   scientific: 'Platygyra spp.',
    tier: TIER.COMMON,   tall: false, color: 0xff6b35, unlockLevel: 1,
  },
  lettuce: {
    id: 'lettuce',  name: 'Lettuce Coral', scientific: 'Agaricia spp.',
    tier: TIER.COMMON,   tall: false, color: 0x8bc34a, unlockLevel: 1,
  },
  star: {
    id: 'star',     name: 'Star Coral',    scientific: 'Orbicella spp.',
    tier: TIER.COMMON,   tall: false, color: 0xffd54f, unlockLevel: 1,
  },
  bubble: {
    id: 'bubble',   name: 'Bubble Coral',  scientific: 'Physogyra lichtensteini',
    tier: TIER.RARE, tall: false, color: 0x80deea, unlockLevel: 3,
  },
  candycane: {
    id: 'candycane', name: 'Candy Cane Coral', scientific: 'Caulastrea furcata',
    tier: TIER.RARE, tall: true,  color: 0xf48fb1, unlockLevel: 3,
  },
  toadstool: {
    id: 'toadstool', name: 'Toadstool Leather', scientific: 'Sarcophyton spp.',
    tier: TIER.RARE, tall: false, color: 0xa5d6a7, unlockLevel: 3,
  },
  elkhorn: {
    id: 'elkhorn',  name: 'Elkhorn Coral', scientific: 'Acropora palmata',
    tier: TIER.EPIC,     tall: true,  blocksB: true,  color: 0x4dd0e1, unlockLevel: 5,
  },
  pillar: {
    id: 'pillar',   name: 'Pillar Coral',  scientific: 'Dendrogyra cylindrus',
    tier: TIER.EPIC,     tall: true,  blocksB: true,  color: 0xffcc02, unlockLevel: 5,
  },
};

// ─── Fish species ─────────────────────────────────────────────────────────────
export const FISH_SPECIES = {
  clownfish: {
    id: 'clownfish',  name: 'Clownfish',     scientific: 'Amphiprion ocellaris',
    tier: TIER.COMMON, layer: 'A', color: 0xff6b00, accentColor: 0xffffff,
    size: 16, speed: 1.2, unlockLevel: 1,
  },
  chromis: {
    id: 'chromis',    name: 'Green Chromis', scientific: 'Chromis viridis',
    tier: TIER.COMMON, layer: 'A', color: 0x4caf50, accentColor: 0xb5e7b5,
    size: 12, speed: 1.8, unlockLevel: 1,
  },
  moorishIdol: {
    id: 'moorishIdol', name: 'Moorish Idol', scientific: 'Zanclus cornutus',
    tier: TIER.COMMON, layer: 'B', color: 0xfafafa, accentColor: 0xffeb3b,
    size: 20, speed: 0.9, unlockLevel: 2,
  },
  yellowTang: {
    id: 'yellowTang', name: 'Yellow Tang',   scientific: 'Zebrasoma flavescens',
    tier: TIER.COMMON, layer: 'B', color: 0xffeb3b, accentColor: 0xfff9c4,
    size: 18, speed: 1.1, unlockLevel: 2,
  },
  butterflyfish: {
    id: 'butterflyfish', name: 'Butterflyfish', scientific: 'Chaetodon spp.',
    tier: TIER.RARE, layer: 'A', color: 0xfafafa, accentColor: 0xffcc02,
    size: 16, speed: 1.0, unlockLevel: 3,
  },
  seahorse: {
    id: 'seahorse',   name: 'Seahorse',      scientific: 'Hippocampus spp.',
    tier: TIER.RARE, layer: 'A', color: 0xffb74d, accentColor: 0xff8f00,
    size: 14, speed: 0.4, unlockLevel: 3,
  },
  cuttlefish: {
    id: 'cuttlefish', name: 'Cuttlefish',    scientific: 'Sepia spp.',
    tier: TIER.EPIC,  layer: 'B', color: 0xce93d8, accentColor: 0x9c27b0,
    size: 26, speed: 0.8, unlockLevel: 4,
  },
  morayEel: {
    id: 'morayEel',   name: 'Moray Eel',     scientific: 'Gymnothorax spp.',
    tier: TIER.EPIC,  layer: 'B', color: 0xa1887f, accentColor: 0x5d4037,
    size: 30, speed: 0.7, unlockLevel: 4,
  },
  dolphin: {
    id: 'dolphin',    name: 'Dolphin',       scientific: 'Tursiops truncatus',
    tier: TIER.EPIC,  layer: 'B', color: 0x78909c, accentColor: 0xcfd8dc,
    size: 36, speed: 1.6, unlockLevel: 5,
  },
  shark: {
    id: 'shark',      name: 'Reef Shark',    scientific: 'Carcharhinus amblyrhynchos',
    tier: TIER.EPIC,  layer: 'B', color: 0x546e7a, accentColor: 0xeceff1,
    size: 40, speed: 1.3, unlockLevel: 5,
  },
};
