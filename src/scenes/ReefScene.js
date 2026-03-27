import { Container, ColorMatrixFilter } from 'pixi.js';
import { state } from '../state.js';
import { CORAL_SPECIES, FISH_SPECIES } from '../constants.js';
import { BackgroundLayer }  from '../layers/BackgroundLayer.js';
import { GridLayer }        from '../layers/GridLayer.js';
import { ForegroundLayer }  from '../layers/ForegroundLayer.js';
import { HUD }              from '../ui/HUD.js';
import { PlacementMenu }    from '../ui/PlacementMenu.js';
import { Fish }             from '../entities/Fish.js';
import { Bubbles }          from '../entities/Bubbles.js';
import {
  initEconomy, tickEconomy, spendForCoral, spendForFish, recordInteraction,
  refundCoral, refundFish,
} from '../systems/BEEconomy.js';
import { updateHarmonyFilter } from '../systems/HarmonySystem.js';
import { initLevelSystem, checkLevelUp } from '../systems/LevelSystem.js';
import { tileCenter } from '../utils/grid.js';
import { saveGame, loadGame } from '../save.js';

export class ReefScene {
  constructor(app) {
    this.app = app;

    // ── World container (harmony saturation filter applied here) ────────────
    this.worldContainer = new Container();
    this._satFilter = new ColorMatrixFilter();
    this.worldContainer.filters = [this._satFilter];

    // ── Fish containers ──────────────────────────────────────────────────────
    this._fishContainerA = new Container();
    this._fishContainerB = new Container();

    // ── Layers ───────────────────────────────────────────────────────────────
    this._bg         = new BackgroundLayer();
    this._grid       = new GridLayer((tile) => this._onTileTap(tile));
    this._foreground = new ForegroundLayer();

    // ── Bubbles drone ────────────────────────────────────────────────────────
    this._bubbles = new Bubbles();

    // ── Depth-correct render order ───────────────────────────────────────────
    // 1. Background
    this.worldContainer.addChild(this._bg.container);
    // 2. Grid floor + lines + input
    this.worldContainer.addChild(this._grid.container);
    // 3. Short/flat coral — fish Layer A swims over these
    this.worldContainer.addChild(this._grid.shortCoralContainer);
    // 4. Fish Layer A (clownfish, chromis, butterflyfish, seahorse)
    this.worldContainer.addChild(this._fishContainerA);
    // 5. Tall coral — renders in front of Layer-A fish
    this.worldContainer.addChild(this._grid.tallCoralContainer);
    // 6. Fish Layer B (moray, cuttlefish, moorish idol, yellow tang)
    this.worldContainer.addChild(this._fishContainerB);
    // 7. Foreground bubbles
    this.worldContainer.addChild(this._foreground.container);
    // 8. Bubbles drone (above world, below UI)
    this.worldContainer.addChild(this._bubbles.container);
    // 9. Tile hover highlight (always topmost in world)
    this.worldContainer.addChild(this._grid.hoverContainer);

    // ── UI (no saturation filter) ────────────────────────────────────────────
    this._uiContainer = new Container();
    this._hud  = new HUD(() => { saveGame(); window.location.reload(); });
    this._menu = new PlacementMenu(
      (id) => this._onCoralSelected(id),
      (id) => this._onFishSelected(id),
    );
    this._uiContainer.addChild(this._menu.container);
    this._uiContainer.addChild(this._hud.container);

    app.stage.addChild(this.worldContainer);
    app.stage.addChild(this._uiContainer);

    // ── Systems ──────────────────────────────────────────────────────────────
    initEconomy((newBE, bonusMsg) => {
      if (bonusMsg) {
        this._hud.showBonus(bonusMsg);
        if (bonusMsg.includes('watching')) {
          this._bubbles.trigger('idleStreak');
        }
      }
      this._checkLowBE(newBE);
    });

    initLevelSystem((newLevel) => {
      this._hud.showLevelUp(newLevel);
      this._menu.updateLevel();
      this._bubbles.trigger('levelUp');
    });

    // ── Ticker ───────────────────────────────────────────────────────────────
    this._autoSaveMs = 0;
    app.ticker.add((ticker) => this._onTick(ticker));

    // ── Restore save ─────────────────────────────────────────────────────────
    const saved = loadGame();
    if (saved) this._restoreFromSave(saved);
  }

