import { CORAL_SPECIES, FISH_SPECIES, BIOMES, COLORS, TIER } from '../constants.js';

// ─── Storage key ─────────────────────────────────────────────────────────────
const STORAGE_KEY = 'reef-bloom-journal';

// ─── Lore maps ───────────────────────────────────────────────────────────────

const CORAL_LORE = {
  starter:       'A hardy pioneer coral that colonizes bare rock first. Its rounded polyps emit a soft turquoise glow at dawn.',
  firetip:       'Branching coral with vivid orange-red tips that signal healthy symbiotic algae. Grows quickly but needs space to spread.',
  ghost:         'Pale translucent fans that filter microscopic plankton from passing currents. Delicate yet surprisingly resilient.',
  staghorn:      'One of the fastest-growing reef-builders, Acropora cervicornis can recover from bleaching faster than any massive coral. Its antler-like branches shelter dozens of juvenile fish.',
  finger:        'Dense cylindrical columns of calcium carbonate that grow in thickets. Finger coral buffers shorelines from wave energy and provides critical nursery habitat.',
  brain:         'A massive dome with deep labyrinthine grooves — each groove is a colony of genetically identical polyps working in unison. Some brain corals have lived for over 900 years.',
  lettuce:       'Thin, ruffled plates that maximize surface area for photosynthesis. Each lettuce coral frond is a single flat colony growing outward from its base.',
  star:          'Dense, slow-growing domes with star-shaped polyp mouths. Star corals grow only a few millimetres per year — yet some individuals tower at heights that took five centuries to reach.',
  bubble:        'Its inflated vesicles provide buoyancy and deter reef grazers during the day. At night, the bubbles deflate to reveal long translucent feeding tentacles.',
  candycane:     'The striking striped columns signal inter-polyp competition for resources. Each band marks a period of rapid versus slow calcium deposition.',
  toadstool:     'A soft leather coral that retracts its entire polyp surface when stressed, shedding a toxic mucus layer to deter predators and competing corals.',
  elkhorn:       'Once the most abundant Caribbean coral, now critically endangered. Acropora palmata grows up to 10 cm per year and creates structural habitat for hundreds of species.',
  pillar:        'One of the few corals whose polyps extend during daylight, giving columns a furry appearance. Pillar coral rebuilds rapidly after storm damage — a resilient reef architect.',
  table:         'Horizontal platforms on a central stalk create a microhabitat beneath that teems with invertebrates. Table coral can reach 2 metres across over a century of growth.',
  rainbowCoral:  'A rare mutant strain whose zooxanthellae have diversified into multiple photopigment lineages, producing vivid multicolored bands invisible in normal reef lighting.',
  sunfire:       'Radiating spines concentrate sunlight from multiple angles simultaneously. Colonies found near the edge of the photic zone grow unusually fast compared to shallower relatives.',
  seaweed:       'Fast-growing macroalgae that rapidly colonizes cleared substrate. Provides essential grazing for urchins and sea slugs, and returns nutrients to the sediment as it decomposes.',
  seagrass:      'True marine flowering plants — not algae. Seagrass meadows produce more oxygen per acre than a temperate forest and lock vast quantities of carbon in the seafloor sediment.',
  kelp:          'Giant kelp can grow 30 cm per day, forming underwater forests 50 m tall. Pneumatocysts — hollow gas bladders — keep its fronds oriented toward the sunlight above.',
  twilightBrain: 'A deep-adapted variant whose zooxanthellae have been replaced by bioluminescent bacteria. It pulses with cold blue light visible from 30 metres away in the abyss.',
  phantomPolyp:  'Translucent columns of azooxanthellate coral that feed entirely on passing zooplankton. No sunlight reaches this depth — every calorie comes from the water column.',
  midnightTable: 'A deep-sea table coral that uses bioluminescent lure patterns on its underside to attract and harvest zooplankton drifting through the twilight zone.',
};

