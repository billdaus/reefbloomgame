import { Container } from 'pixi.js';
import { state } from '../state.js';
import { saveGame, defaultProfile } from '../save.js';

const AVATAR_CHOICES = [
  '🪸', '🐠', '🐟', '🐡', '🦀', '🦐', '🐙', '🦑',
  '🐢', '🪼', '🦈', '🐳', '🐬', '🌊', '🐚', '⭐',
];

const NAME_MAX = 24;

let _stylesInjected = false;

/**
 * AccountModal — local profile editor for the active save slot.
 * Reads/writes state.profile and persists via saveGame().
 *
 * Implemented as a DOM overlay because text input is awkward in PixiJS.
 * Keeps the same `.container / .show() / .hide()` shape so ReefScene can
 * still attach an empty PixiJS Container without changes.
 */
export class AccountModal {
  /** @param {function} [onSave] Called after the player saves the profile. */
  constructor(onSave) {
    this.container = new Container();
    this.container.visible = false;
    this._onSave = onSave;

    _injectStyles();
    this._buildDOM();
  }

  show() {
    if (!state.profile) state.profile = defaultProfile();
    this._populate();
    this._root.classList.add('open');
  }

  hide() {
    this._root.classList.remove('open');
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  _buildDOM() {
    const root = document.createElement('div');
    root.className = 'rb-profile-modal';
    root.addEventListener('click', e => { if (e.target === root) this.hide(); });

    const box = document.createElement('div');
    box.className = 'rb-profile-box';

    box.innerHTML = `
      <div class="rb-profile-header">
        <h2>Profile</h2>
        <button class="rb-profile-close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="rb-profile-body">
        <div class="rb-profile-current">
          <div class="rb-profile-avatar-display"></div>
          <div class="rb-profile-name-display"></div>
          <div class="rb-profile-since"></div>
        </div>

        <label class="rb-profile-label">Display name</label>
        <input class="rb-profile-name-input" type="text" maxlength="${NAME_MAX}" />

        <label class="rb-profile-label">Avatar</label>
        <div class="rb-profile-avatar-grid"></div>

        <div class="rb-profile-stats">
          <div><span class="rb-profile-stat-label">Level</span><span class="rb-profile-stat-val" data-stat="level">—</span></div>
          <div><span class="rb-profile-stat-label">Coral</span><span class="rb-profile-stat-val" data-stat="coral">—</span></div>
          <div><span class="rb-profile-stat-label">Fish</span><span class="rb-profile-stat-val" data-stat="fish">—</span></div>
          <div><span class="rb-profile-stat-label">Harmony</span><span class="rb-profile-stat-val" data-stat="harmony">—</span></div>
        </div>

        <div class="rb-profile-btn-row">
          <button class="rb-profile-cancel" type="button">Cancel</button>
          <button class="rb-profile-save" type="button">Save</button>
        </div>
      </div>
    `;

    root.appendChild(box);
    document.body.appendChild(root);

    this._root        = root;
    this._avatarDisp  = box.querySelector('.rb-profile-avatar-display');
    this._nameDisp    = box.querySelector('.rb-profile-name-display');
    this._sinceDisp   = box.querySelector('.rb-profile-since');
    this._nameInput   = box.querySelector('.rb-profile-name-input');
    this._avatarGrid  = box.querySelector('.rb-profile-avatar-grid');
    this._stats       = box.querySelectorAll('.rb-profile-stat-val');

    box.querySelector('.rb-profile-close').addEventListener('click',  () => this.hide());
    box.querySelector('.rb-profile-cancel').addEventListener('click', () => this.hide());
    box.querySelector('.rb-profile-save').addEventListener('click',   () => this._save());

    // Avatar grid
    AVATAR_CHOICES.forEach(emoji => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rb-profile-avatar-cell';
      btn.textContent = emoji;
      btn.addEventListener('click', () => {
        this._selectedAvatar = emoji;
        this._avatarDisp.textContent = emoji;
        this._avatarGrid.querySelectorAll('.rb-profile-avatar-cell').forEach(c => c.classList.remove('selected'));
        btn.classList.add('selected');
      });
      this._avatarGrid.appendChild(btn);
    });

    // Live preview as user types
    this._nameInput.addEventListener('input', () => {
      const v = this._nameInput.value.trim() || 'Reef Keeper';
      this._nameDisp.textContent = v;
    });
  }

  _populate() {
    const p = state.profile;
    this._selectedAvatar = p.avatar || '🪸';
    this._avatarDisp.textContent = this._selectedAvatar;
    this._nameDisp.textContent   = p.name || 'Reef Keeper';
    this._sinceDisp.textContent  = p.createdDate ? `Since ${p.createdDate}` : '';
    this._nameInput.value        = p.name || '';

    this._avatarGrid.querySelectorAll('.rb-profile-avatar-cell').forEach(cell => {
      cell.classList.toggle('selected', cell.textContent === this._selectedAvatar);
    });

    // Stats
    const statMap = {
      level:   state.level,
      coral:   state.coralCount,
      fish:    state.fishCount,
      harmony: Math.round(state.harmony),
    };
    this._stats.forEach(el => {
      el.textContent = statMap[el.dataset.stat] ?? '—';
    });
  }

