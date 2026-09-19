// In-app purchases for the 3D edition — the pearl packs sold in the Pearl Shop.
//
// Inside the iOS app (Capacitor) this talks to StoreKit 2 through
// @capgo/native-purchases: product names and prices come from the App Store,
// which Apple requires, and a purchase grants pearls only after StoreKit
// reports a verified transaction. On the website there is no store, so
// isNative() is false and the shop falls back to its web behaviour. The plugin
// is imported lazily so the website bundle never loads it.
//
// Product IDs must match App Store Connect (Monetization → In-App Purchases)
// exactly; `pearls` and the fallback `price` mirror the App Store listing.

export const PEARL_PACKS = [
  { id: 'com.defenestrationtech.games.reefbloom.pearls10', pearls: 10, price: '$0.99' },
  { id: 'com.defenestrationtech.games.reefbloom.pearls35', pearls: 35, price: '$2.99' },
  { id: 'com.defenestrationtech.games.reefbloom.pearls60', pearls: 60, price: '$4.99' },
];

export const packById = (id) => PEARL_PACKS.find(p => p.id === id) ?? null;

/** True when running inside the Capacitor shell (the native bridge injects window.Capacitor). */
export function isNative() {
  return typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
}

// NEVER resolve a promise with the plugin itself. A Capacitor plugin is a Proxy
// that answers every property with a native-method wrapper — including `then` —
// so `await`ing it (or returning it from a .then callback) makes the Promise
// machinery call NativePurchases.then() as a native method, which rejects as
// unimplemented and takes every call down with it. The promise carries a plain
// holder object instead; callers reach the plugin through `.np`.
let pluginPromise = null;
function plugin() {
  if (!pluginPromise) {
    pluginPromise = import('@capgo/native-purchases')
      .then(m => ({ np: m.NativePurchases }))
      .catch(err => { pluginPromise = null; throw err; });
  }
  return pluginPromise;
}

let productsPromise = null;

// Last prices StoreKit gave us, kept so the shop can open with real prices on
// screen instantly while a fresh fetch runs behind it. These are StoreKit's own
// localized strings, only remembered — never hardcoded — and the purchase itself
// always goes through StoreKit at the live price.
const PRODUCTS_KEY = 'rb3d_iap_products';
/** Forget an in-flight or failed product fetch so the next loadProducts() asks StoreKit again. */
export function resetProducts() { productsPromise = null; }

/** Remembered products in PEARL_PACKS order, or [] if StoreKit has never answered. */
export function cachedProducts() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(PRODUCTS_KEY)) ?? []; } catch (e) { saved = []; }
  if (!Array.isArray(saved)) return [];
  const byId = new Map(saved.filter(p => p && p.id && p.priceString).map(p => [p.id, p]));
  return PEARL_PACKS.filter(p => byId.has(p.id))
    .map(p => ({ id: p.id, pearls: p.pearls, title: byId.get(p.id).title ?? '', priceString: byId.get(p.id).priceString }));
}

/**
 * Loads the pearl packs from the App Store. Resolves to an array in
 * PEARL_PACKS order, each `{ id, pearls, title, priceString }`. Packs the
 * store doesn't return (not yet created, or metadata missing in App Store
 * Connect) are left out. Cached after the first successful load.
 */
