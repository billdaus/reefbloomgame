import { awsConfig } from './aws-config.js';

/**
 * auth.js — optional sign-in via the Cognito Hosted UI (email/password,
 * sign-up and verification included), using the OAuth2 authorization-code
 * flow with PKCE. No SDK is needed for auth itself — it's two fetches.
 *
 * Everything degrades gracefully: if aws-config.js exports null (or we're
 * inside the Capacitor native shell, where redirect auth needs native
 * plumbing), isAuthAvailable() is false and nothing here runs.
 *
 * Tokens live in localStorage; cloudsave.js exchanges the id token for
 * temporary AWS credentials via the Cognito Identity Pool.
 */

const TOKEN_KEY = 'reef-bloom-auth';
const PKCE_KEY  = 'reef-bloom-pkce';

const _isNativeShell = typeof window !== 'undefined' && !!window.Capacitor;

let _user  = null;    // { email, sub }
let _ready = null;
const _listeners = new Set();

export function isAuthAvailable() {
  return !!awsConfig && !_isNativeShell;
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

/**
 * Initialize auth: complete a Hosted-UI redirect if one is in flight,
 * otherwise restore (and refresh) stored tokens. Safe no-op when unavailable.
 */
export async function initAuth() {
  if (!isAuthAvailable()) return null;
  if (_ready) return _ready;

  _ready = (async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code   = params.get('code');
      const pkce   = _readJson(sessionStorage, PKCE_KEY);

      if (code && pkce?.verifier) {
        sessionStorage.removeItem(PKCE_KEY);
        const tokens = await _tokenRequest({
          grant_type:    'authorization_code',
          code,
          redirect_uri:  pkce.redirectUri,
          code_verifier: pkce.verifier,
        });
        _storeTokens(tokens);
        // Strip ?code=... from the address bar
        const url = new URL(window.location.href);
        url.searchParams.delete('code');
        url.searchParams.delete('state');
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      }

      await _loadStoredUser();
    } catch (e) {
      console.warn('[auth] init failed', e);
      _user = null;
    }
    _listeners.forEach(cb => cb(_user));
    return _user;
  })();

  return _ready;
}

/** Redirect to the Cognito Hosted UI sign-in page (PKCE). */
export async function signIn() {
  if (!isAuthAvailable()) throw new Error('auth unavailable');

  const verifier  = _randomString(64);
  const challenge = _base64url(await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(verifier)));
  const redirectUri = window.location.origin + window.location.pathname;

  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, redirectUri }));

  const q = new URLSearchParams({
    client_id:             awsConfig.userPoolClientId,
    response_type:         'code',
    scope:                 'openid email',
    redirect_uri:          redirectUri,
    code_challenge_method: 'S256',
    code_challenge:        challenge,
  });
  window.location.assign(`${awsConfig.cognitoDomain}/oauth2/authorize?${q}`);
}

/** Clear local tokens and end the Hosted UI session. */
export async function signOutUser() {
  localStorage.removeItem(TOKEN_KEY);
  _user = null;
  _listeners.forEach(cb => cb(null));
  const q = new URLSearchParams({
    client_id:  awsConfig.userPoolClientId,
    logout_uri: window.location.origin + window.location.pathname,
  });
  window.location.assign(`${awsConfig.cognitoDomain}/logout?${q}`);
}

/** Valid id token for the identity-pool exchange (refreshes if expired). */
export async function getIdToken() {
  const stored = _readJson(localStorage, TOKEN_KEY);
  if (!stored) return null;
  if (Date.now() < stored.expiresAt - 60_000) return stored.idToken;
  return _refresh(stored);
}

// ── Internal ─────────────────────────────────────────────────────────────────

async function _loadStoredUser() {
  const idToken = await getIdToken();
  if (!idToken) { _user = null; return; }
  const claims = _decodeJwt(idToken);
  _user = claims ? { email: claims.email, sub: claims.sub } : null;
}

async function _refresh(stored) {
  if (!stored.refreshToken) { localStorage.removeItem(TOKEN_KEY); return null; }
  try {
    const tokens = await _tokenRequest({
      grant_type:    'refresh_token',
      refresh_token: stored.refreshToken,
    });
    tokens.refresh_token ??= stored.refreshToken;  // not re-issued on refresh
    _storeTokens(tokens);
    return tokens.id_token;
  } catch (e) {
    console.warn('[auth] refresh failed', e);
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

async function _tokenRequest(params) {
  const res = await fetch(`${awsConfig.cognitoDomain}/oauth2/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: awsConfig.userPoolClientId, ...params }),
  });
  if (!res.ok) throw new Error(`token endpoint ${res.status}`);
  return res.json();
}

function _storeTokens(t) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify({
    idToken:      t.id_token,
    refreshToken: t.refresh_token ?? null,
    expiresAt:    Date.now() + (t.expires_in ?? 3600) * 1000,
  }));
}

function _decodeJwt(jwt) {
  try {
    const payload = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

function _readJson(store, key) {
  try { return JSON.parse(store.getItem(key)); } catch { return null; }
}

function _randomString(bytes) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return _base64url(buf);
}

function _base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