  // ── Game loop ──────────────────────────────────────────────────────────────

  _onTick(ticker) {
    const dms = ticker.deltaMS;
    const dt  = ticker.deltaTime;

    this._bg.update(dms);
    this._foreground.update(dms);
    this._bubbles.update(dms);
    this._hud.update(dms);
    this._menu.update(dms);

    tickEconomy(dms);
    updateHarmonyFilter(this.worldContainer);
    checkLevelUp();

    state.fish.forEach(fish => fish.update(dt, state.grid, CORAL_SPECIES));

    // Auto-save every 30 s
    this._autoSaveMs += dms;
    if (this._autoSaveMs >= 30000) {
      this._autoSaveMs = 0;
      saveGame();
    }
  }

  // ── Placement ──────────────────────────────────────────────────────────────

  _onCoralSelected() { this._grid.refreshHover(); }
  _onFishSelected()  { this._grid.refreshHover(); }

  _onTileTap(tile) {
    recordInteraction();
    const { col, row } = tile;

    // Remove mode: tap coral to remove it
    if (state.removeMode) {
      this._tryRemoveCoral(col, row);
      return;
    }

    const { selectedType, selectedId } = state;
    if (!selectedType || !selectedId) return;

    if (selectedType === 'coral') {
      this._tryPlaceCoral(col, row, selectedId);
    } else if (selectedType === 'fish') {
      this._trySpawnFish(col, row, selectedId);
    }
  }

  _tryPlaceCoral(col, row, speciesId) {
    if (state.grid[row][col] !== null) return;
    const spec = CORAL_SPECIES[speciesId];
    if (!spec || spec.unlockLevel > state.level) return;
    if (!spendForCoral(speciesId)) return;

    const uid = state.nextUid();
    state.grid[row][col] = speciesId;
    state.placedCoral.push({ uid, col, row, speciesId });
    state.coralCount++;
    state.coralTierCounts[spec.tier]++;
    state.coralTypesSeen.add(speciesId);

    this._grid.placeCoral(spec, col, row, uid);

    // Bubbles events
    if (state.coralCount === 1) this._bubbles.trigger('firstCoral');

    checkLevelUp();
    saveGame();
  }

  _trySpawnFish(col, row, speciesId) {
    const spec = FISH_SPECIES[speciesId];
    if (!spec || spec.unlockLevel > state.level) return;
    if (!spendForFish(speciesId)) return;
    this._spawnFish(speciesId, spec, col, row);
  }

  _spawnFish(speciesId, spec, col, row) {
    const uid  = state.nextUid();
    const fish = new Fish(spec, col, row, uid);
    state.fish.push(fish);
    state.fishCount++;
    state.fishTierCounts[spec.tier]++;
    state.fishTypesSeen.add(speciesId);
    state.fishLayerCounts[spec.layer]++;

    // Make fish tappable for removal in remove mode
    fish.container.interactive = true;
    fish.container.cursor = 'pointer';
    fish.container.hitArea = { contains: (x, y) => {
      const sz = spec.size * 1.5;
      return x >= -sz && x <= sz && y >= -sz && y <= sz;
    }};
    fish.container.on('pointerdown', (e) => {
      if (!state.removeMode) return;
      e.stopPropagation();
      this._removeFish(fish);
    });

    if (spec.layer === 'A') {
      this._fishContainerA.addChild(fish.container);
    } else {
      this._fishContainerB.addChild(fish.container);
    }

    if (state.fishCount === 1) this._bubbles.trigger('firstFish');

    checkLevelUp();
    saveGame();
  }

  // ── Removal ───────────────────────────────────────────────────────────────

