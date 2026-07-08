// ─── Responsive layout (computed from viewport at startup) ───────────────────
export {
  IS_PORTRAIT,
  SCREEN_W, SCREEN_H,
  TILE_SIZE, GRID_COLS, GRID_ROWS,
  GRID_X, GRID_Y, GRID_W, GRID_H,
  HUD_H,
  PANEL_X, PANEL_Y, PANEL_W, PANEL_H,
} from './layout.js';

// ─── Build version ───────────────────────────────────────────────────────────
// Bump for a major revision, or after every 5 minor revisions.
//   Indev MAJOR.MINOR.PATCH  (patch = minor-revision counter, 0–4 between bumps)
export const GAME_VERSION = 'Alpha Classic 1.2';

// ─── Economy ─────────────────────────────────────────────────────────────────
export const TICK_MS          = 5000;   // BE tick every 5 s
export const IDLE_STREAK_MS   = 20000;  // 20 s without touch = idle streak
export const IDLE_BONUS_BASE  = 12;     // BE awarded on idle streak
export const BE_MAX           = 999;    // BE wallet cap (collected BE)
export const POLYP_MAX        = 999;    // Polyp hard cap
export const CORAL_BUFFER_BASE = 120;   // per-coral BE buffer before collection; raised by Storage corals

// Per-tick BE output by tier (coral)
export const BE_PER_TICK = {
  common: 1, uncommon: 2, rare: 3, superRare: 4, epic: 5, legendary: 6, mythic: 7,
};

// Coral placement cost by tier (BE) — legendary/mythic use pearls, not listed here
export const CORAL_COST = {
  common: 5, uncommon: 10, rare: 20, superRare: 25, epic: 60, legendary: 150, mythic: 300,
};

// Fish hatch cost by tier (BE) — pearl species carry pearlCost on the spec instead
export const FISH_COST = {
  common: 2, uncommon: 5, rare: 10, superRare: 25, epic: 60, legendary: 150, mythic: 300,
};

// Day-hiders — fish that tuck into their home coral by DAY and emerge at NIGHT
// (the inverse of normal fish). Mostly crevice-dwelling nocturnal hunters.
export const DAY_HIDER_SPECIES = new Set([
  'morayEel', 'giantMoray', 'blueRibbonEel', 'octopus', 'anglerfish', 'flashlightFish',
  'rubyOctopus',
]);

// Bioluminescent species (fish + coral) — emit a soft glow at night.
export const BIOLUM_SPECIES = new Set([
  // fish
  'glowEel', 'moonSeahorse', 'anglerfish', 'gulperEel', 'lanternfish', 'flashlightFish',
  'dragonfish', 'viperfish', 'barreleye', 'twilightLantern', 'glowfinAngelfish', 'abyssalRay',
  'twilightWhaleShark',
  // coral
  'auroraCoral', 'lanternCoral', 'orchidCoral', 'twilightBrain', 'phantomPolyp', 'wispCoral',
]);

// Starting resources
export const START_BE      = 20;
export const START_HARMONY = 50;
export const START_LEVEL   = 1;
export const START_PEARLS  = 0;
export const START_POLYPS  = 0;

// ─── Coral upgrading (spend Polyps to grow corals) ───────────────────────────
export const CORAL_MAX_LEVEL       = 5;     // levels 1..5
export const POLYP_BE_BONUS        = 0.5;   // +50% of base BE/tick per level above 1
export const POLYP_PER_CORAL_TICK  = 0.2;   // polyps each coral yields per BE tick, ×level

// ─── Cleaning stations (2×2 structures staffed by cleaner wrasse) ─────────────
export const STATION_SPAN             = 2;      // footprint is STATION_SPAN × STATION_SPAN tiles
export const STATION_MAX_LEVEL        = 5;      // capacity (fish cleaned at once) = level, 1..5
export const STATION_CELL             = '__station'; // grid sentinel marking a station tile
export const CLEAN_DURATION_TICKS      = 100;   // a fish sits still 100 ticks while being cleaned
export const CLEAN_COOLDOWN_MS         = 20000; // a freshly cleaned fish won't seek cleaning again for this long
export const CLEANER_TENURE_TICKS      = 1000;  // re-evaluate a cleaner after this many on-duty ticks…
export const CLEANER_TENURE_CUSTOMERS  = 5;     // …or this many customers served, whichever comes first
export const CLEANER_LEAVE_CHANCE      = 1 / 3; // chance to clock off at each evaluation
export const CLEANER_OFFDUTY_MS        = 9000;  // how long a cleaner stays off duty before rejoining
export const CLEANING_ASSIGN_INTERVAL  = 1500;  // ms between attempts to fill a free slot
export const CLEANING_HARMONY_PER     = 4;      // harmony score per fish actively being cleaned
export const CLEANING_HARMONY_MAX     = 20;     // cap on cleaning harmony bonus
export const CLEANING_MISSING_PENALTY = 14;     // max harmony lost when fish have no station at all