const FISH_LORE = {
  blueChromis:         'Blue chromis form large polarized schools that rotate positions constantly — each individual sharing equal exposure to predation. Safety in synchronized numbers.',
  chromis:             'Green chromis are tireless algae farmers, aggressively defending cultivated patches from grazers many times their size — including human divers.',
  zebraGoby:           'Zebra gobies spend their lives within centimetres of a single coral head, darting out to snatch plankton and retreating at the first shadow of a predator.',
  cardinalfish:        'Male cardinalfish carry the fertilized egg mass in their mouths until hatching — fasting for weeks. The young emerge fully formed, ready to face the reef.',
  clownfish:           'All clownfish are born male. The dominant individual in a group becomes female — a sex change that is permanent and triggered entirely by social hierarchy.',
  yellowTang:          'Yellow tangs perform daily vertical migrations from the reef to open water. A scalpel-like spine near their tail can inflict a painful wound on any predator.',
  blueTang:            'Blue tangs eat primarily algae, serving as essential reef cleaners. Their caudal spine glows faintly when the fish is stressed — a warning to nearby fish.',
  octopus:             'Octopuses have been observed opening jars, using tools, and dreaming — their sleeping skin flashing with color changes that mirror the day\'s events.',
  moorishIdol:         'One of the most recognisable reef fish, recognizable for its trailing banner fin. Moorish idols are notoriously difficult to maintain — most individuals refuse to feed in captivity.',
  butterflyfish:       'Butterflyfish are often monogamous for life, patrolling fixed territories together. Their eyespot near the tail confuses predators about which end to strike.',
  zebrafish:           'Zebrafish can regenerate damaged heart tissue — a trait that makes them a cornerstone of cardiac research. On the reef they school tightly, their stripes creating a disorienting blur.',
  seahorse:            'Male seahorses carry and nourish the young in a brood pouch — one of the only male vertebrate pregnancies on Earth. They anchor with prehensile tails to avoid drifting.',
  cuttlefish:          'Cuttlefish have the highest brain-to-body ratio of any invertebrate. Their chromatophores can cycle through 50 distinct color patterns per second — thought to be a form of communication.',
  morayEel:            'Moray eels have a second pharyngeal jaw that launches forward into the throat to grip prey. Cleaner fish routinely enter their gaping mouths to remove parasites.',
  dolphin:             'Dolphins address each other by unique signature whistles they develop in infancy and keep for life — the closest equivalent to a personal name in the animal kingdom.',
  shark:               'Reef sharks are keystone predators. Their removal triggers trophic cascades that allow prey populations to explode, stripping algae from the reef and collapsing entire ecosystems.',
  neonGoby:            'The reef\'s premier parasite-remover: neon gobies run cleaning stations that fish queue to visit, allowing inspection of gills and the inside of open mouths.',
  firefish:            'When threatened, firefish retreat backward into crevices, never breaking eye contact with the predator. Their vivid coloration warns that their flesh contains mild venom.',
  damselfish:          'Damselfish are aggressive territory farmers that tend algae gardens, attacking fish many times their size — even human divers who venture too close to their patch.',
  royalGramma:         'Royal grammas are protogynous hermaphrodites that change sex upward in the hierarchy. Their sharp bicolor split may be a defence against mimics trying to infiltrate their group.',
  pajamaCardinalfish:  'Named for their polka-dot pattern, pajama cardinalfish are nocturnal hunters that form loose aggregations sheltering near coral heads during the day.',
  shrimpGoby:          'Shrimp gobies share a burrow with an almost-blind pistol shrimp in a remarkable mutualism: the shrimp digs and maintains the burrow; the goby watches for danger.',
  banggaiCardinalfish: 'Critically endangered due to overcollection. One of only two cardinalfish that brood internally — the male holds eggs inside his mouth until they hatch as miniature adults.',
  cleanerWrasse:       'Cleaner wrasse are one of the few fish to pass the mirror self-recognition test, suggesting a form of self-awareness researchers once thought limited to mammals and birds.',
  flameAngelfish:      'The brilliant red-orange colouration warns of mildly toxic flesh. Juveniles wear a completely different pattern — a strategy to avoid detection by adults who would exclude competitors.',
  mandarinfish:        'Mandarinfish produce their vivid blue through biochromes rather than reflective structures — making them the only known vertebrates to produce true cyanophore pigment.',
  harlequinTuskfish:   'The harlequin tuskfish uses its prominent blue teeth to flip rubble and rocks in search of invertebrates hiding in the substrate below.',
  blueRibbonEel:       'All blue ribbon eels begin life as black-and-yellow females. As they mature they transition to male — one of the rarest sequential hermaphrodite sequences in fish.',
  napoleonWrasse:      'The largest wrasse, reaching 2 m. Males develop a distinctive cranial hump that grows with age. Napoleon wrasse can live over 30 years and are born female.',
  giantMoray:          'The giant moray hunts cooperatively with grouper — a multi-species predatory alliance unique among coral reef fish. Grouper signals the moray by shaking its head rapidly.',
  horseshoeCrab:       'Not a true crab but more closely related to spiders and scorpions. Their blue copper-based blood contains a clotting agent used globally to test pharmaceutical sterility.',
  pipefish:            'Pipefish are elongated seahorse relatives. Like their kin, the male carries and incubates the eggs — in a skin fold rather than a true pouch — until the young hatch.',
  sandDollar:          'Sand dollars live mostly buried in sand, filtering food particles through tube feet. The pale "dollar" sold in gift shops is their calcium carbonate skeleton — their test.',
  conch:               'Queen conchs are long-lived, reaching 30 years. They return to the same feeding grounds seasonally, guided by a spatial memory researchers are still working to understand.',
  pufferfish:          'Pufferfish inflate by rapidly swallowing water. Their tetrodotoxin is 1,200 times more lethal than cyanide — yet some sea snakes and tiger sharks have evolved immunity.',
  spottedEagleRay:     'Spotted eagle rays form breeding aggregations of thousands. They excavate the sediment with their flat disc-like snouts to uncover buried molluscs and crustaceans.',
  dugong:              'The animals behind mermaid myths — sailors glimpsed them nursing calves above the surface. Dugongs graze seagrass meadows like underwater cattle, creating clearings that boost biodiversity.',
  tropicBlenny:        'Blennies sit in small cavities on the reef watching the world from a fixed perch. Males perform rapid push-up displays to defend territories and attract passing females.',
  seaUrchin:           'Keystone grazers: without sea urchins, algae would rapidly overgrow coral. Their hollow spines shelter juvenile fish and small crustaceans seeking refuge from predators.',
  parrotfish:          'Parrotfish produce up to 90 kg of white sand per year by grinding coral rock with their beak. The idyllic white beaches of tropical islands are largely parrotfish excrement.',
  rabbitfish:          'Rabbitfish travel in mated pairs for life. They are among the first grazers to colonize newly cleared reef patches, playing a critical role in reef recovery after disturbance.',
  cleanerShrimp:       'Cleaner shrimp set up stations that fish visit specifically to have parasites removed from gills and skin. They wave their antennae as a signal they are open for business.',
  mantaRay:            'Manta rays have the largest brain-to-body ratio of all fish and show signs of social learning. Individuals return to the same feeding grounds annually for decades.',
  manatee:             'Manatees have no natural enemies and show curiosity toward humans. Their closest living relative is the elephant — not any marine mammal — sharing a common ancestor 55 million years ago.',
  seaTurtle:           'Sea turtles navigate across ocean basins using the Earth\'s magnetic field, returning decades later to the exact beach where they hatched — an accuracy measured in metres.',
  rainbowGoby:         'A rare variant goby whose iridescent scales shift through the visible spectrum as it angles through the water. Prized among collectors for its living-prism shimmer.',
  glowfinAngelfish:    'A selective breed whose fin margins absorb UV light and re-emit it in the visible spectrum — giving it a permanent neon glow that intensifies in low-light conditions.',
  neonSeahorse:        'A deepwater variant whose bioluminescent spots pulse during courtship. Males compete vigorously for females — a reversal of typical vertebrate reproductive roles.',
  sunburstWrasse:      'This wrasse\'s yellow-gold scales reflect morning light like a second sun. It patrols the same reef section daily, aggressively chasing off any wrasse it recognises as a rival.',
  phantomLionfish:     'A deep-water morph with reduced pigmentation and elongated venomous spines. One of the reef\'s most dramatic ambush predators — capable of engulfing prey half its own length.',
  lanternfish:         'Lanternfish perform the largest daily animal migration on Earth — rising kilometres to feed at the surface at night, then descending to depth before dawn to avoid predators.',
  ghostGoby:           'Nearly fully transparent, the ghost goby is invisible against pale rock. Its only visible features are a faint iridescent stripe and the dark outline of its digestive tract.',
  hatchetfish:         'Hatchetfish use counter-illumination — bioluminescent cells on their belly match the faint downwelling light exactly, rendering them effectively invisible from below.',
  deepBlenny:          'Deep blennies have rod-dominated eyes highly adapted to near-total darkness. They detect prey primarily through lateral-line vibration sensing rather than vision.',
  dragonfish:          'The dragonfish\'s bioluminescent chin barbel glows deep red — invisible to most deep-sea fish, but its own eyes detect it, giving it a private searchlight in total darkness.',
  flashlightFish:      'Flashlight fish carry organs beneath their eyes packed with bioluminescent bacteria. They "blink" by rotating the organ behind a black eyelid — using flash patterns to communicate.',
  viperfish:           'The viperfish\'s fangs are so large they cannot close its mouth. It hangs motionless in the dark with its photophores lit, luring small fish to within striking range.',
  barreleye:           'The barreleye\'s tubular eyes rotate inside a transparent fluid-filled dome on its head — always scanning upward for the silhouettes of prey against the faint surface light.',
  ribbonfish:          'Ribbonfish undulate like a living banner through the water column. The bioluminescent stripe along their lateral line pulses in rhythmic waves to coordinate group movement.',
  twilightSeahorse:    'This deep-adapted seahorse has a vestigial dorsal fin and relies on jet propulsion from its gill plates — an adaptation to the still, pressurized water of the twilight zone.',
  moonSeahorse:        'Moon seahorses emit a faint phosphorescent glow that intensifies during the full moon — synchronising their courtship dances with the monthly tidal cycle.',
  glowEel:             'The glow eel\'s skin contains a dense network of bioluminescent chromatophores capable of generating full-body rippling light patterns used to startle and confuse predators.',
  anglerfish:          'Female anglerfish carry a modified dorsal spine tipped with a glowing lure. Males are microscopic parasites that fuse permanently to the female\'s bloodstream shortly after hatching.',
  gulperEel:           'The gulper eel\'s jaw unhinges to engulf prey larger than itself. Its tail tip glows pink-red as a secondary lure, drawing curious small fish toward its waiting mouth.',
  fangtooth:           'The fangtooth has the largest teeth proportional to body size of any fish — so oversized it can never fully close its mouth. It hunts by detecting bioluminescence in the dark.',
  frilledShark:        'A living fossil whose body plan has not changed in 80 million years. It coils like a serpent before striking with a lunging bite, earning it the nickname "living sea serpent".',
  giantSquid:          'Giant squid have eyes up to 30 cm across — the largest of any living animal. They battle sperm whales in the dark ocean interior, leaving circular sucker scars on the whales\' skin.',
  abyssalRay:          'This deep-water ray glides just above the sediment, detecting buried prey through electroreception. Its slow wingbeats stir billowing clouds of sediment undisturbed for centuries.',
  oarfish:             'The longest bony fish on Earth, reaching 11 m. Oarfish surface only when dying or disoriented — their rare appearances near beaches have fuelled sea-serpent myths for millennia.',
  twilightWhaleShark:  'A twilight-adapted filter-feeder whose bioluminescent spots pulse in slow rhythmic waves. Visible from 20 metres away, drawing clouds of zooplankton toward its open mouth.',
};

