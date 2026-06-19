import { state } from '../state.js';
import { BE_MAX, POLYP_MAX } from '../constants.js';

/**
 * AchievementSystem — milestone goals that auto-unlock and pay a one-time
 * reward. Conditions read live state; checkAchievements() is called on a light
 * cadence and after key events. Unlocked ids persist in state.achievements.
 */
export const ACHIEVEMENTS = [
  { id: 'first_coral',  name: 'First Bloom',         desc: 'Place your first coral',        reward: { be: 50 },     met: s => s.coralCount >= 1 },
  { id: 'reef_keeper',  name: 'Reef Keeper',         desc: 'Place 10 coral',                reward: { polyps: 15 }, met: s => s.coralCount >= 10 },
  { id: 'coral_variety',name: 'Coral Connoisseur',   desc: 'Place 8 coral species',         reward: { pearls: 5 },  met: s => (s.coralTypesSeen?.size ?? 0) >= 8 },
  { id: 'full_house',   name: 'Full House',          desc: 'Have 10 fish at once',          reward: { be: 150 },    met: s => s.fishCount >= 10 },
  { id: 'aquarist',     name: 'Aquarist',            desc: 'Discover 10 fish species',      reward: { pearls: 8 },  met: s => (s.fishTypesSeen?.size ?? 0) >= 10 },
  { id: 'harmonious',   name: 'Harmonious',          desc: 'Reach 80 Harmony',              reward: { polyps: 20 }, met: s => s.harmony >= 80 },
  { id: 'thriving',     name: 'Thriving Reef',       desc: 'Reach 95 Harmony',              reward: { pearls: 15 }, met: s => s.harmony >= 95 },
  { id: 'first_breed',  name: 'New Life',            desc: 'Hatch your first bred fish',    reward: { be: 100 },    met: s => (s.bredCount ?? 0) >= 1 },
  { id: 'population',   name: 'Population Boom',      desc: 'Breed 10 fish',                 reward: { pearls: 10 }, met: s => (s.bredCount ?? 0) >= 10 },
  { id: 'caretaker',    name: 'Caretaker',           desc: 'Feed your fish 25 times',       reward: { polyps: 20 }, met: s => (s.feedCount ?? 0) >= 25 },
  { id: 'janitor',      name: 'Spotless',            desc: 'Build a cleaning station',      reward: { be: 80 },     met: s => (s.placedStations?.length ?? 0) >= 1 },
  { id: 'collector',    name: 'Event Collector',     desc: 'Unlock 2 event species',        reward: { pearls: 12 }, met: s => (s.eventUnlocked?.length ?? 0) >= 2 },
  { id: 'nightfall',    name: 'Night Owl',           desc: 'Witness the reef at night',     reward: { be: 60 },     met: s => !!s.sawNight },
];

let _onUnlock = null;   // (achievement) => void

export function initAchievements(onUnlock) {
  _onUnlock = onUnlock;
  if (!Array.isArray(state.achievements)) state.achievements = [];
}

/** Grant any newly-met achievements (idempotent). Returns the newly unlocked. */
export function checkAchievements() {
  if (!Array.isArray(state.achievements)) state.achievements = [];
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (state.achievements.includes(a.id)) continue;
    if (!a.met(state)) continue;
    state.achievements.push(a.id);
    if (a.reward.be)     state.be     = Math.min(state.be + a.reward.be, state.beMax ?? BE_MAX);
    if (a.reward.polyps) state.polyps = Math.min((state.polyps ?? 0) + a.reward.polyps, POLYP_MAX);
    if (a.reward.pearls) state.pearls = (state.pearls ?? 0) + a.reward.pearls;
    fresh.push(a);
    _onUnlock?.(a);
  }
  return fresh;
}

export function isUnlocked(id) {
  return Array.isArray(state.achievements) && state.achievements.includes(id);
}

export function achievementCounts() {
  return { unlocked: state.achievements?.length ?? 0, total: ACHIEVEMENTS.length };
}
