import { state } from '../state.js';
import { CORAL_SPECIES, FISH_SPECIES } from '../constants.js';

/**
 * Weekly newsletter — in-game recap of content drops with a species spotlight.
 * Issues are keyed by `weekOf` (Monday ISO date). Newest-first.
 *
 * Add a new issue to the top of ISSUES on each shipped week.
 */
export const NEWSLETTER_ISSUES = [
  {
    weekOf: '2026-04-13',
    title:  'Bioluminescence Descends',
    intro:  'The deep twilight stirs — glowing drifters arrive with a new event pass and fresh quality-of-life.',
    drops: [
      { icon: '✨', title: 'Bioluminescence Bloom event',
        body: 'Apr 20 – 26. Earn Glow Eel and Moon Seahorse as pass-tier exclusives.' },
      { icon: '🎯', title: 'Progressive quest sets',
        body: 'Every event now has three escalating quest sets. Claim each for 2 / 3 / 4 tokens.' },
      { icon: '⏳', title: 'Event-end grace window',
        body: 'Claim any leftover set or pass rewards for up to two days after an event ends.' },
      { icon: '🔀', title: 'Market sort chips',
        body: 'Sort the species panel by Default / Tier / Cost / Name.' },
    ],
    spotlight: {
      speciesId: 'moonSeahorse',
      kind:      'fish',
      blurb:     'A spectral drifter from the deep twilight. Its pale coat pulses softly in the dark — a navigational beacon for shoaling fish.',
    },
  },
  {
    weekOf: '2026-04-06',
    title:  'Event Passes & Ambient Magic',
    intro:  'Events gained exclusive pass tracks and each biome now breathes with seasonal ambience.',
    drops: [
      { icon: '🎟️', title: 'Event pass system',
        body: 'Earn tokens by completing quests to unlock pass-tier rewards, including exclusive species.' },
      { icon: '🌸', title: 'Seasonal ambience',
        body: 'Petals, motes, and pearl shimmers animate during active events.' },
      { icon: '📰', title: 'Real AdSense + ads.txt',
        body: 'Rewarded-video placements replaced the placeholder and the site now advertises ads.txt.' },
    ],
    spotlight: {
      speciesId: 'sakuraAnthias',
      kind:      'fish',
      blurb:     'Exclusive to the Coral Bloom Festival. Schools of these pink anthias trail petal-like fin rays wherever harmony runs high.',
    },
  },
  {
    weekOf: '2026-03-30',
    title:  'Limited Time Events Arrive',
    intro:  'ReefBloom gains its first recurring event system — three rotating windows with unique challenges.',
    drops: [
      { icon: '⚡', title: 'Limited Time Events',
        body: 'Coral Bloom Festival, Moonfish Migration, and Pearl Tide each run for a short window.' },
      { icon: '🕒', title: 'Event countdown',
        body: 'The HUD shows days remaining and pulses when rewards are claimable.' },
    ],
    spotlight: {
      speciesId: 'glowEel',
      kind:      'fish',
      blurb:     'A slender deep-biome eel whose skin culture is colonised by luminous bacteria. Moves in low, searching arcs near the reef floor.',
    },
  },
];

/** Resolve a spotlight species by id, regardless of kind. */
export function resolveSpotlightSpecies(spotlight) {
  if (!spotlight?.speciesId) return null;
  if (spotlight.kind === 'coral') return CORAL_SPECIES[spotlight.speciesId] ?? null;
  return FISH_SPECIES[spotlight.speciesId] ?? CORAL_SPECIES[spotlight.speciesId] ?? null;
}

/** The newest issue (first entry, since the list is newest-first). */
export function getLatestIssue() {
  return NEWSLETTER_ISSUES[0] ?? null;
}

/** True when the player has not yet opened the most recent issue. */
export function hasUnreadNewsletter() {
  const latest = getLatestIssue();
  if (!latest) return false;
  return (state.newsletterLastRead ?? '') < latest.weekOf;
}

/** Mark issues up to and including `weekOf` as read. */
export function markNewsletterRead(weekOf) {
  if (!weekOf) return;
  if (!state.newsletterLastRead || state.newsletterLastRead < weekOf) {
    state.newsletterLastRead = weekOf;
  }
}