// ─── Static resource entries ──────────────────────────────────────────────────

const RESOURCE_ENTRIES = [
  {
    id: 'resource:be',
    category: 'resource',
    name: 'Bloom Energy',
    icon: '🫧',
    color: 0x7ecce8,
    tier: null,
    scientific: null,
    hint: 'You already have this — it powers everything.',
    description: 'The living pulse of your reef. Coral polyps convert sunlight and nutrients into Bloom Energy — the primary currency for every expansion.',
  },
  {
    id: 'resource:harmony',
    category: 'resource',
    name: 'Harmony',
    icon: '🌀',
    color: 0x4caf50,
    tier: null,
    scientific: null,
    hint: 'Place your first coral to unlock.',
    description: 'A measure of biodiversity and ecological balance. A harmonious reef runs richer in colour and vitality. Species diversity and tier variety both drive Harmony higher.',
  },
  {
    id: 'resource:pearls',
    category: 'resource',
    name: 'Pearls',
    icon: '💎',
    color: 0xb0bec5,
    tier: null,
    scientific: null,
    hint: 'Earn pearls from the daily quest or watch the clam.',
    description: 'Rare gems of the deep, formed by bivalves under stress over years. Pearls unlock premium species beyond the reach of Bloom Energy alone.',
  },
];

