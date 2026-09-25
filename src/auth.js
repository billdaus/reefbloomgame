import { awsConfig } from './aws-config.js';

/**
 * auth.js — free Reef Bloom accounts on a Cognito User Pool, talked to
 * directly over its JSON API (no SDK, no redirect): sign up with email +
 * password, confirm with the emailed code, sign in, reset a forgotten
 * password, delete the account. The same code runs on the website, inside
 * the iOS app's WebView, and on the Home screen — anywhere fetch() works.
 *
 * Everything degrades gracefully: while aws-config.js exports null,
 * isAuthAvailable() is false, no account UI is offered and nothing here
 * runs. Tokens live in localStorage; cloudsave.js exchanges the id token
 * for temporary AWS credentials via the Cognito Identity Pool.
 */

const TOKEN_KEY = 'reef-bloom-auth';

let _user  = null;    // { email, sub }
let _ready = null;
const _listeners = new Set();

export function isAuthAvailable() {
  return !!awsConfig;
}

export function currentUser() {
  return _user;
}

/** Register a callback for auth state changes; fires immediately once known. */
export function onAuthChange(cb) {
  _listeners.add(cb);
  if (_ready) cb(_user);
  return () => _listeners.delete(cb);
}

/** Restore (and refresh) stored tokens. Safe no-op when unavailable. */
export async function initAuth() {
  if (!isAuthAvailable()) return null;
  if (_ready) return _ready;
  _ready = (async () => {
    try {
      const stored = _readTokens();
      if (stored?.refreshToken) {
        if (Date.now() < (stored.expiresAt ?? 0) - 60_000) _setUser(stored);
        else await _refresh(stored);
      }
    } catch (e) {
      console.warn('[auth] restore failed', e);
      _clear();
    }
    _emit();
    return _user;
  })();
  return _ready;
}

// ── Account actions ──────────────────────────────────────────────────────────
// Each rejects with an Error whose .code is Cognito's exception name
// (UserNotConfirmedException, NotAuthorizedException, UsernameExistsException,
// CodeMismatchException, InvalidPasswordException …) and whose .message is
// Cognito's own wording, so the sheet can say something useful.

/** Sign in with email + password. Resolves to the user. */
export async function signIn(email, password) {
  const r = await _idp('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: awsConfig.userPoolClientId,
    AuthParameters: { USERNAME: email.trim(), PASSWORD: password },
  });
  if (!r.AuthenticationResult) throw Object.assign(new Error('Sign-in needs another step.'), { code: r.ChallengeName ?? 'Challenge' });
  _storeAuth(r.AuthenticationResult, r.AuthenticationResult.RefreshToken);
  _emit();
  return _user;
}

/** Create an account. Resolves to true if a confirmation code was emailed. */
export async function signUp(email, password) {
  const r = await _idp('SignUp', {
    ClientId: awsConfig.userPoolClientId,
    Username: email.trim(),
    Password: password,
    UserAttributes: [{ Name: 'email', Value: email.trim() }],
  });
  return !r.UserConfirmed;
}

export async function confirmSignUp(email, code) {
  await _idp('ConfirmSignUp', {
    ClientId: awsConfig.userPoolClientId, Username: email.trim(), ConfirmationCode: code.trim(),
  });
}

export async function resendCode(email) {
  await _idp('ResendConfirmationCode', { ClientId: awsConfig.userPoolClientId, Username: email.trim() });
}

export async function forgotPassword(email) {
  await _idp('ForgotPassword', { ClientId: awsConfig.userPoolClientId, Username: email.trim() });
}

export async function confirmForgotPassword(email, code, newPassword) {
  await _idp('ConfirmForgotPassword', {
    ClientId: awsConfig.userPoolClientId, Username: email.trim(),
    ConfirmationCode: code.trim(), Password: newPassword,
  });
}

export async function signOutUser() {
  const t = _readTokens();
  _clear();
  _emit();
  if (t?.accessToken) {
    try { await _idp('GlobalSignOut', { AccessToken: t.accessToken }); } catch { /* already out */ }
  }
}

/** Permanently deletes the account (App Store rule 5.1.1(v)). Cloud saves go with it. */
export async function deleteAccount() {
  const token = await getAccessToken();
  if (!token) throw new Error('not signed in');
  await _idp('DeleteUser', { AccessToken: token });
  _clear();
  _emit();
}

export async function getIdToken() {
  const t = await _freshTokens();
  return t?.idToken ?? null;
}

export async function getAccessToken() {
  const t = await _freshTokens();
  return t?.accessToken ?? null;
}

// ── Internal ─────────────────────────────────────────────────────────────────

async function _idp(op, body) {
  const res = await fetch(`https://cognito-idp.${awsConfig.region}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': `AWSCognitoIdentityProviderService.${op}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!res.ok) {
    const code = String(data.__type ?? data.code ?? 'Error').split('#').pop();
    throw Object.assign(new Error(data.message ?? data.Message ?? `${op} failed (${res.status})`), { code });
  }
  return data;
}

async function _freshTokens() {
  const t = _readTokens();
  if (!t?.refreshToken) return null;
  if (Date.now() < (t.expiresAt ?? 0) - 60_000) return t;
  try { return await _refresh(t); } catch (e) { _clear(); _emit(); return null; }
}

async function _refresh(stored) {
  const r = await _idp('InitiateAuth', {
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: awsConfig.userPoolClientId,
    AuthParameters: { REFRESH_TOKEN: stored.refreshToken },
  });
  return _storeAuth(r.AuthenticationResult, stored.refreshToken);
}

function _storeAuth(result, refreshToken) {
  const t = {
    idToken:      result.IdToken,
    accessToken:  result.AccessToken,
    refreshToken: refreshToken,
    expiresAt:    Date.now() + (result.ExpiresIn ?? 3600) * 1000,
  };
  try { localStorage.setItem(TOKEN_KEY, JSON.stringify(t)); } catch { /* storage off */ }
  _setUser(t);
  return t;
}

function _setUser(t) {
  const claims = _decode(t.idToken);
  _user = claims ? { email: claims.email ?? null, sub: claims.sub ?? null } : null;
}

function _readTokens() {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY)); } catch { return null; }
}

function _clear() {
  _user = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

function _emit() {
  for (const cb of _listeners) { try { cb(_user); } catch (e) { console.warn('[auth] listener', e); } }
}

function _decode(jwt) {
  try {
    const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(atob(b64).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
  } catch { return null; }
}