  _save() {
    const name = (this._nameInput.value || '').trim().slice(0, NAME_MAX) || 'Reef Keeper';
    state.profile = {
      ...(state.profile ?? defaultProfile()),
      name,
      avatar: this._selectedAvatar,
    };
    saveGame();
    this._onSave?.();
    this.hide();
  }
}

// ── Styles (injected once) ───────────────────────────────────────────────────

function _injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const css = `
.rb-profile-modal {
  display: none;
  position: fixed; inset: 0;
  z-index: 320;
  align-items: center; justify-content: center;
  background: rgba(4, 15, 40, 0.82);
  backdrop-filter: blur(6px);
  padding: 16px;
  font-family: system-ui, -apple-system, sans-serif;
}
.rb-profile-modal.open { display: flex; }
.rb-profile-box {
  background: linear-gradient(160deg, #0c2348 0%, #061427 100%);
  border: 1px solid rgba(100,180,255,0.25);
  border-radius: 18px;
  width: 100%; max-width: 380px; max-height: 88vh;
  display: flex; flex-direction: column;
  box-shadow: 0 24px 80px rgba(0,0,0,0.65);
  overflow: hidden;
}
.rb-profile-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(100,180,255,0.15);
}
.rb-profile-header h2 {
  font-size: 14px; font-weight: 700; letter-spacing: 3px;
  color: #fff; text-transform: uppercase; margin: 0;
}
.rb-profile-close {
  background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18);
  color: rgba(255,255,255,0.7); width: 28px; height: 28px;
  border-radius: 50%; font-size: 13px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-family: inherit;
}
.rb-profile-close:hover { background: rgba(255,255,255,0.18); color: #fff; }
.rb-profile-body {
  padding: 18px 20px 20px;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 12px;
}
.rb-profile-current {
  display: flex; flex-direction: column; align-items: center;
  gap: 4px; padding-bottom: 6px;
  border-bottom: 1px solid rgba(100,180,255,0.1);
  margin-bottom: 4px;
}
.rb-profile-avatar-display { font-size: 44px; line-height: 1; }
.rb-profile-name-display { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: 0.5px; }
.rb-profile-since { font-size: 10px; color: rgba(160,200,240,0.45); letter-spacing: 1px; }

.rb-profile-label {
  font-size: 10px; font-weight: 700; letter-spacing: 2px;
  text-transform: uppercase; color: rgba(140,200,250,0.7);
  margin-bottom: -4px;
}
.rb-profile-name-input {
  background: rgba(8,18,38,0.85);
  border: 1px solid rgba(100,160,220,0.3);
  color: #fff; font-size: 14px; font-family: inherit;
  border-radius: 8px; padding: 10px 12px;
  outline: none;
  transition: border-color 0.15s;
}
.rb-profile-name-input:focus { border-color: rgba(140,200,255,0.7); }

.rb-profile-avatar-grid {
  display: grid; grid-template-columns: repeat(8, 1fr);
  gap: 4px;
}
.rb-profile-avatar-cell {
  background: rgba(8,18,38,0.7);
  border: 1px solid rgba(100,160,220,0.15);
  border-radius: 8px;
  font-size: 22px;
  aspect-ratio: 1;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.12s, border-color 0.12s, transform 0.12s;
  font-family: inherit;
  padding: 0;
}
.rb-profile-avatar-cell:hover { background: rgba(40,80,140,0.55); border-color: rgba(140,200,255,0.45); }
.rb-profile-avatar-cell.selected {
  background: rgba(70,130,210,0.55);
  border-color: rgba(180,220,255,0.85);
  transform: scale(1.05);
}

.rb-profile-stats {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
  background: rgba(8,18,38,0.6);
  border: 1px solid rgba(100,160,220,0.18);
  border-radius: 10px;
  padding: 10px 8px;
}
.rb-profile-stats > div {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
}
.rb-profile-stat-label {
  font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase;
  color: rgba(140,200,250,0.55);
}
.rb-profile-stat-val { font-size: 16px; font-weight: 700; color: #fff; }

.rb-profile-btn-row {
  display: flex; gap: 8px; margin-top: 4px;
}
.rb-profile-cancel, .rb-profile-save {
  flex: 1; padding: 11px; border-radius: 10px;
  font-family: inherit; font-size: 12px; font-weight: 700;
  letter-spacing: 1.5px; cursor: pointer;
  transition: background 0.15s, color 0.15s, transform 0.1s;
}
.rb-profile-cancel {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.18);
  color: rgba(255,255,255,0.6);
}
.rb-profile-cancel:hover { background: rgba(255,255,255,0.14); color: #fff; }
.rb-profile-save {
  background: #fff; color: #0a3050; border: none;
}
.rb-profile-save:hover  { background: #d0f0ff; transform: scale(1.02); }
.rb-profile-save:active { transform: scale(0.97); }
`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}