// ─── Static event entries ─────────────────────────────────────────────────────

const EVENT_ENTRIES = [
  {
    id: 'event:idle_streak',
    category: 'event',
    name: 'Idle Bloom',
    icon: '✨',
    color: 0xffd740,
    tier: null,
    scientific: null,
    hint: 'Leave your reef undisturbed for 20 seconds.',
    description: 'When the reef is left in peace, a spontaneous burst of bioluminescence sweeps through the colony — a bonus bloom from the coral\'s own quiet rhythms.',
  },
  {
    id: 'event:level_up',
    category: 'event',
    name: 'Reef Evolved',
    icon: '⬆️',
    color: 0x29b6f6,
    tier: null,
    scientific: null,
    hint: 'Level up your reef for the first time.',
    description: 'As complexity crosses a threshold, new species emerge from deeper waters, drawn by the flourishing ecosystem you\'ve built.',
  },
  {
    id: 'event:clam',
    category: 'event',
    name: 'Giant Clam',
    icon: '🦪',
    color: 0xffe0b2,
    tier: null,
    scientific: null,
    hint: 'Tap the clam that appears on the reef floor.',
    description: 'Giant clams filter-feed for decades, occasionally producing lustrous pearls. Watching over your reef earns its bounty.',
  },
  {
    id: 'event:quest_accept',
    category: 'event',
    name: 'Daily Quest',
    icon: '🐚',
    color: 0x8bc34a,
    tier: null,
    scientific: null,
    hint: 'Accept a daily quest from the quest clam.',
    description: 'Each dawn a new quest shell appears on the reef floor. The challenges within guide your reef\'s growth in unexpected directions.',
  },
  {
    id: 'event:quest_complete',
    category: 'event',
    name: 'Quest Complete',
    icon: '✦',
    color: 0xffd700,
    tier: null,
    scientific: null,
    hint: 'Complete all challenges in a daily quest.',
    description: 'The quest clam opens wide, radiating golden light. A full day\'s work in the reef is rewarded with a generous bounty of resources.',
  },
  {
    id: 'event:be_max',
    category: 'event',
    name: 'Bloom Overflow',
    icon: '💥',
    color: 0xff6b35,
    tier: null,
    scientific: null,
    hint: 'Fill your Bloom Energy to the maximum (999).',
    description: 'Every polyp pulses in perfect synchrony — the reef\'s Bloom Energy at its absolute limit. Time to spend it on something spectacular.',
  },
  {
    id: 'event:remove',
    category: 'event',
    name: 'Adaptation',
    icon: '🔄',
    color: 0x90a4ae,
    tier: null,
    scientific: null,
    hint: 'Remove a coral or fish from your reef.',
    description: 'Reefs are dynamic systems. Species come and go as conditions change. Sometimes a reef must be reshaped to find its next form.',
  },
];

