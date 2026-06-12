# Reef Bloom — Sign-in & Cloud Sync

Optional Google sign-in that syncs the three save slots across devices via
Firebase (free Spark plan — no card required). The game is fully playable
signed out; until Firebase is configured, no sign-in UI appears at all and
the game behaves exactly as before.

## What it does

- **Sign in with Google** from the slot-picker screen ("Choose Your Reef").
- All three save slots sync to Firestore (`users/{uid}`, one doc per player).
- Conflict resolution is per-slot, newest-wins, using the `savedAt` timestamp
  stamped on every save. Erasing a slot writes a tombstone so the deletion
  propagates to other devices instead of being resurrected.
- Saves push automatically while playing (debounced 4s, flushed when the tab
  is hidden). Signing in on a new device pulls your reefs down before the
  slot cards render.
- Signed-out play never loads any Firebase code (the SDK is dynamically
  imported only when configured and used).

## Enable it (~5 minutes)

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
   → **Add project** (Analytics not needed).
2. **Build → Authentication → Get started** → enable the **Google** provider.
   Under Settings → Authorized domains, add `reefbloomgame.com`.
3. **Build → Firestore Database → Create database** (production mode), then
   in the **Rules** tab paste:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

4. **Project settings (gear) → Your apps → Web app (`</>`)** → register, copy
   the `firebaseConfig` object, and paste it into `src/firebase-config.js`
   replacing `null`.
5. Commit and push. The web config is public by design (security lives in the
   rules above), so committing it is safe.

## Notes

- **iOS app:** web popup auth doesn't work inside the Capacitor shell, so the
  sign-in row is hidden there for now. When wanted, add the
  `@capacitor-firebase/authentication` plugin for native Google sign-in.
- Each slot is stored as a JSON string field (`s0`–`s2`) because Firestore
  rejects nested arrays (the reef grid is one).
- Firestore free tier: 50k reads/20k writes per day — orders of magnitude
  above what the debounced pushes produce.