  _tryRemoveCoral(col, row) {
    const speciesId = state.grid[row]?.[col];
    if (speciesId === null || speciesId === undefined) return;

    // Find the placed coral entry
    const idx = state.placedCoral.findIndex(c => c.col === col && c.row === row);
    if (idx === -1) return;
    const entry = state.placedCoral[idx];
    const spec  = CORAL_SPECIES[speciesId];
    if (!spec) return;

    // Refund 50%
    const refund = refundCoral(speciesId);

    // Remove from state
    state.grid[row][col] = null;
    state.placedCoral.splice(idx, 1);
    state.coralCount--;
    state.coralTierCounts[spec.tier]--;

    // Remove sprite
    this._grid.removeCoral(entry.uid);

    if (refund > 0) this._hud.showBonus(`+${refund} 🫧`);

    saveGame();
  }

  _removeFish(fish) {
    const idx = state.fish.indexOf(fish);
    if (idx === -1) return;
    const spec = fish.spec;

    // Refund 50%
    const refund = refundFish(fish.speciesId);

    // Remove from state
    state.fish.splice(idx, 1);
    state.fishCount--;
    state.fishTierCounts[spec.tier]--;
    state.fishLayerCounts[spec.layer]--;

    // Remove sprite
    fish.container.parent?.removeChild(fish.container);
    fish.container.destroy({ children: true });

    if (refund > 0) this._hud.showBonus(`+${refund} 🫧`);

    saveGame();
  }

  // ── Save / restore ─────────────────────────────────────────────────────────

  _restoreFromSave(data) {
    // Restore resources
    state.be             = data.be      ?? state.be;
    state.harmony        = data.harmony ?? state.harmony;
    state.level          = data.level   ?? state.level;
    state.harmonySmoothed = state.harmony;

    state.coralTypesSeen = new Set(data.coralTypesSeen ?? []);
    state.fishTypesSeen  = new Set(data.fishTypesSeen  ?? []);

    // Rebuild coral sprites
    let maxUid = 0;
    (data.placedCoral ?? []).forEach(({ uid, col, row, speciesId }) => {
      const spec = CORAL_SPECIES[speciesId];
      if (!spec || state.grid[row]?.[col] !== null) return;
      state.grid[row][col] = speciesId;
      state.placedCoral.push({ uid, col, row, speciesId });
      state.coralCount++;
      state.coralTierCounts[spec.tier]++;
      this._grid.placeCoral(spec, col, row, uid);
      if (uid > maxUid) maxUid = uid;
    });

    // Respawn fish (positions don't persist — they just swim freely)
    (data.fishTypes ?? []).forEach(speciesId => {
      const spec = FISH_SPECIES[speciesId];
      if (!spec) return;
      const uid  = state.nextUid();
      const col  = 2 + Math.floor(Math.random() * 6);
      const row  = 2 + Math.floor(Math.random() * 6);
      const fish = new Fish(spec, col, row, uid);
      state.fish.push(fish);
      state.fishCount++;
      state.fishTierCounts[spec.tier]++;
      state.fishTypesSeen.add(speciesId);
      state.fishLayerCounts[spec.layer]++;

      fish.container.interactive = true;
      fish.container.cursor = 'pointer';
      fish.container.hitArea = { contains: (x, y) => {
        const sz = spec.size * 1.5;
        return x >= -sz && x <= sz && y >= -sz && y <= sz;
      }};
      fish.container.on('pointerdown', (e) => {
        if (!state.removeMode) return;
        e.stopPropagation();
        this._removeFish(fish);
      });

      if (spec.layer === 'A') this._fishContainerA.addChild(fish.container);
      else                    this._fishContainerB.addChild(fish.container);
    });

    // Ensure UID counter doesn't collide with restored UIDs
    state._nextUid = Math.max(state._nextUid, maxUid + 1);

    this._menu.updateLevel();
  }

  // ── Low BE warning ─────────────────────────────────────────────────────────

  _lowBEWarned = false;

  _checkLowBE(be) {
    if (be < 5 && !this._lowBEWarned) {
      this._lowBEWarned = true;
      this._bubbles.trigger('lowBE');
    }
    if (be >= 10) {
      this._lowBEWarned = false;
    }
  }
}