/** Polyps to upgrade a station FROM the given level to the next. */
export function stationUpgradeCost(level) {
  return 10 * Math.max(1, level);   // 1→2:10, 2→3:20, 3→4:30, 4→5:40
}

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
    tier: TIER.RARE, tall: true, color: 0x00a6b8, unlockLevel: 3,
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
    tier: TIER.EPIC, tall: true, blocksB: true, color: 0x37a6b6, unlockLevel: 7,
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
  // ── Deep Twilight — Bubble Essence corals ─────────────────────────────────
  abyssalFan: {
    id: 'abyssalFan', name: 'Abyssal Fan', scientific: '',
    tier: TIER.UNCOMMON, tall: false, color: 0x1de9b6, unlockLevel: 6,
    biome: 'deepTwilight',
  },
  lanternCoral: {
    id: 'lanternCoral', name: 'Lantern Coral', scientific: '',
    tier: TIER.RARE, tall: true, color: 0xffa726, unlockLevel: 7,
    biome: 'deepTwilight',
  },
  wispCoral: {
    id: 'wispCoral', name: 'Wisp Coral', scientific: '',
    tier: TIER.SUPER_RARE, tall: false, color: 0xb388ff, unlockLevel: 9,
    biome: 'deepTwilight',
  },
  // ── Utility: Storage corals (cost Polyps, raise each coral's BE buffer) ────
  essenceVault: {
    id: 'essenceVault', name: 'Essence Vault', scientific: '',
    tier: TIER.RARE, tall: false, color: 0x66bb6a, unlockLevel: 4,
    polypCost: 20, storage: 200, utility: true,
    biome: ['coral', 'seagrass', 'deepTwilight'],
  },
  grandReservoir: {
    id: 'grandReservoir', name: 'Grand Reservoir', scientific: '',
    tier: TIER.EPIC, tall: false, color: 0x26a69a, unlockLevel: 8,
    polypCost: 60, storage: 500, utility: true,
    biome: ['coral', 'seagrass', 'deepTwilight'],
  },
  // ── Shelters — specialized fish homes (no BE; provide home capacity) ────────
  anemoneHome: {
    id: 'anemoneHome', name: 'Anemone Haven', scientific: 'Heteractis magnifica',
    tier: TIER.RARE, tall: false, color: 0xff7043,
    shelter: true, homeCap: 6, homeFor: 'A', polypCost: 30, utility: true, unlockLevel: 4,
    biome: ['coral', 'seagrass', 'deepTwilight'],
  },
  reefCave: {
    id: 'reefCave', name: 'Reef Grotto', scientific: '',
    tier: TIER.EPIC, tall: false, color: 0x6d6f86,
    shelter: true, homeCap: 6, homeFor: 'nocturnal', polypCost: 40, utility: true, unlockLevel: 6,
    biome: ['coral', 'seagrass', 'deepTwilight'],
  },

  // ── Lagoon Shallows (3D mode) — sun-drenched flats ──────────────────────────
  sunCoral: {
    id: 'sunCoral', name: 'Sun Coral', scientific: 'Tubastraea coccinea',
    tier: TIER.UNCOMMON, tall: false, color: 0xff9800, accentColor: 0xffc107,
    unlockLevel: 8, biome: 'seagrass',
  },
  lagoonFan: {
    id: 'lagoonFan', name: 'Lagoon Sea Fan', scientific: 'Gorgonia flabellum',
    tier: TIER.RARE, tall: true, color: 0x9575cd, accentColor: 0xd1a6ff,
    unlockLevel: 8, biome: 'seagrass',
  },
  fireCoral: {
    id: 'fireCoral', name: 'Fire Coral', scientific: 'Millepora alcicornis',
    tier: TIER.RARE, tall: true, color: 0xd4a017, accentColor: 0xfff3b0,
    unlockLevel: 9, biome: 'seagrass',
  },
  mangroveSapling: {
    id: 'mangroveSapling', name: 'Mangrove Sapling', scientific: 'Rhizophora mangle',
    tier: TIER.SUPER_RARE, tall: true, color: 0x2e7d32, accentColor: 0x8d6e63,
    unlockLevel: 10, biome: 'seagrass',
  },
  tidepoolAnemone: {
    id: 'tidepoolAnemone', name: 'Giant Green Anemone', scientific: 'Anthopleura xanthogrammica',
    tier: TIER.UNCOMMON, tall: false, color: 0x66bb6a, accentColor: 0xb2dfdb,
    unlockLevel: 9, biome: 'seagrass',
  },
  gooseneckBarnacles: {
    id: 'gooseneckBarnacles', name: 'Gooseneck Barnacles', scientific: 'Pollicipes polymerus',
    tier: TIER.RARE, tall: false, color: 0x9e9e9e, accentColor: 0xefebe0,
    unlockLevel: 9, biome: 'seagrass',
  },
  seaLettuce: {
    id: 'seaLettuce', name: 'Sea Lettuce', scientific: 'Ulva lactuca',
    tier: TIER.UNCOMMON, tall: false, color: 0x7cb342, accentColor: 0xc5e1a5,
    unlockLevel: 10, biome: 'seagrass',
  },
  corallineAlgae: {
    id: 'corallineAlgae', name: 'Coralline Algae', scientific: 'Corallina officinalis',
    tier: TIER.SUPER_RARE, tall: false, color: 0xf48fb1, accentColor: 0xf8bbd0,
    unlockLevel: 11, biome: 'seagrass',
  },
  // ── Event pass exclusives ─────────────────────────────────────────────────
  pearlOrganPipe: {
    id: 'pearlOrganPipe', name: 'Pearl Organ Pipe', scientific: 'Tubipora musica (pearl form)',
    tier: TIER.LEGENDARY, tall: true, blocksB: false, color: 0xf0e6d3, unlockLevel: 1,
    eventId: 'pearl_tide_2026',
  },
  blossomCoral: {
    id: 'blossomCoral', name: 'Blossom Coral', scientific: 'Acropora floralis',
    tier: TIER.LEGENDARY, tall: false, color: 0xff7fb0, unlockLevel: 1,
    eventId: 'coral_bloom_2026',
  },
  auroraCoral: {
    id: 'auroraCoral', name: 'Aurora Coral', scientific: 'Euphyllia lux',
    tier: TIER.LEGENDARY, tall: true, color: 0x76ff03, unlockLevel: 1,
    eventId: 'bioluminescence_2026',
  },
  tideCoral: {
    id: 'tideCoral', name: 'Moontide Coral', scientific: 'Lobophyllia lunaris',
    tier: TIER.LEGENDARY, tall: false, color: 0x5aa6f0, unlockLevel: 1,
    eventId: 'moonfish_migration_2026',
  },
  frondCoral: {
    id: 'frondCoral', name: 'Verdant Frond', scientific: 'Pavona renovata',
    tier: TIER.LEGENDARY, tall: true, color: 0x2bbf6a, unlockLevel: 1,
    eventId: 'reef_renewal_2026',
  },
  orchidCoral: {
    id: 'orchidCoral', name: 'Twilight Orchid', scientific: 'Dendronephthya noctis',
    tier: TIER.LEGENDARY, tall: true, color: 0x9c64ff, unlockLevel: 1,
    eventId: 'twilight_festival_2026',
  },
  sunsetFan: {
    id: 'sunsetFan', name: 'Sunset Fan', scientific: 'Gorgonia crepuscula',
    tier: TIER.LEGENDARY, tall: true, color: 0xff8a50, accentColor: 0xffd180, unlockLevel: 1,
    eventId: 'shoreline_summer_2026', biome: ['coral', 'seagrass', 'deepTwilight'],
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
    size: 20, speed: 0.7, unlockLevel: 4, nocturnal: true,
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
    size: 26, speed: 0.8, unlockLevel: 7, nocturnal: true,
  },
  morayEel: {
    id: 'morayEel', name: 'Moray Eel', scientific: 'Gymnothorax spp.',
    tier: TIER.EPIC, layer: 'B', color: 0xa1887f, accentColor: 0x5d4037,
    size: 30, speed: 0.7, unlockLevel: 7, nocturnal: true,
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
    size: 13, speed: 1.3, unlockLevel: 6, biome: 'both', cleaner: true,
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
    size: 30, speed: 0.6, unlockLevel: 10, nocturnal: true,
  },
  napoleonWrasse: {
    id: 'napoleonWrasse', name: 'Napoleon Wrasse', scientific: 'Cheilinus undulatus',
    tier: TIER.MYTHIC, layer: 'B', color: 0x5c6bc0, accentColor: 0xa5d6a7,
    size: 40, speed: 0.8, unlockLevel: 13,
  },
  giantMoray: {
    id: 'giantMoray', name: 'Giant Moray', scientific: 'Gymnothorax javanicus',
    tier: TIER.MYTHIC, layer: 'B', color: 0x4e342e, accentColor: 0xd7ccc8,
    size: 44, speed: 0.6, unlockLevel: 14, nocturnal: true,
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
    tier: TIER.COMMON, layer: 'A', color: 0xe53935, accentColor: 0xffffff,
    size: 10, speed: 0.8, unlockLevel: 3, biome: 'both', cleaner: true,
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
  glowCleanerGoby: {
    id: 'glowCleanerGoby', name: 'Glow Cleaner Goby', scientific: 'Elacatinus lumen',
    tier: TIER.COMMON, layer: 'A', color: 0x1de9b6, accentColor: 0x00e5ff,
    size: 11, speed: 1.5, unlockLevel: 6, biome: 'deepTwilight', cleaner: true,
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
    size: 15, speed: 0.3, unlockLevel: 1, biome: 'deepTwilight',
    eventId: 'bioluminescence_2026',
  },
  glowEel: {
    id: 'glowEel', name: 'Glow Eel', scientific: 'Gymnothorax bioluminescens',
    tier: TIER.UNCOMMON, layer: 'A', color: 0x0d1a0d, accentColor: 0x76ff03,
    size: 20, speed: 1.1, unlockLevel: 1, biome: 'deepTwilight',
    eventId: 'bioluminescence_2026',
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
  nautilus: {
    id: 'nautilus', name: 'Nautilus', scientific: 'Nautilus pompilius',
    tier: TIER.EPIC, layer: 'B', color: 0xfff0d9, accentColor: 0xb04a2a,
    size: 26, speed: 0.55, unlockLevel: 9, biome: 'deepTwilight',
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

  // ── Lagoon Shallows (3D mode) ────────────────────────────────────────────────
  mullet: {
    id: 'mullet', name: 'Striped Mullet', scientific: 'Mugil cephalus',
    tier: TIER.COMMON, layer: 'A', color: 0xb0bec5, accentColor: 0x78909c,
    size: 14, speed: 1.6, unlockLevel: 8, biome: 'seagrass',
  },
  sergeantMajor: {
    id: 'sergeantMajor', name: 'Sergeant Major', scientific: 'Abudefduf saxatilis',
    tier: TIER.COMMON, layer: 'A', color: 0xfff176, accentColor: 0x263238,
    size: 12, speed: 1.7, unlockLevel: 8, biome: 'seagrass',
  },
  hermitCrab: {
    id: 'hermitCrab', name: 'Hermit Crab', scientific: 'Pagurus bernhardus',
    tier: TIER.UNCOMMON, layer: 'A', color: 0xd07840, accentColor: 0xf3e0c8,
    size: 12, speed: 0.3, unlockLevel: 8, biome: 'seagrass',
  },
  bonefish: {
    id: 'bonefish', name: 'Bonefish', scientific: 'Albula vulpes',
    tier: TIER.UNCOMMON, layer: 'A', color: 0xcfd8dc, accentColor: 0x90a4ae,
    size: 16, speed: 2.0, unlockLevel: 9, biome: 'seagrass',
  },
  flamingoTongue: {
    id: 'flamingoTongue', name: 'Flamingo Tongue', scientific: 'Cyphoma gibbosum',
    tier: TIER.RARE, layer: 'A', color: 0xffb74d, accentColor: 0x5d4037,
    size: 10, speed: 0.2, unlockLevel: 9, biome: 'seagrass',
  },
  stingray: {
    id: 'stingray', name: 'Southern Stingray', scientific: 'Hypanus americanus',
    tier: TIER.EPIC, layer: 'B', color: 0x8d8468, accentColor: 0xd7ccc8,
    size: 26, speed: 1.0, unlockLevel: 10, biome: 'seagrass',
  },
  lemonShark: {
    id: 'lemonShark', name: 'Lemon Shark', scientific: 'Negaprion brevirostris',
    tier: TIER.LEGENDARY, layer: 'B', color: 0xc0b283, accentColor: 0xe8dcc0,
    size: 38, speed: 1.2, unlockLevel: 12, biome: 'seagrass',
  },
  sculpin: {
    id: 'sculpin', name: 'Tidepool Sculpin', scientific: 'Oligocottus maculosus',
    tier: TIER.COMMON, layer: 'A', color: 0x8d6e63, accentColor: 0x5d4037,
    size: 11, speed: 1.0, unlockLevel: 9, biome: 'seagrass',
  },
  ochreStar: {
    id: 'ochreStar', name: 'Ochre Sea Star', scientific: 'Pisaster ochraceus',
    tier: TIER.UNCOMMON, layer: 'A', color: 0x7e57c2, accentColor: 0xff7043,
    size: 14, speed: 0.15, unlockLevel: 9, biome: 'seagrass',
  },
  tidepoolCrab: {
    id: 'tidepoolCrab', name: 'Shore Crab', scientific: 'Pachygrapsus crassipes',
    tier: TIER.RARE, layer: 'A', color: 0x5d4037, accentColor: 0x8d6e63,
    size: 12, speed: 0.5, unlockLevel: 10, biome: 'seagrass',
  },
  chiton: {
    id: 'chiton', name: 'Gumboot Chiton', scientific: 'Cryptochiton stelleri',
    tier: TIER.RARE, layer: 'A', color: 0x8d4e41, accentColor: 0xbf8a70,
    size: 15, speed: 0.12, unlockLevel: 10, biome: 'seagrass',
  },
  opaleye: {
    id: 'opaleye', name: 'Opaleye', scientific: 'Girella nigricans',
    tier: TIER.SUPER_RARE, layer: 'A', color: 0x558b2f, accentColor: 0x9ccc65,
    size: 16, speed: 1.2, unlockLevel: 11, biome: 'seagrass',
  },
  rubyOctopus: {
    id: 'rubyOctopus', name: 'Ruby Octopus', scientific: 'Octopus rubescens',
    tier: TIER.EPIC, layer: 'B', color: 0xc62828, accentColor: 0xef9a9a,
    size: 16, speed: 0.7, unlockLevel: 12, biome: 'seagrass', nocturnal: true,
  },
  seaOtter: {
    id: 'seaOtter', name: 'Sea Otter', scientific: 'Enhydra lutris',
    tier: TIER.LEGENDARY, layer: 'B', color: 0x6d4c41, accentColor: 0xa1887f,
    size: 30, speed: 1.1, unlockLevel: 13, biome: 'seagrass',
  },

  // ── Event pass exclusives ─────────────────────────────────────────────────
  sakuraAnthias: {
    id: 'sakuraAnthias', name: 'Sakura Anthias', scientific: 'Pseudanthias sakura',
    tier: TIER.LEGENDARY, layer: 'A', color: 0xff80ab, accentColor: 0xffd6e8,
    size: 17, speed: 1.1, unlockLevel: 1,
    eventId: 'coral_bloom_2026',
  },
  opah: {
    id: 'opah', name: 'Opah', scientific: 'Lampris guttatus',
    tier: TIER.LEGENDARY, layer: 'B', color: 0x546e7a, accentColor: 0xff5722,
    size: 38, speed: 0.75, unlockLevel: 1,
    eventId: 'moonfish_migration_2026',
  },
  pearlfish: {
    id: 'pearlfish', name: 'Pearlfish', scientific: 'Margarites nacreus',
    tier: TIER.LEGENDARY, layer: 'A', color: 0xf3ead6, accentColor: 0xfff6e0,
    size: 18, speed: 0.9, unlockLevel: 1,
    eventId: 'pearl_tide_2026',
  },
  twilightLantern: {
    id: 'twilightLantern', name: 'Twilight Lanternfish', scientific: 'Myctophum noctis',
    tier: TIER.LEGENDARY, layer: 'B', color: 0x4a2b8c, accentColor: 0x9c64ff,
    size: 22, speed: 0.8, unlockLevel: 1,
    eventId: 'twilight_festival_2026',
  },
  goldenSeahorse: {
    id: 'goldenSeahorse', name: 'Golden Seahorse', scientific: 'Hippocampus aestas',
    tier: TIER.LEGENDARY, layer: 'A', color: 0xffc933, accentColor: 0xfff3c0,
    size: 15, speed: 0.4, unlockLevel: 1,
    eventId: 'shoreline_summer_2026', biome: ['coral', 'seagrass', 'deepTwilight'],
  },

  // ── Gavin ────────────────────────────────────────────────────────────────
  // Emits farts and poops as he swims — purely cosmetic personality.
  gavin: {
    id: 'gavin', name: 'Gavin', scientific: 'Pisces gaseousus',
    tier: TIER.EPIC, layer: 'A', color: 0x8bc34a, accentColor: 0xc5e1a5,
    size: 18, speed: 1.0, unlockLevel: 1,
    chaotic: true,
  },
};

// ─── Decor species (purely aesthetic — no BE generation) ────────────────────
// Decor occupies a grid tile like coral, costs BE on placement, refunds 50% on
// removal. `kind` drives the renderer in src/entities/Decor.js.
export const DECOR_SPECIES = {
  // ── Coral biome ───────────────────────────────────────────────────────────
  seaPebble: {
    id: 'seaPebble', name: 'Sea Pebble',
    kind: 'pebble', tier: TIER.COMMON, color: 0x8a9097, accentColor: 0x4d5560,
    cost: 3, unlockLevel: 1, biome: 'coral', stackable: true,
  },
  conchShell: {
    id: 'conchShell', name: 'Conch Shell',
    kind: 'conch', tier: TIER.COMMON, color: 0xf6c8a0, accentColor: 0xb04a2a,
    cost: 6, unlockLevel: 2, biome: 'coral', stackable: true,
  },
  driftwood: {
    id: 'driftwood', name: 'Driftwood',
    kind: 'driftwood', tier: TIER.COMMON, color: 0x8d6e4a, accentColor: 0x4d3925,
    cost: 12, unlockLevel: 4, biome: 'coral',
  },
  treasureChest: {
    id: 'treasureChest', name: 'Treasure Chest',
    kind: 'chest', tier: TIER.UNCOMMON, color: 0x6d4019, accentColor: 0xffd54f,
    cost: 30, unlockLevel: 6, biome: 'coral',
  },
  // ── Seagrass biome ────────────────────────────────────────────────────────
  smoothPebble: {
    id: 'smoothPebble', name: 'Smooth Pebble',
    kind: 'pebble', tier: TIER.COMMON, color: 0xc8b28a, accentColor: 0x8a6a3e,
    cost: 3, unlockLevel: 1, biome: 'seagrass', stackable: true,
  },
  oysterCluster: {
    id: 'oysterCluster', name: 'Oyster Cluster',
    kind: 'oysters', tier: TIER.COMMON, color: 0xb6b9a5, accentColor: 0x52584a,
    cost: 8, unlockLevel: 3, biome: 'seagrass', stackable: true,
  },
  rustyAnchor: {
    id: 'rustyAnchor', name: 'Rusty Anchor',
    kind: 'anchor', tier: TIER.UNCOMMON, color: 0x6d4a32, accentColor: 0x3a261a,
    cost: 20, unlockLevel: 5, biome: 'seagrass',
  },
  // ── Deep Twilight biome ───────────────────────────────────────────────────
  glowOrb: {
    id: 'glowOrb', name: 'Glow Orb',
    kind: 'orb', tier: TIER.COMMON, color: 0x1a2a48, accentColor: 0x40e0ff,
    cost: 5, unlockLevel: 6, biome: 'deepTwilight', stackable: true,
  },
  fossilShell: {
    id: 'fossilShell', name: 'Fossil Ammonite',
    kind: 'fossil', tier: TIER.COMMON, color: 0x5b6168, accentColor: 0x2a2e34,
    cost: 12, unlockLevel: 7, biome: 'deepTwilight', stackable: true,
  },
  abyssCairn: {
    id: 'abyssCairn', name: 'Abyss Cairn',
    kind: 'cairn', tier: TIER.UNCOMMON, color: 0x2c3540, accentColor: 0x10151c,
    cost: 25, unlockLevel: 9, biome: 'deepTwilight',
  },
  hydroVent: {
    id: 'hydroVent', name: 'Hydrothermal Vent',
    kind: 'vent', tier: TIER.RARE, color: 0x2b2f3a, accentColor: 0xff6a3d,
    cost: 40, unlockLevel: 8, biome: 'deepTwilight',
  },
  // ── Functional — available in every biome ─────────────────────────────────
  cleaningStation: {
    id: 'cleaningStation', name: 'Cleaning Station',
    kind: 'cleaningStation', tier: TIER.RARE, color: 0x8ad1d8, accentColor: 0xff7043,
    polypCost: 30, unlockLevel: 4, biome: ['coral', 'seagrass', 'deepTwilight'],
    cleaning: true, utility: true,
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
