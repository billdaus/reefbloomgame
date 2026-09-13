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

let pluginPromise = null;
function plugin() {
  if (!pluginPromise) {
    pluginPromise = import('@capgo/native-purchases').then(m => m.NativePurchases);
  }
  return pluginPromise;
}

let productsPromise = null;

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
      .then(np => np.getProducts({ productIdentifiers: PEARL_PACKS.map(p => p.id), productType: 'inapp' }))
      .then(({ products }) => {
        const byId = new Map(products.map(p => [p.identifier, p]));
        return PEARL_PACKS
          .filter(p => byId.has(p.id))
          .map(p => {
            const sp = byId.get(p.id);
            return { id: p.id, pearls: p.pearls, title: sp.title, priceString: sp.priceString };
          });
      })
      .catch(err => { productsPromise = null; throw err; });   // retry on next open
  }
  return productsPromise;
}

/**
 * Runs the StoreKit purchase sheet for one pack. Resolves to the number of
 * pearls to grant once the transaction is verified and finished by the plugin.
 * Rejects with `{ cancelled: true }` when the user backs out of the sheet.
 */
export async function purchase(id) {
  const pack = packById(id);
  if (!pack) throw new Error(`Unknown pearl pack: ${id}`);
  const np = await plugin();
  let tx;
  try {
    tx = await np.purchaseProduct({ productIdentifier: id, productType: 'inapp', quantity: 1 });
  } catch (err) {
    const msg = String(err?.message ?? err).toLowerCase();
    if (msg.includes('cancel')) { const e = new Error('cancelled'); e.cancelled = true; throw e; }
    throw err;
  }
  if (!tx || tx.productIdentifier !== id) throw new Error('Purchase did not complete');
  return pack.pearls;
}
