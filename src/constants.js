// ─── Responsive layout (computed from viewport at startup) ───────────────────
export {
  IS_PORTRAIT,
  SCREEN_W, SCREEN_H,
  TILE_SIZE, GRID_COLS, GRID_ROWS,
  GRID_X, GRID_Y, GRID_W, GRID_H,
  HUD_H,
  PANEL_X, PANEL_Y, PANEL_W, PANEL_H,
} from './layout.js';

// ─── Economy ─────────────────────────────────────────────────────────────────
export const TICK_MS          = 5000;   // BE tick every 5 s
export const IDLE_STREAK_MS   = 20000;  // 20 s without touch = idle streak
export const IDLE_BONUS_BASE  = 12;     // BE awarded on idle streak

// Per-tick BE output by tier (coral)
export const BE_PER_TICK = {
  common: 1, uncommon: 2, rare: 3, superRare: 4, epic: 5, legendary: 6, mythic: 7,
};

// Coral placement cost by tier (BE) — legendary/mythic use pearls, not listed here
export const CORAL_COST = {
  common: 5, uncommon: 10, rare: 20, superRare: 25, epic: 60,
};

// Fish hatch cost by tier (BE) — pearl species carry pearlCost on the spec instead
export const FISH_COST = {
  common: 2, uncommon: 5, rare: 10, superRare: 25, epic: 60, legendary: 150, mythic: 300,
};

// Starting resources
export const START_BE      = 20;
export const START_HARMONY = 50;
export const START_LEVEL   = 1;
export const START_PEARLS  = 0;

// ─── Biomes ──────────────────────────────────────────────────────────────────
export const SEAGRASS_UNLOCK_LEVEL = 3;

// ─── Clam / Ad system ────────────────────────────────────────────────────────
export const CLAM_TICK_MS      = 60_000;  // check for spawn every 1 min
export const CLAM_SPAWN_CHANCE = 0.30;    // 30% per tick
export const AD_DAILY_LIMIT    = 5;       // max watches per calendar day

// Reward tables (index = outcome)
export const AD_REWARDS = {
  be:     [25, 30, 50],           // weight: 50% / 30% / 20%
  pearls: [1, 5],                  // weight: 75% / 25%
  fish:   ['clownfish', 'dolphin'],// weight: 99% / 1%
};

// ─── Tier enum ───────────────────────────────────────────────────────────────
export const TIER = {
  COMMON:     'common',
  UNCOMMON:   'uncommon',
  RARE:       'rare',
  SUPER_RARE: 'superRare',
  EPIC:       'epic',
  LEGENDARY:  'legendary',
  MYTHIC:     'mythic',
};

// Short display labels for each tier
export const TIER_LABEL = {
  common:    'COMMON',
  uncommon:  'UNCOMMON',
  rare:      'RARE',
  superRare: 'S.RARE',
  epic:      'EPIC',
  legendary: 'LEGEND',
  mythic:    'MYTHIC',
};

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
  // Tier colors (matching rarity emojis: ⬜ 🟪 🟦 🟩 🟨 🟧 🟥)
  tier_common:    0xb0bec5,
  tier_uncommon:  0xab47bc,
  tier_rare:      0x42a5f5,
  tier_superRare: 0x66bb6a,
  tier_epic:      0xffd54f,
  tier_legendary: 0xff7043,
  tier_mythic:    0xef5350,
  selected_hl:    0xffd740,
  bubble_color:   0x7ecce8,
  rocky_outcrop:  0x2a3a2e,
};