export function loadProducts() {
  if (!isNative()) return Promise.resolve([]);
  if (!productsPromise) {
    productsPromise = plugin()
      .then(({ np }) => np.getProducts({ productIdentifiers: PEARL_PACKS.map(p => p.id), productType: 'inapp' }))
      .then(({ products }) => {
        const byId = new Map(products.map(p => [p.identifier, p]));
        const list = PEARL_PACKS
          .filter(p => byId.has(p.id))
          .map(p => {
            const sp = byId.get(p.id);
            return { id: p.id, pearls: p.pearls, title: sp.title, priceString: sp.priceString };
          });
        if (list.length) {
          try { localStorage.setItem(PRODUCTS_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
        }
        return list;
      })
      .catch(err => { productsPromise = null; throw err; });   // retry on next open
  }
  return productsPromise;
}

// ── Paying out exactly once ────────────────────────────────────────────────────
// A purchase can complete in two places: inside purchaseProduct(), or later
// through StoreKit's transaction-update stream — after an interrupted purchase
// (new terms, payment update, authentication), an Ask-to-Buy approval, or a
// purchase that finished while the app was closed. App Review exercises those
// flows in the sandbox. Both paths funnel through markGranted() so a
// transaction pays out once, whichever path sees it first.
const GRANTED_KEY = 'rb3d_iap_granted';   // transaction ids already paid out
const PENDING_KEY = 'rb3d_iap_pending';   // pearls owed to the reef, applied on next reef load

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (e) { return fallback; }
}
function writeJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage full / disabled */ }
}
const grantedThisSession = new Set();
/** Records a transaction as paid out. Returns false if it already was. */
function markGranted(txId) {
  if (txId === undefined || txId === null || txId === '') return true;   // nothing to dedupe on
  const id = String(txId);
  if (grantedThisSession.has(id)) return false;
  const ids = readJSON(GRANTED_KEY, []);
  if (ids.includes(id)) { grantedThisSession.add(id); return false; }
  grantedThisSession.add(id);
  ids.push(id);
  writeJSON(GRANTED_KEY, ids.slice(-200));
  return true;
}
/** Pearls credited while no reef was open (e.g. on the Home screen). Clears the tab. */
export function takePendingPearls() {
  const n = Number(readJSON(PENDING_KEY, 0)) || 0;
  if (n) writeJSON(PENDING_KEY, 0);
  return n;
}

const PURCHASE_TIMEOUT_MS = 180000;   // the sheet can sit open a long while (passwords, Ask to Buy)

let listening = false, grantHandler = null;
/**
 * Subscribes to transactions that complete outside purchase(). With a handler
 * (the reef), pearls are granted on the spot; without one (the Home screen)
 * they're banked and applied when a reef next loads. Safe to call repeatedly —
 * later calls just swap the handler.
 */
export async function startTransactionListener(handler) {
  grantHandler = handler ?? null;
  if (!isNative() || listening) return;
  listening = true;
  try {
    const { np } = await plugin();
    await np.addListener('transactionUpdated', (tx) => {
      const pack = packById(tx?.productIdentifier);
      if (!pack || tx.revocationDate) return;
      if (!markGranted(tx.transactionId)) return;
      if (grantHandler) grantHandler(pack.pearls);
      else writeJSON(PENDING_KEY, (Number(readJSON(PENDING_KEY, 0)) || 0) + pack.pearls);
    });
  } catch (e) { listening = false; }
}

/**
 * Runs the StoreKit purchase sheet for one pack. Resolves to the number of
 * pearls to grant (0 if the update stream already paid this transaction out).
 * Rejects with `cancelled: true` when the user backs out, `pending: true` when
 * the purchase awaits approval (pearls arrive later via the listener), and
 * otherwise with `reason` set to StoreKit's own description of what went wrong.
 */
export async function purchase(id) {
  const pack = packById(id);
  if (!pack) throw new Error(`Unknown pearl pack: ${id}`);
  const { np } = await plugin();
  let tx;
  try {
    tx = await Promise.race([
      np.purchaseProduct({ productIdentifier: id, productType: 'inapp', quantity: 1 }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('The App Store did not answer in time')), PURCHASE_TIMEOUT_MS)),
    ]);
  } catch (err) {
    const reason = String(err?.message ?? err ?? '').trim();
    const low = reason.toLowerCase();
    const e = new Error(reason || 'purchase failed');
    if (low.includes('cancel')) e.cancelled = true;
    else if (low.includes('pending')) e.pending = true;
    else e.reason = reason;
    throw e;
  }
  if (!tx || tx.productIdentifier !== id) {
    const e = new Error('The App Store returned no transaction.'); e.reason = e.message; throw e;
  }
  return markGranted(tx.transactionId) ? pack.pearls : 0;
}