// ─── Entry builder ────────────────────────────────────────────────────────────

let _builtEntries = null;

function _buildEntries() {
  if (_builtEntries) return _builtEntries;

  const entries = [];

  // 1. Biomes
  const biomeColorMap = {
    coral:       0x1878c8,
    seagrass:    0x0a3d1e,
    deepTwilight: 0x050a1a,
  };
  for (const b of Object.values(BIOMES)) {
    entries.push({
      id:          `biome:${b.id}`,
      category:    'biome',
      name:        b.name,
      icon:        b.icon,
      color:       biomeColorMap[b.id] ?? 0x1878c8,
      tier:        null,
      scientific:  null,
      hint:        b.id === 'coral' ? 'Your starting biome.' : `Travel to the ${b.name} to unlock.`,
      description: b.description,
    });
  }

  // 2. Coral
  for (const spec of Object.values(CORAL_SPECIES)) {
    entries.push({
      id:          `coral:${spec.id}`,
      category:    'coral',
      name:        spec.name,
      icon:        '🪸',
      color:       spec.color,
      tier:        spec.tier,
      scientific:  spec.scientific || null,
      hint:        `Place ${spec.name} to unlock.`,
      description: CORAL_LORE[spec.id] || 'A specimen of the reef.',
    });
  }

  // 3. Fish
  for (const spec of Object.values(FISH_SPECIES)) {
    entries.push({
      id:          `fish:${spec.id}`,
      category:    'fish',
      name:        spec.name,
      icon:        '🐟',
      color:       spec.color,
      tier:        spec.tier,
      scientific:  spec.scientific || null,
      hint:        `Hatch ${spec.name} to unlock.`,
      description: FISH_LORE[spec.id] || 'A creature of the deep.',
    });
  }

  // 4. Resources
  entries.push(...RESOURCE_ENTRIES);

  // 5. Events
  entries.push(...EVENT_ENTRIES);

  _builtEntries = entries;
  return entries;
}

