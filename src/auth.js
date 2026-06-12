import { firebaseConfig } from './firebase-config.js';

/**
 * auth.js — optional Google sign-in via Firebase.
 *
 * Everything here degrades gracefully: if firebase-config.js exports null
 * (or we're inside the Capacitor native shell, where web popup auth doesn't
 * work), isAuthAvailable() is false and no Firebase code is ever loaded.
 * The Firebase SDK is imported dynamically so signed-out local play never
 * pays its bundle cost.
 */

const _isNativeShell = typeof window !== 'undefined' && !!window.Capacitor;

let _app   = null;
let _auth  = null;
let _user  = null;
let _ready = null;           // promise resolved after first auth state event
const _listeners = new Set();

export function isAuthAvailable() {
  return !!firebaseConfig && !_isNativeShell;
}

export function currentUser() {
  return _user;
}

/** Register a callback for auth state changes; fires immediately if known. */
export function onAuthChange(cb) {
  _listeners.add(cb);
  if (_ready) cb(_user);
  return () => _listeners.delete(cb);
}

/**
 * Initialize Firebase auth (no-op when unavailable).
 * Resolves with the current user (or null) once the initial state is known.
 */
export async function initAuth() {
  if (!isAuthAvailable()) return null;
  if (_ready) return _ready;

  _ready = (async () => {
    const { initializeApp } = await import('firebase/app');
    const { getAuth, onAuthStateChanged, getRedirectResult } =
      await import('firebase/auth');

    _app  = initializeApp(firebaseConfig);
    _auth = getAuth(_app);

    // Complete a redirect-based sign-in if one is in flight
    try { await getRedirectResult(_auth); } catch { /* surfaced via state */ }

    await new Promise(resolve => {
      const unsub = onAuthStateChanged(_auth, user => {
        _user = user;
        _listeners.forEach(cb => cb(user));
        unsub();
        resolve();
      });
    });

    // Keep listening for later changes (sign-out, token refresh)
    const { onAuthStateChanged: onChange } = await import('firebase/auth');
    onChange(_auth, user => {
      _user = user;
      _listeners.forEach(cb => cb(user));
    });

    return _user;
  })();

  return _ready;
}

/** Sign in with Google — popup first, redirect fallback if blocked. */
export async function signIn() {
  if (!isAuthAvailable()) throw new Error('auth unavailable');
  await initAuth();
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } =
    await import('firebase/auth');
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(_auth, provider);
    return result.user;
  } catch (e) {
    if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/popup-closed-by-user') {
      if (e.code === 'auth/popup-blocked') {
        await signInWithRedirect(_auth, provider);
        return null; // page will reload via redirect
      }
      return null;   // user dismissed — not an error
    }
    throw e;
  }
}

export async function signOutUser() {
  if (!_auth) return;
  const { signOut } = await import('firebase/auth');
  await signOut(_auth);
}

/** Internal — used by cloudsave.js to share the app instance. */
export function _getApp() {
  return _app;
}
