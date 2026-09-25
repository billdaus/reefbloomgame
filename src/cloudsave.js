import { awsConfig } from './aws-config.js';
import { isAuthAvailable, currentUser, onAuthChange, initAuth, getIdToken } from './auth.js';
import { SLOT_KEYS, onSlotWritten } from './save.js';

/**
 * cloudsave.js — syncs every save slot to DynamoDB for signed-in players:
 * Classic's three slots (s0–s2) and the 3D edition's three (t0–t2).
 *
 * Model: one item per player, keyed by their Cognito identity id, with one
 * attribute per slot (the slot's raw JSON string) + updatedAt. The client
 * talks to DynamoDB directly using temporary credentials from the Cognito
 * Identity Pool; the IAM policy on the authenticated role restricts every
 * call to the caller's own key (dynamodb:LeadingKeys), so no server is
 * involved anywhere.
 *
 * Conflict resolution is per-slot newest-wins on the savedAt timestamp every
 * writer stamps. Deletions are tombstones ({__deleted:true}) so an erase on
 * one device propagates instead of being resurrected. Signing in on a fresh
 * device pulls the reefs down; signing in with local reefs pushes them up —
 * that is the whole "migration": a local save simply becomes the account's.
 *
 * Local play is the source of truth when signed out; nothing here runs.
 * The AWS SDK is dynamically imported only after a real sign-in.
 */

const PUSH_DEBOUNCE_MS = 4000;
const SLOTS = [
  ...SLOT_KEYS.map((key, i) => ({ key, attr: `s${i}` })),
  ...[1, 2, 3].map(n => ({ key: `reefbloom_3d_save_v1_s${n}`, attr: `t${n - 1}` })),
];
const _slotOf = (key) => SLOTS.find(s => s.key === key) ?? null;

let _client      = null;   // DynamoDBClient
let _identityId  = null;   // partition key — the player's identity-pool id
let _ddb         = null;   // module namespace (commands)
const _pushTimers = new Map();   // attr -> timer
const _pending    = new Map();   // attr -> 'local' | tombstone string
let _onSynced    = null;   // UI callback after a pull changes local slots: (changedKeys) => void
let _lastSync    = 0;      // epoch ms of the last successful pull or push
let _status      = 'idle'; // 'idle' | 'syncing' | 'ok' | 'error'
let _lastError   = null;
const _statusListeners = new Set();

export function onCloudSynced(cb) { _onSynced = cb; }
/** Live sync status for UI: { status, lastSync, error }. */
export function cloudStatus() { return { status: _status, lastSync: _lastSync, error: _lastError }; }
export function onCloudStatus(cb) { _statusListeners.add(cb); cb(cloudStatus()); return () => _statusListeners.delete(cb); }
function _setStatus(status, error = null) {
  _status = status; _lastError = error;
  if (status === 'ok') _lastSync = Date.now();
  for (const cb of _statusListeners) { try { cb(cloudStatus()); } catch { /* ui */ } }
}

