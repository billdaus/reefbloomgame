// Per-species coral traits for the 3D reef. Every coral still starts from its
// tier's baseline (BE_PER_TICK, POLYP_PER_CORAL_TICK, STAGE_MS); these three
// dials bend it so a Staghorn plays differently from a Brain Coral of the
// same tier:
//   income  — BE per tick multiplier
//   polyps  — polyp drip multiplier
//   growth  — how fast stages arrive (1.5 = stages come 1.5× sooner)
// Fast growers earn a little less, slow growers earn more, nurseries trade
// income for polyps. Anything not listed is Steady (1 / 1 / 1). Classic is
// untouched — this is data for ReefScene3D only.
const T = (income, polyps, growth) => ({ income, polyps, growth });

export const CORAL_TRAITS = {
  // ── Coral Reef ──
  starter:        T(1,    1,    1),
  firetip:        T(0.9,  1,    1.3),
  ghost:          T(0.85, 1.3,  1),
  staghorn:       T(0.9,  0.9,  1.45),   // fastest-growing reef builder
  finger:         T(1.1,  1,    0.9),
  brain:          T(1.3,  1,    0.7),    // slow and massive
  lettuce:        T(0.9,  1.3,  1),
  star:           T(1.15, 0.85, 1),
  bubble:         T(1,    1.25, 0.9),
  candycane:      T(1.2,  1,    0.85),
  toadstool:      T(0.9,  1,    1.25),
  elkhorn:        T(1,    0.8,  1.3),
  pillar:         T(1.4,  1,    0.65),   // the slowest thing on the reef
  table:          T(1.2,  1.2,  1),
  rainbowCoral:   T(1,    1.5,  1),
  sunfire:        T(1.4,  1,    0.8),
  goldenTree:     T(1.3,  1.1,  0.75),
  // ── Seagrass ──
  barnacles:      T(0.8,  1.3,  1.2),
  redSeagrass:    T(0.85, 1,    1.4),
  seaweed:        T(0.8,  0.9,  1.5),
  seagrass:       T(0.85, 1.3,  1.2),
  kelp:           T(0.9,  0.8,  1.6),    // half a metre a day
  sunCoral:       T(1.2,  0.9,  0.9),
  lagoonFan:      T(0.85, 1.1,  1.2),
  fireCoral:      T(1,    0.8,  1.35),
  mangroveSapling:T(1.3,  1.2,  0.6),
  tidepoolAnemone:T(0.9,  1.3,  1),
  gooseneckBarnacles: T(0.85, 1.2, 1.2),
  seaLettuce:     T(0.8,  1,    1.5),
  corallineAlgae: T(1.1,  1.3,  0.7),
  // ── Deep Twilight ──
  twilightBrain:  T(1.35, 1,    0.7),
  phantomPolyp:   T(0.9,  1.4,  1),
  midnightTable:  T(1.25, 1.15, 1),
  abyssalFan:     T(1.1,  1,    0.85),
  lanternCoral:   T(1.15, 0.9,  0.95),
  wispCoral:      T(0.85, 1.25, 1.1),
  // ── Event exclusives ──
  pearlOrganPipe: T(1.2,  1.1,  1),
  blossomCoral:   T(1,    1.4,  1),
  auroraCoral:    T(1.3,  1,    1),
  tideCoral:      T(1.1,  1,    1.3),
  frondCoral:     T(0.9,  1,    1.4),
  orchidCoral:    T(1.25, 1.1,  1),
  amberKelp:      T(0.9,  1.1,  1.5),
  sunsetFan:      T(1.2,  1,    1.1),
  lumenCoral:     T(1.15, 1.15, 1),
  russetFan:      T(0.9,  1.3,  1.1),
};

const STEADY = T(1, 1, 1);
export function coralTraits(id) { return CORAL_TRAITS[id] ?? STEADY; }

// Short labels for the UI. The strongest dial leads; a weak one follows.
export function traitTags(t) {
  const tags = [];
  if (t.growth >= 1.2) tags.push('⚡ quick grower');
  else if (t.growth <= 0.8) tags.push('🐢 slow grower');
  if (t.income >= 1.15) tags.push('💰 rich yield');
  else if (t.income <= 0.85) tags.push('🫧 lean yield');
  if (t.polyps >= 1.2) tags.push('🪸 polyp nursery');
  else if (t.polyps <= 0.85) tags.push('🪸 few polyps');
  return tags.length ? tags : ['⚖️ steady'];
}
// One glyph for the species menu — what the coral is best at.
export function traitIcon(t) {
  const best = Math.max(t.growth, t.income, t.polyps);
  if (best <= 1.1) return t.growth <= 0.8 ? '🐢' : '';
  return best === t.growth ? '⚡' : best === t.income ? '💰' : '🪸';
}
