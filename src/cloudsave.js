import { isAuthAvailable, currentUser, onAuthChange, initAuth, _getApp } from './auth.js';
import { SLOT_KEYS, onSlotWritten } from './save.js';

/**
 * cloudsave.js — syncs the three save slots to Firestore for signed-in players.
 *
 * Model: one document per user (users/{uid}) with fields s0/s1/s2, each the
 * slot's raw JSON string (strings sidestep Firestore's nested-array limit).
 * Conflict resolution is per-slot newest-wins using the savedAt timestamp
 * save.js stamps on every write. Deletions are tombstones ({__deleted:true})
 * so an erase on one device propagates instead of being resurrected.
 *
 * Local play is the source of truth when signed out; nothing here runs.
 */

const PUSH_DEBOUNCE_MS = 4000;

let _db          = null;
let _fs          = null;   // firestore module fns
let _pushTimers  = [null, null, null];
let _pending     = [null, null, null];   // value to push: string | 'tombstone'
let _onSynced    = null;   // UI callback after a pull changes local slots

export function onCloudSynced(cb) {
  _onSynced = cb;
}

/** Wire up sync: pull-merge on sign-in, push-through on local writes. */
export function initCloudSave() {
  if (!isAuthAvailable()) return;

  onSlotWritten((idx, { deleted } = {}) => {
    if (!currentUser()) return;
    schedulePush(idx, deleted);
  });

  onAuthChange(async user => {
    if (!user) return;
    try {
      await pullAndMerge();
    } catch (e) {
      console.warn('[cloudsave] sync failed', e);
    }
  });

  // Flush pending pushes when the tab is backgrounded/closed
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') _flushAll();
  });

  initAuth();
}

/** Pull the cloud doc and merge per-slot, newest savedAt wins. */
export async function pullAndMerge() {
  const user = currentUser();
  if (!user) return;
  await _ensureDb();

  const ref  = _fs.doc(_db, 'users', user.uid);
  const snap = await _fs.getDoc(ref);
  const data = snap.exists() ? snap.data() : {};

  let localChanged = false;
  const updates = {};

  for (let i = 0; i < 3; i++) {
    const key      = SLOT_KEYS[i];
    const localStr = _readLocal(key);
    const cloudStr = data[`s${i}`] ?? null;

    const localObj = _parse(localStr);
    const cloudObj = _parse(cloudStr);
    // Legacy saves predate savedAt — present-but-unstamped sorts above absent
    const localTs = localObj ? (localObj.savedAt ?? 1) : 0;
    const cloudTs = cloudObj ? (cloudObj.savedAt ?? 1) : 0;

    if (!localObj && !cloudObj) continue;

    if (cloudTs > localTs) {
      if (cloudObj.__deleted) {
        if (localStr) { localStorage.removeItem(key); localChanged = true; }
      } else {
        localStorage.setItem(key, cloudStr);
        localChanged = true;
      }
    } else if (localTs > cloudTs) {
      updates[`s${i}`] = localStr;
    }
    // equal timestamps: already in agreement
  }

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = _fs.serverTimestamp();
    await _fs.setDoc(ref, updates, { merge: true });
  }
  if (localChanged) _onSynced?.();
}

/** Debounced push of one slot (or its tombstone) to the cloud. */
export function schedulePush(idx, deleted = false) {
  _pending[idx] = deleted
    ? JSON.stringify({ __deleted: true, savedAt: Date.now() })
    : 'local';
  clearTimeout(_pushTimers[idx]);
  _pushTimers[idx] = setTimeout(() => _pushSlot(idx), PUSH_DEBOUNCE_MS);
}

// ── Internal ─────────────────────────────────────────────────────────────────

async function _pushSlot(idx) {
  const user = currentUser();
  const pending = _pending[idx];
  _pending[idx] = null;
  if (!user || pending === null) return;

  try {
    await _ensureDb();
    const value = pending === 'local' ? _readLocal(SLOT_KEYS[idx]) : pending;
    if (value === null) return;   // slot vanished locally; tombstone path handles erases
    const ref = _fs.doc(_db, 'users', user.uid);
    await _fs.setDoc(ref, { [`s${idx}`]: value, updatedAt: _fs.serverTimestamp() }, { merge: true });
  } catch (e) {
    console.warn('[cloudsave] push failed', e);
  }
}

function _flushAll() {
  for (let i = 0; i < 3; i++) {
    if (_pending[i] !== null) {
      clearTimeout(_pushTimers[i]);
      _pushSlot(i);
    }
  }
}

async function _ensureDb() {
  if (_db) return;
  await initAuth();
  const fs = await import('firebase/firestore');
  _fs = fs;
  _db = fs.getFirestore(_getApp());
}

function _readLocal(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function _parse(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}