// ─── Persistent unlock state ──────────────────────────────────────────────────

let _unlocked = new Set();

function _save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([..._unlocked]));
  } catch (e) {
    // storage unavailable — silently ignore
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load journal unlock state from localStorage.
 * Auto-unlocks biome:coral and resource:be which are always available.
 */
export function initJournal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const ids = JSON.parse(raw);
      if (Array.isArray(ids)) {
        _unlocked = new Set(ids);
      }
    }
  } catch (e) {
    _unlocked = new Set();
  }

  // Always unlock starting entries
  _unlocked.add('biome:coral');
  _unlocked.add('resource:be');
  _save();
}

/**
 * Unlock an entry by id.
 * @returns {boolean} true if newly unlocked, false if already unlocked or not found.
 */
export function unlockEntry(id) {
  if (_unlocked.has(id)) return false;
  _unlocked.add(id);
  _save();
  return true;
}

/**
 * Check if an entry is unlocked.
 */
export function isUnlocked(id) {
  return _unlocked.has(id);
}

/**
 * Get all journal entries, optionally filtered by category.
 * Each entry object has an additional `unlocked` boolean field.
 * @param {string|null} category
 * @returns {Array}
 */
export function getEntries(category = null) {
  const entries = _buildEntries();
  const filtered = category
    ? entries.filter(e => {
        if (category === 'other') return e.category === 'resource' || e.category === 'event';
        return e.category === category;
      })
    : entries;
  return filtered.map(e => ({ ...e, unlocked: _unlocked.has(e.id) }));
}

/**
 * Count unlocked entries, optionally filtered by category.
 */
export function getUnlockedCount(category = null) {
  return getEntries(category).filter(e => e.unlocked).length;
}

/**
 * Count total entries, optionally filtered by category.
 */
export function getTotalCount(category = null) {
  return getEntries(category).length;
}