// ─── Coral species ───────────────────────────────────────────────────────────
export const CORAL_SPECIES = {
  // ── Common ──────────────────────────────────────────────────────────────────
  starter: {
    id: 'starter', name: 'Starter Coral', scientific: '',
    tier: TIER.COMMON, tall: false, color: 0x80cbc4, unlockLevel: 1,
  },
  // ── Uncommon ────────────────────────────────────────────────────────────────
  firetip: {
    id: 'firetip', name: 'Firetip Coral', scientific: '',
    tier: TIER.UNCOMMON, tall: true, color: 0xff8a65, unlockLevel: 2,
  },
  ghost: {
    id: 'ghost', name: 'Ghost Coral', scientific: '',
    tier: TIER.UNCOMMON, tall: false, color: 0xe0e0e0, unlockLevel: 2,
  },
  // ── Rare ────────────────────────────────────────────────────────────────────
  staghorn: {
    id: 'staghorn', name: 'Staghorn Coral', scientific: 'Acropora cervicornis',
    tier: TIER.RARE, tall: true, color: 0x00d4e8, unlockLevel: 3,
  },
  finger: {
    id: 'finger', name: 'Finger Coral', scientific: 'Porites compressa',
    tier: TIER.RARE, tall: true, color: 0xe040fb, unlockLevel: 3,
  },
  brain: {
    id: 'brain', name: 'Brain Coral', scientific: 'Platygyra spp.',
    tier: TIER.RARE, tall: false, color: 0xff6b35, unlockLevel: 3,
  },
  lettuce: {
    id: 'lettuce', name: 'Lettuce Coral', scientific: 'Agaricia spp.',
    tier: TIER.RARE, tall: false, color: 0x8bc34a, unlockLevel: 3,
  },
  star: {
    id: 'star', name: 'Star Coral', scientific: 'Orbicella spp.',
    tier: TIER.RARE, tall: false, color: 0xffd54f, unlockLevel: 3,
  },
  // ── Super Rare ───────────────────────────────────────────────────────────────
  bubble: {
    id: 'bubble', name: 'Bubble Coral', scientific: 'Physogyra lichtensteini',
    tier: TIER.SUPER_RARE, tall: false, color: 0x80deea, unlockLevel: 5,
  },
  candycane: {
    id: 'candycane', name: 'Candy Cane Coral', scientific: 'Caulastrea furcata',
    tier: TIER.SUPER_RARE, tall: true, color: 0xf48fb1, unlockLevel: 5,
  },
  toadstool: {
    id: 'toadstool', name: 'Toadstool Leather', scientific: 'Sarcophyton spp.',
    tier: TIER.SUPER_RARE, tall: false, color: 0xa5d6a7, unlockLevel: 5,
  },
  // ── Epic ────────────────────────────────────────────────────────────────────
  elkhorn: {
    id: 'elkhorn', name: 'Elkhorn Coral', scientific: 'Acropora palmata',
    tier: TIER.EPIC, tall: true, blocksB: true, color: 0x4dd0e1, unlockLevel: 7,
  },
  pillar: {
    id: 'pillar', name: 'Pillar Coral', scientific: 'Dendrogyra cylindrus',
    tier: TIER.EPIC, tall: true, blocksB: true, color: 0xffcc02, unlockLevel: 7,
  },
  // ── Legendary (pearl) ────────────────────────────────────────────────────────
  table: {
    id: 'table', name: 'Table Coral', scientific: '',
    tier: TIER.LEGENDARY, tall: false, blocksB: true, color: 0x26c6da, unlockLevel: 10,
    pearlCost: 50,
  },
  // ── Mythic (pearl) ───────────────────────────────────────────────────────────
  rainbowCoral: {
    id: 'rainbowCoral', name: 'Rainbow Coral', scientific: '',
    tier: TIER.MYTHIC, tall: false, color: 0xff4081, unlockLevel: 12,
    pearlCost: 60,
  },
  sunfire: {
    id: 'sunfire', name: 'Sunfire Coral', scientific: '',
    tier: TIER.MYTHIC, tall: true, blocksB: true, color: 0xffa726, unlockLevel: 12,
    pearlCost: 60,
  },

  // ── Seagrass biome vegetation ─────────────────────────────────────────────
  seagrass: {
    id: 'seagrass', name: 'Seagrass', scientific: 'Halophila sp.',
    tier: TIER.RARE, tall: false, blocksB: false, color: 0x4caf50, unlockLevel: 3,
    biome: 'seagrass',
  },
};

