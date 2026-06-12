import { awsConfig } from './aws-config.js';
import { isAuthAvailable, currentUser, onAuthChange, initAuth, getIdToken } from './auth.js';
import { SLOT_KEYS, onSlotWritten } from './save.js';

/**
 * cloudsave.js — syncs the three save slots to DynamoDB for signed-in players.
 *
 * Model: one item per player, keyed by their Cognito identity id, with
 * attributes s0/s1/s2 (each the slot's raw JSON string) + updatedAt. The
 * browser talks to DynamoDB directly using temporary credentials from the
 * Cognito Identity Pool; the IAM policy on the authenticated role restricts
 * every call to the caller's own key (dynamodb:LeadingKeys), so no server
 * is involved anywhere.
 *
 * Conflict resolution is per-slot newest-wins using the savedAt timestamp
 * save.js stamps on every write. Deletions are tombstones ({__deleted:true})
 * so an erase on one device propagates instead of being resurrected.
 *
 * Local play is the source of truth when signed out; nothing here runs.
 * The AWS SDK is dynamically imported only after a real sign-in.
 */

const PUSH_DEBOUNCE_MS = 4000;

let _client      = null;   // DynamoDBClient
let _identityId  = null;   // partition key — the player's identity-pool id
let _ddb         = null;   // module namespace (commands)
let _pushTimers  = [null, null, null];
let _pending     = [null, null, null];   // 'local' | tombstone string | null
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
    if (!user) { _client = null; _identityId = null; return; }
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

/** Pull the player's item and merge per-slot, newest savedAt wins. */
export async function pullAndMerge() {
  if (!currentUser()) return;
  await _ensureClient();

  const res = await _client.send(new _ddb.GetItemCommand({
    TableName: awsConfig.saveTable,
    Key: { pk: { S: _identityId } },
  }));
  const item = res.Item ?? {};

  let localChanged = false;
  const updates = {};

  for (let i = 0; i < 3; i++) {
    const key      = SLOT_KEYS[i];
    const localStr = _readLocal(key);
    const cloudStr = item[`s${i}`]?.S ?? null;

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

  if (Object.keys(updates).length > 0) await _writeSlots(updates);
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
  const pending = _pending[idx];
  _pending[idx] = null;
  if (!currentUser() || pending === null) return;

  try {
    await _ensureClient();
    const value = pending === 'local' ? _readLocal(SLOT_KEYS[idx]) : pending;
    if (value === null) return;   // slot vanished locally; tombstone path handles erases
    await _writeSlots({ [`s${idx}`]: value });
  } catch (e) {
    console.warn('[cloudsave] push failed', e);
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

function _flushAll() {
  for (let i = 0; i < 3; i++) {
    if (_pending[i] !== null) {
      clearTimeout(_pushTimers[i]);
      _pushSlot(i);
    }
  }
}

async function _ensureClient() {
  if (_client && _identityId) return;

  const idToken = await getIdToken();
  if (!idToken) throw new Error('not signed in');

  const [{ DynamoDBClient, GetItemCommand, UpdateItemCommand },
         { CognitoIdentityClient },
         { fromCognitoIdentityPool }] = await Promise.all([
    import('@aws-sdk/client-dynamodb'),
    import('@aws-sdk/client-cognito-identity'),
    import('@aws-sdk/credential-provider-cognito-identity'),
  ]);
  _ddb = { GetItemCommand, UpdateItemCommand };

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