let _inited = false;
/** Wire up sync: pull-merge on sign-in, push-through on local writes. Idempotent. */
export function initCloudSave() {
  if (!isAuthAvailable() || _inited) return;
  _inited = true;

  onSlotWritten((idx, { deleted } = {}) => {
    if (!currentUser()) return;
    schedulePush(SLOT_KEYS[idx], deleted);
  });

  onAuthChange(async user => {
    if (!user) { _client = null; _identityId = null; _setStatus('idle'); return; }
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

/**
 * The 3D edition (and anything else that writes localStorage directly) calls
 * this after writing a slot. `deleted` marks an erase.
 */
export function cloudMarkWritten(key, deleted = false) {
  if (!currentUser() || !_slotOf(key)) return;
  schedulePush(key, deleted);
}

/** Pull the player's item and merge per-slot, newest savedAt wins. */
export async function pullAndMerge() {
  if (!currentUser()) return;
  _setStatus('syncing');
  try {
    await _ensureClient();
    const res = await _client.send(new _ddb.GetItemCommand({
      TableName: awsConfig.saveTable,
      Key: { pk: { S: _identityId } },
    }));
    const item = res.Item ?? {};

    const changed = [];
    const updates = {};
    for (const { key, attr } of SLOTS) {
      const localStr = _readLocal(key);
      const cloudStr = item[attr]?.S ?? null;
      const localObj = _parse(localStr);
      const cloudObj = _parse(cloudStr);
      // Legacy saves predate savedAt — present-but-unstamped sorts above absent
      const localTs = localObj ? (localObj.savedAt ?? 1) : 0;
      const cloudTs = cloudObj ? (cloudObj.savedAt ?? 1) : 0;
      if (!localObj && !cloudObj) continue;
      if (cloudTs > localTs) {
        if (cloudObj.__deleted) {
          if (localStr) { localStorage.removeItem(key); changed.push(key); }
        } else {
          localStorage.setItem(key, cloudStr);
          changed.push(key);
        }
      } else if (localTs > cloudTs) {
        updates[attr] = localStr;
      }
    }
    if (Object.keys(updates).length > 0) await _writeSlots(updates);
    _setStatus('ok');
    if (changed.length) _onSynced?.(changed);
  } catch (e) {
    _client = null;   // credentials may have aged out with the id token; rebuild next time
    _setStatus('error', e);
    throw e;
  }
}

/** Removes the player's cloud item entirely — used right before the account itself is deleted. */
export async function deleteCloudSaves() {
  if (!currentUser()) return;
  await _ensureClient();
  await _client.send(new _ddb.DeleteItemCommand({ TableName: awsConfig.saveTable, Key: { pk: { S: _identityId } } }));
}

/** Push everything that is pending right now, then pull. For a "Sync now" button. */
export async function syncNow() {
  await _flushAll();
  await pullAndMerge();
}

/** Debounced push of one slot (or its tombstone) to the cloud. */
export function schedulePush(key, deleted = false) {
  const slot = _slotOf(key);
  if (!slot) return;
  _pending.set(slot.attr, deleted ? JSON.stringify({ __deleted: true, savedAt: Date.now() }) : 'local');
  clearTimeout(_pushTimers.get(slot.attr));
  _pushTimers.set(slot.attr, setTimeout(() => _pushSlot(slot), PUSH_DEBOUNCE_MS));
}

// ── Internal ─────────────────────────────────────────────────────────────────

async function _pushSlot(slot) {
  const pending = _pending.get(slot.attr);
  _pending.delete(slot.attr);
  if (!currentUser() || pending == null) return;
  try {
    await _ensureClient();
    const value = pending === 'local' ? _readLocal(slot.key) : pending;
    if (value === null) return;   // slot vanished locally; tombstone path handles erases
    await _writeSlots({ [slot.attr]: value });
    _setStatus('ok');
  } catch (e) {
    console.warn('[cloudsave] push failed', e);
    _client = null;
    _setStatus('error', e);
  }
}

async function _writeSlots(slotMap) {
  const names  = {};
  const values = { ':t': { N: String(Date.now()) } };
  const sets   = ['updatedAt = :t'];
  Object.entries(slotMap).forEach(([field, str], n) => {
    names[`#f${n}`]  = field;
    values[`:v${n}`] = { S: str };
    sets.push(`#f${n} = :v${n}`);
  });
  await _client.send(new _ddb.UpdateItemCommand({
    TableName:                 awsConfig.saveTable,
    Key:                       { pk: { S: _identityId } },
    UpdateExpression:          `SET ${sets.join(', ')}`,
    ExpressionAttributeNames:  names,
    ExpressionAttributeValues: values,
  }));
}

async function _flushAll() {
  const jobs = [];
  for (const slot of SLOTS) {
    if (_pending.has(slot.attr)) {
      clearTimeout(_pushTimers.get(slot.attr));
      jobs.push(_pushSlot(slot));
    }
  }
  await Promise.all(jobs);
}

async function _ensureClient() {
  if (_client && _identityId) return;

  const idToken = await getIdToken();
  if (!idToken) throw new Error('not signed in');

  const [{ DynamoDBClient, GetItemCommand, UpdateItemCommand, DeleteItemCommand },
         { CognitoIdentityClient },
         { fromCognitoIdentityPool }] = await Promise.all([
    import('@aws-sdk/client-dynamodb'),
    import('@aws-sdk/client-cognito-identity'),
    import('@aws-sdk/credential-provider-cognito-identity'),
  ]);
  _ddb = { GetItemCommand, UpdateItemCommand, DeleteItemCommand };

  const credentialProvider = fromCognitoIdentityPool({
    client:         new CognitoIdentityClient({ region: awsConfig.region }),
    identityPoolId: awsConfig.identityPoolId,
    logins: {
      [`cognito-idp.${awsConfig.region}.amazonaws.com/${awsConfig.userPoolId}`]: idToken,
    },
  });

  // Resolve once up front — the resolved credentials carry the identityId,
  // which is the partition key the IAM policy scopes this player to.
  const creds = await credentialProvider();
  _identityId = creds.identityId;
  _client = new DynamoDBClient({ region: awsConfig.region, credentials: credentialProvider });
}

function _readLocal(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function _parse(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}
