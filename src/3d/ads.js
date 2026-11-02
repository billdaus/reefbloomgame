// Rewarded ads for the iOS app — "watch a short ad, earn pearls" in Skip-7's
// Pearl Market. Served by Google AdMob through @capacitor-community/admob.
//
// Where ads exist: only inside the iOS app on iPhone/iPad. The website never
// loads the plugin (lazy import, like iap.js), and the Mac edition has no ad
// SDK at all — Google ships no Mac Catalyst slice, so the Podfile compiles the
// plugin for iOS only and supported() says no on a Mac.
//
// Privacy posture: ads are requested non-personalised (npa) and the App
// Tracking Transparency prompt is never shown, so the app needs no tracking
// permission and the ads carry no device identifier. Content is capped at the
// General rating. See AdMob → Apps → Reef Bloom for the ids below.
import { isNative } from './iap.js';

// TEST_REWARDED is Google's public SAMPLE unit: real-looking test ads that
// earn nothing; dev builds always use it. REWARDED_UNIT is Reef Bloom's own
// "Ad Clam Rewarded" unit (AdMob → Apps → Reef Bloom → Ad units, created
// Oct 29 2026); the matching app id lives in ios/App/App/Info.plist under
// GADApplicationIdentifier. Set REWARDED_UNIT to null to fall back to samples.
const TEST_REWARDED = 'ca-app-pub-3940256099942544/1712485313';
export const REWARDED_UNIT = 'ca-app-pub-8911863192466816/1321740318';
const unitId = () => (import.meta.env?.DEV ? TEST_REWARDED : (REWARDED_UNIT ?? TEST_REWARDED));
/** True while the build still serves Google's sample ads (no real unit id yet). */
export const usingTestAds = () => !REWARDED_UNIT || !!import.meta.env?.DEV;

export const REWARD_PEARLS = 2;      // per ad watched to the end
export const REWARDS_PER_DAY = 5;    // the cap; 10 pearls a day is the $0.99 pack

/** Ads exist here: the iOS app on iPhone/iPad, never the website or the Mac. */
export function supported() {
  if (!isNative()) return false;
  if (/ReefBloomMac/.test(navigator.userAgent)) return false;
  return true;
}

// NEVER await or resolve a promise with the plugin itself — it is a Proxy that
// answers every property (including `then`) with a native-method wrapper. The
// promise carries a plain holder; callers reach the plugin through `.ad`.
let pluginPromise = null;
function plugin() {
  if (!pluginPromise) {
    pluginPromise = (window.__rb3dFakeAds
      ? Promise.resolve({ ad: window.__rb3dFakeAds, ev: window.__rb3dFakeAds.events })   // headless UI tests
      : import('@capacitor-community/admob').then(m => ({ ad: m.AdMob, ev: m.RewardAdPluginEvents })))
      .catch(err => { pluginPromise = null; throw err; });
  }
  return pluginPromise;
}

let initPromise = null;
/** Initialises the Mobile Ads SDK once. Resolves false where ads are unsupported or the SDK fails. */
export function init() {
  if (!supported()) return Promise.resolve(false);
  if (!initPromise) {
    initPromise = plugin()
      .then(({ ad }) => ad.initialize({ maxAdContentRating: 'General', tagForChildDirectedTreatment: false }))
      .then(() => true)
      .catch(err => { initPromise = null; console.warn('[ads] init failed', err?.message ?? err); return false; });
  }
  return initPromise;
}

// ── One rewarded ad at a time ──────────────────────────────────────────────────
// load() fetches the next ad in the background; `ready` says one is on hand.
// show() plays it and resolves with the pearls earned (0 if closed early or
// nothing played). Events, not the show() promise, decide the payout: the
// Rewarded event is the only proof the ad ran to the end.
let ready = false, loading = null, listeners = null;
const LOAD_TIMEOUT_MS = 20000;
export const isReady = () => ready;
const onChange = new Set();
/** Subscribe to readiness changes (the shop re-labels its row). Returns an unsubscribe. */
export function watch(fn) { onChange.add(fn); return () => onChange.delete(fn); }
const notify = () => onChange.forEach(fn => { try { fn(ready); } catch (e) { /* UI only */ } });

let pendingShow = null;   // { resolve, earned } while an ad is on screen
async function ensureListeners(ad, ev) {
  if (listeners) return;
  listeners = true;
  await ad.addListener(ev.Rewarded, (r) => { if (pendingShow) pendingShow.earned = Math.max(1, Number(r?.amount) || 1); });
  await ad.addListener(ev.Dismissed, () => { pendingShow?.resolve(pendingShow.earned); pendingShow = null; });
  await ad.addListener(ev.FailedToShow, () => { pendingShow?.resolve(0); pendingShow = null; });
}

/** Fetches the next rewarded ad. Safe to call often; a load already in flight is reused. */
export function load() {
  if (!supported() || ready) return Promise.resolve(ready);
  if (loading) return loading;
  loading = init().then(async ok => {
    if (!ok) return false;
    const { ad, ev } = await plugin();
    await ensureListeners(ad, ev);
    await Promise.race([
      ad.prepareRewardVideoAd({ adId: unitId(), npa: true }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), LOAD_TIMEOUT_MS)),
    ]);
    ready = true; notify();
    return true;
  }).catch(err => { console.warn('[ads] load failed', err?.message ?? err); return false; })
    .finally(() => { loading = null; });
  return loading;
}

/**
 * Plays the loaded ad. Resolves with the reward units earned (≥1 when the ad
 * was watched to the end, 0 otherwise). The next ad starts loading afterwards.
 */
export async function show() {
  if (!ready) return 0;
  ready = false; notify();
  const { ad } = await plugin();
  const earned = await new Promise((resolve) => {
    pendingShow = { resolve, earned: 0 };
    ad.showRewardVideoAd().then(r => {
      // Some SDK versions resolve with the reward; Dismissed still settles us.
      if (pendingShow && r && Number(r.amount) > 0) pendingShow.earned = Math.max(1, Number(r.amount));
    }).catch(() => { pendingShow?.resolve(0); pendingShow = null; });
  });
  setTimeout(() => { load().catch(() => {}); }, 500);
  return earned;
}
