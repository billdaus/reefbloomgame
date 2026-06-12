/**
 * Firebase web config — paste yours here to enable sign-in and cloud sync.
 *
 * Setup (free, ~5 minutes — full walkthrough in SIGNIN.md):
 *   1. console.firebase.google.com → Add project (no Analytics needed)
 *   2. Build → Authentication → Get started → enable the Google provider
 *   3. Build → Firestore Database → Create (production mode) → paste the
 *      security rules from SIGNIN.md
 *   4. Project settings → Your apps → Web app → copy the firebaseConfig
 *      object and replace `null` below
 *
 * This object is safe to commit — Firebase web config is public by design;
 * access control lives in the Firestore security rules.
 *
 * While this is null, the game runs exactly as before: fully local,
 * no sign-in UI shown.
 */
export const firebaseConfig = null;