// ─── Fish species ─────────────────────────────────────────────────────────────
export const FISH_SPECIES = {
  // ── Common ──────────────────────────────────────────────────────────────────
  blueChromis: {
    id: 'blueChromis', name: 'Blue Chromis', scientific: '',
    tier: TIER.COMMON, layer: 'A', color: 0x29b6f6, accentColor: 0xb3e5fc,
    size: 12, speed: 1.8, unlockLevel: 1,
  },
  chromis: {
    id: 'chromis', name: 'Green Chromis', scientific: 'Chromis viridis',
    tier: TIER.COMMON, layer: 'A', color: 0x4caf50, accentColor: 0xb5e7b5,
    size: 12, speed: 1.8, unlockLevel: 1,
  },
  // ── Uncommon ────────────────────────────────────────────────────────────────
  zebraGoby: {
    id: 'zebraGoby', name: 'Zebra Goby', scientific: '',
    tier: TIER.UNCOMMON, layer: 'A', color: 0xffd54f, accentColor: 0x212121,
    size: 11, speed: 1.5, unlockLevel: 2,
  },
  cardinalfish: {
    id: 'cardinalfish', name: 'Cardinalfish', scientific: '',
    tier: TIER.UNCOMMON, layer: 'A', color: 0xef9a9a, accentColor: 0xb71c1c,
    size: 13, speed: 1.2, unlockLevel: 2,
  },
  // ── Rare ────────────────────────────────────────────────────────────────────
  clownfish: {
    id: 'clownfish', name: 'Clownfish', scientific: 'Amphiprion ocellaris',
    tier: TIER.RARE, layer: 'A', color: 0xff6b00, accentColor: 0xffffff,
    size: 16, speed: 1.2, unlockLevel: 3,
  },
  yellowTang: {
    id: 'yellowTang', name: 'Yellow Tang', scientific: 'Zebrasoma flavescens',
    tier: TIER.RARE, layer: 'B', color: 0xffeb3b, accentColor: 0xfff9c4,
    size: 18, speed: 1.1, unlockLevel: 3, biome: 'both',
  },
  blueTang: {
    id: 'blueTang', name: 'Blue Tang', scientific: '',
    tier: TIER.RARE, layer: 'B', color: 0x1565c0, accentColor: 0x29b6f6,
    size: 18, speed: 1.1, unlockLevel: 3, biome: 'both',
  },
  octopus: {
    id: 'octopus', name: 'Octopus', scientific: 'Octopus vulgaris',
    tier: TIER.RARE, layer: 'B', color: 0xd84315, accentColor: 0xff8a65,
    size: 20, speed: 0.7, unlockLevel: 4,
  },
  // ── Super Rare ───────────────────────────────────────────────────────────────
  moorishIdol: {
    id: 'moorishIdol', name: 'Moorish Idol', scientific: 'Zanclus cornutus',
    tier: TIER.SUPER_RARE, layer: 'B', color: 0xfafafa, accentColor: 0xffeb3b,
    size: 20, speed: 0.9, unlockLevel: 5,
  },
  butterflyfish: {
    id: 'butterflyfish', name: 'Butterflyfish', scientific: 'Chaetodon spp.',
    tier: TIER.SUPER_RARE, layer: 'A', color: 0xfafafa, accentColor: 0xffcc02,
    size: 16, speed: 1.0, unlockLevel: 5,
  },
  zebrafish: {
    id: 'zebrafish', name: 'Zebrafish', scientific: 'Danio rerio',
    tier: TIER.SUPER_RARE, layer: 'A', color: 0xf5f5f5, accentColor: 0x1a237e,
    size: 12, speed: 1.6, unlockLevel: 5,
  },
  seahorse: {
    id: 'seahorse', name: 'Seahorse', scientific: 'Hippocampus spp.',
    tier: TIER.SUPER_RARE, layer: 'A', color: 0xffb74d, accentColor: 0xff8f00,
    size: 14, speed: 0.4, unlockLevel: 5,
  },
  // ── Epic ────────────────────────────────────────────────────────────────────
  cuttlefish: {
    id: 'cuttlefish', name: 'Cuttlefish', scientific: 'Sepia spp.',
    tier: TIER.EPIC, layer: 'B', color: 0xce93d8, accentColor: 0x9c27b0,
    size: 26, speed: 0.8, unlockLevel: 7,
  },
  morayEel: {
    id: 'morayEel', name: 'Moray Eel', scientific: 'Gymnothorax spp.',
    tier: TIER.EPIC, layer: 'B', color: 0xa1887f, accentColor: 0x5d4037,
    size: 30, speed: 0.7, unlockLevel: 7,
  },
  // ── Legendary ────────────────────────────────────────────────────────────────
  dolphin: {
    id: 'dolphin', name: 'Dolphin', scientific: 'Tursiops truncatus',
    tier: TIER.LEGENDARY, layer: 'B', color: 0x78909c, accentColor: 0xcfd8dc,
    size: 36, speed: 1.6, unlockLevel: 10,
  },
  // ── Mythic ───────────────────────────────────────────────────────────────────
  shark: {
    id: 'shark', name: 'Reef Shark', scientific: 'Carcharhinus amblyrhynchos',
    tier: TIER.MYTHIC, layer: 'B', color: 0x546e7a, accentColor: 0xeceff1,
    size: 40, speed: 1.3, unlockLevel: 12,
  },
  // ── Seagrass Basin — Grazers ─────────────────────────────────────────────────
  tropicBlenny: {
    id: 'tropicBlenny', name: 'Tropic Blenny', scientific: '',
    tier: TIER.UNCOMMON, layer: 'A', color: 0x558b2f, accentColor: 0xaed581,
    size: 11, speed: 1.4, unlockLevel: 2, biome: 'seagrass', grazer: true,
  },
  seaUrchin: {
    id: 'seaUrchin', name: 'Sea Urchin', scientific: 'Diadema antillarum',
    tier: TIER.RARE, layer: 'A', color: 0x1a1a2e, accentColor: 0x7b1fa2,
    size: 14, speed: 0.3, unlockLevel: 3, biome: 'seagrass', grazer: true,
  },
  parrotfish: {
    id: 'parrotfish', name: 'Parrotfish', scientific: 'Scaridae spp.',
    tier: TIER.SUPER_RARE, layer: 'A', color: 0x00acc1, accentColor: 0xf06292,
    size: 20, speed: 1.0, unlockLevel: 5, biome: 'seagrass', grazer: true,
  },
  rabbitfish: {
    id: 'rabbitfish', name: 'Rabbitfish', scientific: 'Siganus spp.',
    tier: TIER.EPIC, layer: 'A', color: 0xfb8c00, accentColor: 0xffe0b2,
    size: 22, speed: 0.9, unlockLevel: 7, biome: 'seagrass', grazer: true,
  },
  // ── Seagrass Basin — Premium visitors ────────────────────────────────────────
  cleanerShrimp: {
    id: 'cleanerShrimp', name: 'Cleaner Shrimp', scientific: 'Lysmata amboinensis',
    tier: TIER.EPIC, layer: 'A', color: 0xe53935, accentColor: 0xffffff,
    size: 10, speed: 0.8, unlockLevel: 7, biome: 'seagrass', pearlCost: 30,
  },
  mantaRay: {
    id: 'mantaRay', name: 'Manta Ray', scientific: 'Mobula birostris',
    tier: TIER.LEGENDARY, layer: 'B', color: 0x263238, accentColor: 0xeceff1,
    size: 38, speed: 1.1, unlockLevel: 10, biome: 'seagrass', pearlCost: 60,
  },
  // ── Pearl (premium) ──────────────────────────────────────────────────────────
  rainbowGoby: {
    id: 'rainbowGoby', name: 'Rainbow Goby', scientific: '',
    tier: TIER.SUPER_RARE, layer: 'A', color: 0x69f0ae, accentColor: 0xff6d00,
    size: 14, speed: 1.4, unlockLevel: 5,
    pearlCost: 15,
  },
  glowfinAngelfish: {
    id: 'glowfinAngelfish', name: 'Glowfin Angelfish', scientific: '',
    tier: TIER.EPIC, layer: 'B', color: 0xff6b9d, accentColor: 0xffe082,
    size: 19, speed: 0.9, unlockLevel: 7,
    pearlCost: 20,
  },
  neonSeahorse: {
    id: 'neonSeahorse', name: 'Neon Seahorse', scientific: '',
    tier: TIER.EPIC, layer: 'A', color: 0x00e5ff, accentColor: 0xff6d00,
    size: 14, speed: 0.4, unlockLevel: 7,
    pearlCost: 25,
  },
  sunburstWrasse: {
    id: 'sunburstWrasse', name: 'Sunburst Wrasse', scientific: '',
    tier: TIER.LEGENDARY, layer: 'B', color: 0xff8f00, accentColor: 0xffff00,
    size: 20, speed: 1.3, unlockLevel: 10,
    pearlCost: 50,
  },
  phantomLionfish: {
    id: 'phantomLionfish', name: 'Phantom Lionfish', scientific: '',
    tier: TIER.MYTHIC, layer: 'B', color: 0x7c4dff, accentColor: 0xff4081,
    size: 28, speed: 0.6, unlockLevel: 12,
    pearlCost: 60,
  },
};

// ─── Biomes ───────────────────────────────────────────────────────────────────
export const BIOMES = {
  coral: {
    id: 'coral',
    icon: '🪸',
    name: 'Coral Reef',
    depth: 'Shallow–Mid (1–20 m)',
    description: 'The classic tropical reef — vibrant coral structures hosting diverse fish life. Your home biome.',
  },
  seagrass: {
    id: 'seagrass',
    icon: '🌿',
    name: 'Seagrass Basin',
    depth: 'Shallow (1–5 m)',
    description: 'Dense seagrass meadows with sandy patches. Grazers generate bonus BE while feeding. Dual-biome fish explore freely.',
  },
};
