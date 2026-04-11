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
export const BE_MAX           = 999;    // BE hard cap

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
export const SEAGRASS_UNLOCK_LEVEL     = 3;
export const DEEP_TWILIGHT_UNLOCK_LEVEL = 6;

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
  barnacles: {
    id: 'barnacles', name: 'Barnacles', scientific: 'Balanus sp.',
    tier: TIER.COMMON, tall: false, blocksB: false, color: 0xc4c8ce, unlockLevel: 1,
    biome: 'seagrass',
  },
  redSeagrass: {
    id: 'redSeagrass', name: 'Red Seagrass', scientific: 'Halymenia sp.',
    tier: TIER.UNCOMMON, tall: false, blocksB: false, color: 0xc62828, unlockLevel: 2,
    biome: 'seagrass',
  },
  seaweed: {
    id: 'seaweed', name: 'Seaweed', scientific: 'Ulva sp.',
    tier: TIER.UNCOMMON, tall: false, blocksB: false, color: 0x388e3c, unlockLevel: 1,
    biome: 'seagrass',
  },
  seagrass: {
    id: 'seagrass', name: 'Seagrass', scientific: 'Halophila sp.',
    tier: TIER.RARE, tall: false, blocksB: false, color: 0x4caf50, unlockLevel: 3,
    biome: 'seagrass',
  },
  kelp: {
    id: 'kelp', name: 'Giant Kelp', scientific: 'Macrocystis pyrifera',
    tier: TIER.SUPER_RARE, tall: true, blocksB: true, color: 0x8bc34a, unlockLevel: 5,
    biome: 'seagrass',
  },

  // ── Deep Twilight Reef — Bioluminescent structures ────────────────────────
  twilightBrain: {
    id: 'twilightBrain', name: 'Twilight Brain Coral', scientific: '',
    tier: TIER.RARE, tall: false, color: 0x00bcd4, unlockLevel: 6,
    biome: 'deepTwilight',
  },
  phantomPolyp: {
    id: 'phantomPolyp', name: 'Phantom Polyp', scientific: '',
    tier: TIER.SUPER_RARE, tall: true, color: 0x9c27b0, unlockLevel: 8,
    biome: 'deepTwilight',
  },
  midnightTable: {
    id: 'midnightTable', name: 'Midnight Table Coral', scientific: '',
    tier: TIER.LEGENDARY, tall: false, blocksB: true, color: 0x3d5afe, unlockLevel: 12,
    pearlCost: 50, biome: 'deepTwilight',
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
  // ── v0.3 Coral Reef Expansion ────────────────────────────────────────────────
  neonGoby: {
    id: 'neonGoby', name: 'Neon Goby', scientific: 'Elacatinus oceanops',
    tier: TIER.COMMON, layer: 'A', color: 0x0d0d0d, accentColor: 0x00e5ff,
    size: 10, speed: 1.6, unlockLevel: 1,
  },
  firefish: {
    id: 'firefish', name: 'Firefish', scientific: 'Nemateleotris magnifica',
    tier: TIER.COMMON, layer: 'A', color: 0xffccbc, accentColor: 0xff3d00,
    size: 12, speed: 1.4, unlockLevel: 1,
  },
  damselfish: {
    id: 'damselfish', name: 'Damselfish', scientific: 'Pomacentridae spp.',
    tier: TIER.COMMON, layer: 'A', color: 0x1565c0, accentColor: 0x82b1ff,
    size: 11, speed: 1.7, unlockLevel: 2,
  },
  royalGramma: {
    id: 'royalGramma', name: 'Royal Gramma', scientific: 'Gramma loreto',
    tier: TIER.RARE, layer: 'A', color: 0x8e24aa, accentColor: 0xfdd835,
    size: 13, speed: 1.2, unlockLevel: 3,
  },
  pajamaCardinalfish: {
    id: 'pajamaCardinalfish', name: 'Pajama Cardinalfish', scientific: 'Sphaeramia nematoptera',
    tier: TIER.RARE, layer: 'A', color: 0xfafafa, accentColor: 0xe53935,
    size: 12, speed: 1.0, unlockLevel: 4,
  },
  shrimpGoby: {
    id: 'shrimpGoby', name: 'Shrimp Goby', scientific: 'Amblyeleotris spp.',
    tier: TIER.SUPER_RARE, layer: 'A', color: 0xffe0b2, accentColor: 0xff6f00,
    size: 13, speed: 0.9, unlockLevel: 5,
  },
  banggaiCardinalfish: {
    id: 'banggaiCardinalfish', name: 'Banggai Cardinalfish', scientific: 'Pterapogon kauderni',
    tier: TIER.SUPER_RARE, layer: 'A', color: 0xfafafa, accentColor: 0x212121,
    size: 14, speed: 0.8, unlockLevel: 5,
  },
  cleanerWrasse: {
    id: 'cleanerWrasse', name: 'Cleaner Wrasse', scientific: 'Labroides dimidiatus',
    tier: TIER.SUPER_RARE, layer: 'A', color: 0x1e88e5, accentColor: 0xffd54f,
    size: 13, speed: 1.3, unlockLevel: 6,
  },
  flameAngelfish: {
    id: 'flameAngelfish', name: 'Flame Angelfish', scientific: 'Centropyge loricula',
    tier: TIER.EPIC, layer: 'B', color: 0xff3d00, accentColor: 0x212121,
    size: 18, speed: 1.0, unlockLevel: 7,
  },
  mandarinfish: {
    id: 'mandarinfish', name: 'Mandarinfish', scientific: 'Synchiropus splendidus',
    tier: TIER.EPIC, layer: 'A', color: 0x0091ea, accentColor: 0xff6d00,
    size: 15, speed: 0.7, unlockLevel: 8,
  },
  harlequinTuskfish: {
    id: 'harlequinTuskfish', name: 'Harlequin Tuskfish', scientific: 'Choerodon fasciatus',
    tier: TIER.EPIC, layer: 'B', color: 0x0288d1, accentColor: 0xff7043,
    size: 22, speed: 0.9, unlockLevel: 8,
  },
  blueRibbonEel: {
    id: 'blueRibbonEel', name: 'Blue Ribbon Eel', scientific: 'Rhinomuraena quaesita',
    tier: TIER.LEGENDARY, layer: 'B', color: 0x1565c0, accentColor: 0xffff00,
    size: 30, speed: 0.6, unlockLevel: 10,
  },
  napoleonWrasse: {
    id: 'napoleonWrasse', name: 'Napoleon Wrasse', scientific: 'Cheilinus undulatus',
    tier: TIER.MYTHIC, layer: 'B', color: 0x5c6bc0, accentColor: 0xa5d6a7,
    size: 40, speed: 0.8, unlockLevel: 13,
  },
  giantMoray: {
    id: 'giantMoray', name: 'Giant Moray', scientific: 'Gymnothorax javanicus',
    tier: TIER.MYTHIC, layer: 'B', color: 0x4e342e, accentColor: 0xd7ccc8,
    size: 44, speed: 0.6, unlockLevel: 14,
  },
  // ── Seagrass Basin — Benthic ─────────────────────────────────────────────────
  horseshoeCrab: {
    id: 'horseshoeCrab', name: 'Horseshoe Crab', scientific: 'Limulus polyphemus',
    tier: TIER.RARE, layer: 'A', color: 0x6d4c41, accentColor: 0xa1887f,
    size: 18, speed: 0.3, unlockLevel: 3, biome: 'seagrass',
  },
  // ── Seagrass Basin — Grazers ─────────────────────────────────────────────────
  pipefish: {
    id: 'pipefish', name: 'Pipefish', scientific: 'Syngnathus spp.',
    tier: TIER.COMMON, layer: 'A', color: 0x558b2f, accentColor: 0xc5e1a5,
    size: 14, speed: 0.9, unlockLevel: 1, biome: 'seagrass', grazer: true,
  },
  sandDollar: {
    id: 'sandDollar', name: 'Sand Dollar', scientific: 'Echinarachnius parma',
    tier: TIER.UNCOMMON, layer: 'A', color: 0xf0e68c, accentColor: 0x9e9e9e,
    size: 14, speed: 0.15, unlockLevel: 2, biome: 'seagrass', grazer: true,
  },
  conch: {
    id: 'conch', name: 'Queen Conch', scientific: 'Aliger gigas',
    tier: TIER.RARE, layer: 'A', color: 0xd4956a, accentColor: 0xff8a65,
    size: 16, speed: 0.2, unlockLevel: 4, biome: 'seagrass', grazer: true,
  },
  pufferfish: {
    id: 'pufferfish', name: 'Pufferfish', scientific: 'Tetraodontidae spp.',
    tier: TIER.SUPER_RARE, layer: 'B', color: 0xf9a825, accentColor: 0x4e342e,
    size: 16, speed: 0.65, unlockLevel: 5, biome: 'seagrass', grazer: true,
  },
  spottedEagleRay: {
    id: 'spottedEagleRay', name: 'Spotted Eagle Ray', scientific: 'Aetobatus narinari',
    tier: TIER.EPIC, layer: 'B', color: 0x1a237e, accentColor: 0xffffff,
    size: 28, speed: 1.3, unlockLevel: 7, biome: 'seagrass',
  },
  dugong: {
    id: 'dugong', name: 'Dugong', scientific: 'Dugong dugon',
    tier: TIER.LEGENDARY, layer: 'B', color: 0x78909c, accentColor: 0xcfd8dc,
    size: 32, speed: 0.5, unlockLevel: 9, biome: 'seagrass', grazer: true,
  },
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
  manatee: {
    id: 'manatee', name: 'Manatee', scientific: 'Trichechus manatus',
    tier: TIER.LEGENDARY, layer: 'B', color: 0x8d9ea0, accentColor: 0xd0dfe0,
    size: 30, speed: 0.45, unlockLevel: 8, biome: 'seagrass',
  },
  seaTurtle: {
    id: 'seaTurtle', name: 'Sea Turtle', scientific: 'Chelonia mydas',
    tier: TIER.MYTHIC, layer: 'B', color: 0x4e7c50, accentColor: 0x7b5230,
    size: 26, speed: 0.7, unlockLevel: 11, biome: 'both',
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
    pearlCost: 60, biome: ['coral', 'deepTwilight'],
  },

  // ── Deep Twilight Reef — Bioluminescent ────────────────────────────────────
  lanternfish: {
    id: 'lanternfish', name: 'Lanternfish', scientific: 'Myctophidae spp.',
    tier: TIER.COMMON, layer: 'A', color: 0x26c6da, accentColor: 0x00e5ff,
    size: 10, speed: 2.2, unlockLevel: 6, biome: 'deepTwilight',
  },
  ghostGoby: {
    id: 'ghostGoby', name: 'Ghost Goby', scientific: '',
    tier: TIER.COMMON, layer: 'A', color: 0xb0bec5, accentColor: 0x7986cb,
    size: 11, speed: 1.6, unlockLevel: 6, biome: 'deepTwilight',
  },
  hatchetfish: {
    id: 'hatchetfish', name: 'Hatchetfish', scientific: 'Argyropelecus spp.',
    tier: TIER.UNCOMMON, layer: 'A', color: 0xe0e0e0, accentColor: 0x00e5ff,
    size: 12, speed: 1.8, unlockLevel: 6, biome: 'deepTwilight',
  },
  deepBlenny: {
    id: 'deepBlenny', name: 'Deep Blenny', scientific: '',
    tier: TIER.UNCOMMON, layer: 'A', color: 0x4a148c, accentColor: 0xce93d8,
    size: 11, speed: 1.3, unlockLevel: 6, biome: 'deepTwilight',
  },
  dragonfish: {
    id: 'dragonfish', name: 'Dragonfish', scientific: 'Stomiidae spp.',
    tier: TIER.RARE, layer: 'A', color: 0x1a237e, accentColor: 0x00e5ff,
    size: 17, speed: 1.0, unlockLevel: 7, biome: 'deepTwilight',
  },
  flashlightFish: {
    id: 'flashlightFish', name: 'Flashlight Fish', scientific: 'Anomalopidae spp.',
    tier: TIER.RARE, layer: 'A', color: 0x212121, accentColor: 0x00e5ff,
    size: 14, speed: 1.2, unlockLevel: 7, biome: 'deepTwilight',
  },
  viperfish: {
    id: 'viperfish', name: 'Viperfish', scientific: 'Chauliodus spp.',
    tier: TIER.RARE, layer: 'B', color: 0x37474f, accentColor: 0x69f0ae,
    size: 22, speed: 0.9, unlockLevel: 7, biome: 'deepTwilight',
  },
  barreleye: {
    id: 'barreleye', name: 'Barreleye', scientific: 'Macropinna microstoma',
    tier: TIER.SUPER_RARE, layer: 'A', color: 0xe8f5e9, accentColor: 0x00e5ff,
    size: 15, speed: 0.7, unlockLevel: 8, biome: 'deepTwilight',
  },
  ribbonfish: {
    id: 'ribbonfish', name: 'Ribbonfish', scientific: 'Trachipteridae spp.',
    tier: TIER.SUPER_RARE, layer: 'B', color: 0xe8eaf6, accentColor: 0x7986cb,
    size: 30, speed: 1.4, unlockLevel: 8, biome: 'deepTwilight',
  },
  twilightSeahorse: {
    id: 'twilightSeahorse', name: 'Twilight Seahorse', scientific: '',
    tier: TIER.SUPER_RARE, layer: 'A', color: 0x7c4dff, accentColor: 0xe040fb,
    size: 14, speed: 0.4, unlockLevel: 8, biome: 'deepTwilight',
  },
  moonSeahorse: {
    id: 'moonSeahorse', name: 'Moon Seahorse', scientific: 'Hippocampus phosphoreus',
    tier: TIER.RARE, layer: 'A', color: 0xd0d8f8, accentColor: 0x40c4ff,
    size: 15, speed: 0.3, unlockLevel: 7, biome: 'deepTwilight',
  },
  glowEel: {
    id: 'glowEel', name: 'Glow Eel', scientific: 'Gymnothorax bioluminescens',
    tier: TIER.UNCOMMON, layer: 'A', color: 0x0d1a0d, accentColor: 0x76ff03,
    size: 20, speed: 1.1, unlockLevel: 6, biome: 'deepTwilight',
  },
  anglerfish: {
    id: 'anglerfish', name: 'Anglerfish', scientific: 'Melanocetus johnsonii',
    tier: TIER.EPIC, layer: 'B', color: 0x1a1a2e, accentColor: 0xf9f871,
    size: 24, speed: 0.5, unlockLevel: 9, biome: 'deepTwilight',
  },
  gulperEel: {
    id: 'gulperEel', name: 'Gulper Eel', scientific: 'Eurypharynx pelecanoides',
    tier: TIER.EPIC, layer: 'B', color: 0x1a237e, accentColor: 0x00e5ff,
    size: 34, speed: 0.6, unlockLevel: 9, biome: 'deepTwilight',
  },
  fangtooth: {
    id: 'fangtooth', name: 'Fangtooth', scientific: 'Anoplogaster cornuta',
    tier: TIER.EPIC, layer: 'B', color: 0x212121, accentColor: 0xff5722,
    size: 22, speed: 0.8, unlockLevel: 9, biome: 'deepTwilight',
  },
  frilledShark: {
    id: 'frilledShark', name: 'Frilled Shark', scientific: 'Chlamydoselachus anguineus',
    tier: TIER.LEGENDARY, layer: 'B', color: 0x455a64, accentColor: 0x78909c,
    size: 40, speed: 0.7, unlockLevel: 12, biome: 'deepTwilight',
  },
  giantSquid: {
    id: 'giantSquid', name: 'Giant Squid', scientific: 'Architeuthis dux',
    tier: TIER.LEGENDARY, layer: 'B', color: 0xce93d8, accentColor: 0x9c27b0,
    size: 36, speed: 1.0, unlockLevel: 11, biome: 'deepTwilight',
    pearlCost: 60,
  },
  abyssalRay: {
    id: 'abyssalRay', name: 'Abyssal Ray', scientific: '',
    tier: TIER.LEGENDARY, layer: 'B', color: 0x1a237e, accentColor: 0x7986cb,
    size: 36, speed: 1.0, unlockLevel: 10, biome: 'deepTwilight',
  },
  oarfish: {
    id: 'oarfish', name: 'Oarfish', scientific: 'Regalecus glesne',
    tier: TIER.MYTHIC, layer: 'B', color: 0xe8eaf6, accentColor: 0xef5350,
    size: 44, speed: 0.8, unlockLevel: 13, biome: 'deepTwilight',
  },
  twilightWhaleShark: {
    id: 'twilightWhaleShark', name: 'Twilight Whale Shark', scientific: '',
    tier: TIER.MYTHIC, layer: 'B', color: 0x1565c0, accentColor: 0x00e5ff,
    size: 46, speed: 0.6, unlockLevel: 14, biome: 'deepTwilight',
    pearlCost: 80,
  },
};

// ─── Biomes ───────────────────────────────────────────────────────────────────
export const BIOMES = {
  coral: {
    id: 'coral', icon: '🪸', name: 'Coral Reef', shortName: 'Coral',
    unlockLevel: 1, bgColor: 0x1878c8,
    depth: 'Shallow–Mid (1–20 m)',
    description: 'The classic tropical reef — vibrant coral structures hosting diverse fish life. Your home biome.',
  },
  seagrass: {
    id: 'seagrass', icon: '🌿', name: 'Seagrass Basin', shortName: 'Seagrass',
    unlockLevel: 3, bgColor: 0x0a3d1e,
    depth: 'Shallow (1–5 m)',
    description: 'Dense seagrass meadows with sandy patches. Grazers generate bonus BE while feeding. Dual-biome fish explore freely.',
  },
  deepTwilight: {
    id: 'deepTwilight', icon: '🌌', name: 'Deep Twilight Reef', shortName: 'Twilight',
    unlockLevel: 6, bgColor: 0x050a1a,
    depth: 'Deep (200–500 m)',
    description: 'Bioluminescent creatures drift through the perpetual dark. Strange glowing coral and deep-sea predators call this abyss home.',
  },
};
