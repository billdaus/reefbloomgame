import {
  isAuthAvailable, currentUser, onAuthChange, signIn, signUp, confirmSignUp, resendCode,
  forgotPassword, confirmForgotPassword, signOutUser, deleteAccount,
} from './auth.js';
import { initCloudSave, syncNow, onCloudStatus, deleteCloudSaves } from './cloudsave.js';

/**
 * accountSheet.js — the one Reef Bloom account panel, shared by the website
 * (Classic), the 3D reef and the app's Home screen. Free accounts: sign in
 * or create one with an email and password, confirm with the emailed code,
 * reset a forgotten password; signed in, see sync status, sync now, sign
 * out, or delete the account (and its cloud saves) for good.
 *
 * Self-contained: builds its own DOM and injects its own CSS on first open.
 * openAccountSheet() is all a page needs; it is a no-op while accounts are
 * not configured (aws-config.js null).
 */

const CSS = `
#acct-sheet { position: fixed; inset: 0; z-index: 400; display: none; align-items: center; justify-content: center;
  background: rgba(2,12,20,0.7); font-family: system-ui, -apple-system, sans-serif; }
#acct-sheet.open { display: flex; }
#acct-sheet .ac-panel { width: min(400px, 92vw); max-height: 90vh; overflow-y: auto; background: #0d3550; color: #eaf6ff;
  border: 1px solid #2f6f92; border-radius: 16px; padding: 20px 22px 16px; box-shadow: 0 12px 40px rgba(0,0,0,0.5); }
#acct-sheet h2 { margin: 0 0 4px; font-size: 18px; }
#acct-sheet .ac-sub { font-size: 12px; color: #9fc4dc; margin: 0 0 14px; line-height: 1.4; }
#acct-sheet label { display: block; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: #7fb8d4; margin: 10px 0 4px; }
#acct-sheet input { width: 100%; box-sizing: border-box; font: inherit; font-size: 15px; color: #eaf6ff; background: rgba(0,0,0,0.35);
  border: 1px solid #2f6f92; border-radius: 9px; padding: 9px 11px; }
#acct-sheet input:focus { outline: none; border-color: #7fd8ff; }
#acct-sheet .ac-row { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
#acct-sheet button { font: inherit; font-size: 13px; cursor: pointer; border-radius: 9px; padding: 9px 14px; border: 1px solid transparent;
  -webkit-tap-highlight-color: transparent; }
#acct-sheet .ac-primary { background: #ffe9b0; color: #0a2438; font-weight: 700; flex: 1 1 auto; }
#acct-sheet .ac-secondary { background: rgba(0,0,0,0.35); color: #cfe6f4; border-color: rgba(127,216,255,0.3); flex: 1 1 auto; }
#acct-sheet .ac-link { background: none; color: #7fd8ff; padding: 6px 4px; text-decoration: underline; }
#acct-sheet .ac-danger { background: none; color: #ff8a80; border-color: rgba(255,138,128,0.4); }
#acct-sheet button:disabled { opacity: 0.5; cursor: default; }
#acct-sheet .ac-msg { min-height: 18px; font-size: 12.5px; margin-top: 10px; color: #9fc4dc; line-height: 1.4; }
#acct-sheet .ac-msg.err { color: #ff8a80; }
#acct-sheet .ac-msg.ok { color: #7fd8b0; }
#acct-sheet .ac-status { display: flex; align-items: center; gap: 8px; font-size: 13px; background: rgba(0,0,0,0.3);
  border-radius: 10px; padding: 10px 12px; margin: 6px 0 4px; }
#acct-sheet .ac-close { width: 100%; margin-top: 8px; background: none; color: #9fc4dc; font-size: 12px; }
`;

let sheet = null, view = 'signin', busy = false, pendingEmail = '';
let onSignedInHook = null;
let els = {};

/** Optional: called after a successful sign-in / sync (the 3D reef reloads if its slot changed). */
export function onAccountSignedIn(cb) { onSignedInHook = cb; }

export function accountsEnabled() { return isAuthAvailable(); }

export function openAccountSheet(startView) {
  if (!isAuthAvailable()) return;
  build();
  initCloudSave();
  view = startView ?? (currentUser() ? 'account' : 'signin');
  render();
  sheet.classList.add('open');
}

export function closeAccountSheet() { sheet?.classList.remove('open'); }

function build() {
  if (sheet) return;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  sheet = document.createElement('div'); sheet.id = 'acct-sheet';
  sheet.innerHTML = '<div class="ac-panel"></div>';
  sheet.onclick = (e) => { if (e.target === sheet) closeAccountSheet(); };
  document.body.appendChild(sheet);
  onAuthChange(() => { if (sheet.classList.contains('open')) { view = currentUser() ? 'account' : (view === 'account' ? 'signin' : view); render(); } });
  onCloudStatus(() => { if (view === 'account' && sheet.classList.contains('open')) renderStatus(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAccountSheet(); });
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const field = (id, label, type, placeholder, value = '') =>
  `<label for="ac-${id}">${label}</label><input id="ac-${id}" type="${type}" placeholder="${placeholder}" value="${esc(value)}" autocomplete="${type === 'password' ? 'current-password' : type === 'email' ? 'email' : 'one-time-code'}" autocapitalize="none" autocorrect="off">`;

function render() {
  const p = sheet.querySelector('.ac-panel');
  const user = currentUser();
  let html = '';
  if (view === 'account' && user) {
    html = `<h2>👤 Your account</h2><p class="ac-sub">${esc(user.email)}</p>
      <div class="ac-status" id="ac-status"></div>
      <p class="ac-sub">All six reef slots — Classic and 3D — sync to this account. Newest save wins on each slot; sign in on another device and your reefs come with you.</p>
      <div class="ac-row"><button class="ac-secondary" id="ac-sync">Sync now</button><button class="ac-secondary" id="ac-signout">Sign out</button></div>
      <div class="ac-row"><button class="ac-danger" id="ac-delete">Delete account…</button></div>
      <div class="ac-msg" id="ac-msg"></div>`;
  } else if (view === 'delete') {
    html = `<h2>Delete your account?</h2><p class="ac-sub">This removes your Reef Bloom account and the reefs saved to it in the cloud. Reefs already on this device stay on this device. There is no undo.</p>
      ${field('pw', 'Confirm with your password', 'password', '')}
      <div class="ac-row"><button class="ac-danger" id="ac-delete-go">Delete for good</button><button class="ac-secondary" id="ac-back">Keep it</button></div>
      <div class="ac-msg" id="ac-msg"></div>`;
  } else if (view === 'confirm') {
    html = `<h2>Check your email</h2><p class="ac-sub">We sent a 6-digit code to <b>${esc(pendingEmail)}</b>. Enter it to finish creating your account.</p>
      ${field('code', 'Confirmation code', 'text', '123456')}
      <div class="ac-row"><button class="ac-primary" id="ac-confirm">Confirm</button></div>
      <div class="ac-row"><button class="ac-link" id="ac-resend">Send the code again</button><button class="ac-link" id="ac-back">Back</button></div>
      <div class="ac-msg" id="ac-msg"></div>`;
  } else if (view === 'forgot') {
    html = `<h2>Reset your password</h2><p class="ac-sub">Enter your email and we'll send a reset code.</p>
      ${field('email', 'Email', 'email', 'you@example.com', pendingEmail)}
      <div class="ac-row"><button class="ac-primary" id="ac-forgot">Send code</button><button class="ac-secondary" id="ac-back">Back</button></div>
      <div class="ac-msg" id="ac-msg"></div>`;
  } else if (view === 'reset') {
    html = `<h2>Choose a new password</h2><p class="ac-sub">The code went to <b>${esc(pendingEmail)}</b>.</p>
      ${field('code', 'Reset code', 'text', '123456')}${field('pw', 'New password (8+ characters)', 'password', '')}
      <div class="ac-row"><button class="ac-primary" id="ac-reset">Set password</button><button class="ac-secondary" id="ac-back">Back</button></div>
      <div class="ac-msg" id="ac-msg"></div>`;
  } else {
    html = `<h2>☁️ Reef Bloom account</h2><p class="ac-sub">Free. Keeps your reefs in the cloud and brings them to any device — the website, iPhone and iPad.</p>
      ${field('email', 'Email', 'email', 'you@example.com', pendingEmail)}${field('pw', 'Password', 'password', '')}
      <div class="ac-row"><button class="ac-primary" id="ac-signin">Sign in</button><button class="ac-secondary" id="ac-signup">Create account</button></div>
      <div class="ac-row"><button class="ac-link" id="ac-forgot-link">Forgot your password?</button></div>
      <div class="ac-msg" id="ac-msg"></div>`;
  }
  p.innerHTML = html + '<button class="ac-close" id="ac-close">Close</button>';
  els = Object.fromEntries([...p.querySelectorAll('[id]')].map(e => [e.id.replace('ac-', ''), e]));
  wire();
  if (view === 'account') renderStatus();
  p.querySelector('input')?.focus();
}

function renderStatus() {
  const st = els.status; if (!st) return;
  // pulled lazily so this module never imports the SDK
  import('./cloudsave.js').then(({ cloudStatus }) => {
    const { status, lastSync, error } = cloudStatus();
    const when = lastSync ? new Date(lastSync).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
    st.innerHTML = status === 'syncing' ? '⏳ Syncing…'
      : status === 'ok' ? `✅ Synced${when ? ` · ${when}` : ''}`
      : status === 'error' ? `⚠️ Sync problem${error?.message ? ` — ${esc(error.message).slice(0, 80)}` : ''}`
      : '☁️ Ready to sync';
  });
}

function msg(text, kind = '') { if (els.msg) { els.msg.textContent = text; els.msg.className = 'ac-msg ' + kind; } }
function setBusy(b) { busy = b; sheet.querySelectorAll('button').forEach(x => { if (x.id !== 'ac-close') x.disabled = b; }); }
const val = (k) => els[k]?.value ?? '';
async function run(fn, okText) {
  if (busy) return;
  setBusy(true); msg('…');
  try { const r = await fn(); if (okText) msg(okText, 'ok'); return r; }
  catch (e) { msg(friendly(e), 'err'); }
  finally { setBusy(false); }
}
function friendly(e) {
  const c = e?.code ?? '';
  if (c === 'UserNotConfirmedException') return 'That account isn\'t confirmed yet — check your email for the code.';
  if (c === 'NotAuthorizedException') return 'Wrong email or password.';
  if (c === 'UserNotFoundException') return 'No account with that email. Create one?';
  if (c === 'UsernameExistsException') return 'There\'s already an account with that email — sign in instead.';
  if (c === 'InvalidPasswordException') return 'Passwords need at least 8 characters.';
  if (c === 'CodeMismatchException') return 'That code didn\'t match. Check the email and try again.';
  if (c === 'ExpiredCodeException') return 'That code has expired — send a new one.';
  if (c === 'LimitExceededException' || c === 'TooManyRequestsException') return 'Too many tries — wait a minute and try again.';
  if (c === 'InvalidParameterException') return e.message.replace(/^.*?: /, '');
  if (e?.message === 'Failed to fetch') return 'No connection. Try again when you\'re online.';
  return e?.message ?? 'Something went wrong.';
}

function wire() {
  els.close.onclick = closeAccountSheet;
  els.back && (els.back.onclick = () => { view = currentUser() ? 'account' : 'signin'; render(); });
  if (els.signin) {
    const go = () => run(async () => {
      const email = val('email'), pw = val('pw');
      if (!email || !pw) throw new Error('Enter your email and password.');
      pendingEmail = email;
      try { await signIn(email, pw); }
      catch (e) { if (e.code === 'UserNotConfirmedException') { view = 'confirm'; render(); msg('Enter the code we emailed you to finish signing up.'); return; } throw e; }
      view = 'account'; render(); onSignedInHook?.();
    });
    els.signin.onclick = go;
    els.pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    els.signup.onclick = () => run(async () => {
      const email = val('email'), pw = val('pw');
      if (!email || !pw) throw new Error('Enter an email and choose a password (8+ characters).');
      pendingEmail = email;
      const needsCode = await signUp(email, pw);
      if (needsCode) { view = 'confirm'; render(); msg('Code sent. Check your inbox (and spam).'); }
      else { await signIn(email, pw); view = 'account'; render(); onSignedInHook?.(); }
    });
    els['forgot-link'].onclick = () => { pendingEmail = val('email'); view = 'forgot'; render(); };
  }
  els.confirm && (els.confirm.onclick = () => run(async () => {
    await confirmSignUp(pendingEmail, val('code'));
    view = 'signin'; render(); msg('Confirmed! Sign in to start syncing.', 'ok');
  }));
  els.resend && (els.resend.onclick = () => run(() => resendCode(pendingEmail), 'A new code is on its way.'));
  els.forgot && (els.forgot.onclick = () => run(async () => {
    pendingEmail = val('email');
    if (!pendingEmail) throw new Error('Enter your email.');
    await forgotPassword(pendingEmail);
    view = 'reset'; render(); msg('Code sent. Check your inbox.');
  }));
  els.reset && (els.reset.onclick = () => run(async () => {
    await confirmForgotPassword(pendingEmail, val('code'), val('pw'));
    view = 'signin'; render(); msg('Password changed. Sign in with the new one.', 'ok');
  }));
  els.sync && (els.sync.onclick = () => run(async () => { await syncNow(); onSignedInHook?.(); }, 'Synced.'));
  els.signout && (els.signout.onclick = () => run(async () => { await signOutUser(); view = 'signin'; render(); msg('Signed out. Your reefs stay on this device.'); }));
  els.delete && (els.delete.onclick = () => { view = 'delete'; render(); });
  els['delete-go'] && (els['delete-go'].onclick = () => run(async () => {
    const email = currentUser()?.email;
    await signIn(email, val('pw'));   // re-authenticate before anything irreversible
    try { await deleteCloudSaves(); } catch (e) { console.warn('[account] cloud item', e); }
    await deleteAccount();
    view = 'signin'; render(); msg('Your account is deleted. The reefs on this device are still here.', 'ok');
  }));
}
