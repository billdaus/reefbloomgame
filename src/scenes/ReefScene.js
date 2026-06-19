import { Container, ColorMatrixFilter, Graphics, Text } from 'pixi.js';
import { state } from '../state.js';
import { CORAL_SPECIES, FISH_SPECIES, DECOR_SPECIES, GRID_ROWS, GRID_COLS, SEAGRASS_UNLOCK_LEVEL, DEEP_TWILIGHT_UNLOCK_LEVEL, BE_PER_TICK, BIOMES, PANEL_X, PANEL_Y, PANEL_W, SCREEN_W, SCREEN_H, BE_MAX, GRID_X, GRID_Y, GRID_W, GRID_H, TILE_SIZE, STATION_SPAN, STATION_MAX_LEVEL, STATION_CELL, CLEAN_DURATION_TICKS, CLEAN_COOLDOWN_MS, CLEANER_TENURE_TICKS, CLEANER_TENURE_CUSTOMERS, CLEANER_LEAVE_CHANCE, CLEANER_OFFDUTY_MS, CLEANING_ASSIGN_INTERVAL, stationUpgradeCost, IS_PORTRAIT, PANEL_H } from '../constants.js';
import { BackgroundLayer }  from '../layers/BackgroundLayer.js';
import { GridLayer }        from '../layers/GridLayer.js';
import { ForegroundLayer }  from '../layers/ForegroundLayer.js';
import { HUD }              from '../ui/HUD.js';
import { PlacementMenu }    from '../ui/PlacementMenu.js';
import { Fish }             from '../entities/Fish.js';
import { Bubbles }          from '../entities/Bubbles.js';
import { SeasonalAmbience } from '../entities/SeasonalAmbience.js';
import {
  initEconomy, tickEconomy,
  spendForCoral, spendForFish, spendForCoralPearl, spendForFishPearl,
  spendForCoralPolyp, spendPolyps,
  spendForDecor, refundDecor,
  recordInteraction, refundCoral, refundFish,
} from '../systems/BEEconomy.js';
import { initQuests, recordQuestEvent, checkSnapshotQuests, getQuestStatus } from '../systems/QuestSystem.js';
import { initEventSystem, recordEventProgress, checkEventSnapshots, recordQuestClaimed } from '../systems/EventSystem.js';
import { initJournal, unlockEntry } from '../systems/JournalSystem.js';
import { updateHarmonyFilter, getBubblesComment } from '../systems/HarmonySystem.js';
import { initLevelSystem, checkLevelUp } from '../systems/LevelSystem.js';
import { coralLevel, canUpgrade, applyUpgrade } from '../systems/CoralUpgrade.js';
import { initClamSystem, tickClamSystem, canWatch, collectAdReward, despawnClam } from '../systems/ClamSystem.js';
import { Clam } from '../entities/Clam.js';
import { QuestClam } from '../entities/QuestClam.js';
import { ClamRewardModal }    from '../ui/ClamRewardModal.js';
import { PearlShopModal }     from '../ui/PearlShopModal.js';
import { DailyQuestModal }    from '../ui/DailyQuestModal.js';
import JournalModal           from '../ui/JournalModal.js';
import { AccountModal }       from '../ui/AccountModal.js';
import { EventModal }         from '../ui/EventModal.js';
import { CoralUpgradeModal }  from '../ui/CoralUpgradeModal.js';
import { StationUpgradeModal } from '../ui/StationUpgradeModal.js';
import { HarmonyAdvisorModal } from '../ui/HarmonyAdvisorModal.js';
import { tileCenter } from '../utils/grid.js';
import { saveGame, loadGame, setCurrentBiome, getInactiveBiomesPlacedCoral } from '../save.js';
import { CameraController } from './CameraController.js';
import { isTapSuppressed } from '../input/gesture.js';

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

    // ── Gavin emission particles (farts + poops) ─────────────────────────────
    this._particleContainer = new Container();
    this._particles = [];   // { gfx, vx, vy, age, life, type }

    // ── Clam ─────────────────────────────────────────────────────────────────
    this._clamContainer = new Container();
    this._clamEntity    = null;

    // ── Quest clam ────────────────────────────────────────────────────────────
    this._questClamContainer = new Container();
    this._questClamEntity    = null;

    // ── Layers ───────────────────────────────────────────────────────────────
    this._bg         = new BackgroundLayer();
    this._grid       = new GridLayer((tile) => this._onTileTap(tile));
    this._grid.onCoralTap   = (uid) => this._onCoralBadgeTap(uid);
    this._grid.onStationTap = (uid) => this._onStationBadgeTap(uid);
    this._foreground = new ForegroundLayer();

    // ── Bubbles drone ────────────────────────────────────────────────────────
    this._bubbles = new Bubbles();
    this._bubbles.onGenerate = () => getBubblesComment();

    // ── Seasonal ambience (petals / motes / sparkles) ─────────────────────────
    this._ambience = new SeasonalAmbience();

    // ── Depth-correct render order ───────────────────────────────────────────
    // 1. Background
    this.worldContainer.addChild(this._bg.container);
    // 2. Grid floor + lines + input
    this.worldContainer.addChild(this._grid.container);
    // 2b. Decor — static aesthetic props on the floor, below coral and fish
    this.worldContainer.addChild(this._grid.decorContainer);
    // 2c. Cleaning stations — 2×2 structures on the floor, below coral and fish
    this.worldContainer.addChild(this._grid.stationContainer);
    // 3. Short/flat coral — fish Layer A swims over these
    this.worldContainer.addChild(this._grid.shortCoralContainer);
    // 4. Fish Layer A (clownfish, chromis, butterflyfish, seahorse)
    this.worldContainer.addChild(this._fishContainerA);
    // 4b. Particle emissions (Gavin's farts/poops) — drift among Layer-A fish
    this.worldContainer.addChild(this._particleContainer);
    // 5. Tall coral — renders in front of Layer-A fish
    this.worldContainer.addChild(this._grid.tallCoralContainer);
    // 6. Fish Layer B (moray, cuttlefish, moorish idol, yellow tang)
    this.worldContainer.addChild(this._fishContainerB);
    // 7. Foreground bubbles
    this.worldContainer.addChild(this._foreground.container);
    // 8. Seasonal ambience (petals / motes / sparkles — above fish, below drone)
    this.worldContainer.addChild(this._ambience.container);
    // 9. Bubbles drone (above world, below UI)
    this.worldContainer.addChild(this._bubbles.container);
    // 9b. Coral upgrade badges (above coral/fish, below hover highlight)
    this.worldContainer.addChild(this._grid.badgeContainer);
    // 9c. Tile hover highlight (always topmost in world)
    this.worldContainer.addChild(this._grid.hoverContainer);
    // 10. Clam + quest clam — always rendered above everything so they're
    // never hidden behind tall coral or fish and stay easy to tap.
    this.worldContainer.addChild(this._clamContainer);
    this.worldContainer.addChild(this._questClamContainer);

    // ── UI (no saturation filter) ────────────────────────────────────────────
    this._uiContainer   = new Container();
    this._rewardModal   = new ClamRewardModal();
    this._shopModal     = new PearlShopModal();
    this._journalModal  = new JournalModal();
    this._upgradeModal  = new CoralUpgradeModal();
    this._stationModal  = new StationUpgradeModal();
    this._advisorModal  = new HarmonyAdvisorModal();
    this._accountModal  = new AccountModal(() => this._hud?.refreshAccountAvatar());
    this._eventModal    = new EventModal(
      () => { saveGame(); },   // onAccept
      () => { saveGame(); },   // onClaim
    );
    this._questModal    = new DailyQuestModal(
      () => { unlockEntry('event:quest_accept'); this._refreshQuestClam(); saveGame(); },   // onAccept
      () => {                                                                                // onClaim
        unlockEntry('event:quest_complete');
        if (state.quest?.reward?.pearls > 0) unlockEntry('resource:pearls');
        recordQuestClaimed();
        this._removeQuestClam(); saveGame();
      },
    );
    this._hud  = new HUD(
      () => { saveGame(); window.location.reload(); },
      () => this._shopModal.show(),
      () => this._journalModal.show(),
      () => this._accountModal.show(),
      () => this._eventModal.show(),
      () => this._advisorModal.show(),
    );
    this._menu = new PlacementMenu(
      (id) => this._onCoralSelected(id),
      (id) => this._onFishSelected(id),
      (id) => this._onDecorSelected(id),
    );

    this._uiContainer.addChild(this._menu.container);
    this._uiContainer.addChild(this._buildDockAccountBtn());
    this._uiContainer.addChild(this._hud.container);
    this._uiContainer.addChild(this._rewardModal.container);
    this._uiContainer.addChild(this._shopModal.container);
    this._uiContainer.addChild(this._questModal.container);
    this._uiContainer.addChild(this._journalModal.container);
    this._uiContainer.addChild(this._upgradeModal.container);
    this._uiContainer.addChild(this._stationModal.container);
    this._uiContainer.addChild(this._advisorModal.container);
    this._uiContainer.addChild(this._accountModal.container);
    this._uiContainer.addChild(this._eventModal.container);

    // Expose layout + travel callback for DOM travel button/modal (see index.html)
    window._rfLayout   = { PANEL_X, PANEL_Y, PANEL_W, SCREEN_W, SCREEN_H };
    window._rfBiomes   = Object.values(BIOMES);
    window._rfGetState = () => ({ biome: state.biome, level: state.level });
    window._rfTravelTo = (biomeId) => this._travelToBiome(biomeId);
    requestAnimationFrame(() => window._rfPositionBtn?.());

    app.stage.addChild(this.worldContainer);
    app.stage.addChild(this._uiContainer);

    // Mobile: pinch-zoom / drag-pan camera over the reef + on-screen zoom
    // controls. The camera transforms only worldContainer, so the UI stays put.
    if (IS_PORTRAIT) {
      this._camera = new CameraController(app, this.worldContainer);
      this._uiContainer.addChild(this._buildZoomControls());
    }

    // ── Systems ──────────────────────────────────────────────────────────────
    // Journal init first — cross-slot, no save interaction
    initJournal();

    initEconomy((newBE, bonusMsg) => {
      if (bonusMsg) {
        this._hud.showBonus(bonusMsg);
        if (bonusMsg.includes('watching')) {
          unlockEntry('event:idle_streak');
          this._bubbles.trigger('idleStreak');
        }
      }
      if (newBE >= (state.beMax ?? BE_MAX)) unlockEntry('event:be_max');
      this._checkLowBE(newBE);
    });

    initLevelSystem((newLevel) => {
      unlockEntry('event:level_up');
      this._hud.showLevelUp(newLevel);
      this._menu.updateLevel();
      this._bubbles.trigger('levelUp');
    });

    initClamSystem({
      onSpawn: (x, y) => {
        this._clamEntity = new Clam(x, y, () => this._onClamTap());
        this._clamContainer.addChild(this._clamEntity.container);
      },
      onDespawn: () => {
        if (this._clamEntity) {
          this._clamContainer.removeChild(this._clamEntity.container);
          this._clamEntity.container.destroy({ children: true });
          this._clamEntity = null;
        }
      },
    });

    // ── Ticker ───────────────────────────────────────────────────────────────
    this._autoSaveMs = 0;
    app.ticker.add((ticker) => this._onTick(ticker));

    // Persist current state (including live fish positions) the moment the tab
    // is hidden or closed, so a reload restores fish where they actually are
    // rather than at the last 30s autosave.
    const persistNow = () => { try { saveGame(); } catch { /* ignore */ } };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persistNow();
    });
    window.addEventListener('pagehide', persistNow);

    // ── Restore save ─────────────────────────────────────────────────────────
    const saved = loadGame();
    if (saved) this._restoreFromSave(saved);
    this._hud.refreshAccountAvatar();

    // initQuests MUST come after _restoreFromSave — its onChange fires saveGame()
    // immediately if today's date is new, and state must be fully populated first.
    initQuests(() => { this._questModal.refresh(); this._refreshQuestClam(); saveGame(); });
    initEventSystem(
      () => { this._eventModal.refresh(); this._ambience.refresh(); saveGame(); },
      (speciesId) => this._grantExclusiveSpecies(speciesId),
    );
  }

  // ── Game loop ──────────────────────────────────────────────────────────────

  _onTick(ticker) {
    const dms = ticker.deltaMS;
    const dt  = ticker.deltaTime;

    this._bg.update(dms);
    this._foreground.update(dms);
    this._ambience.update(dms);
    this._bubbles.update(dms);
    this._hud.update(dms);
    this._menu.update(dms);

    tickEconomy(dms);
    tickClamSystem(dms);
    updateHarmonyFilter(this.worldContainer);
    checkLevelUp();

    if (this._clamEntity)      this._clamEntity.update(dms);
    if (this._questClamEntity) this._questClamEntity.update(dms);
    this._rewardModal.update(dms);

    // Per-tile coral levels so fish blocking grows with upgrades
    const coralLevels = {};
    for (const cc of state.placedCoral) coralLevels[cc.row * 10 + cc.col] = cc.level ?? 1;

    state.fish.forEach(fish => {
      fish.update(dt, state.grid, CORAL_SPECIES, (ev) => this._onGavinEmit(ev), state.fish, coralLevels);
      // Sparkle only over CLIENTS actively being cleaned (not loitering cleaners)
      if (this._activeCleanUids?.has(fish.uid) && Math.random() < 0.16) {
        this._spawnSparkle(fish.x + (Math.random() - 0.5) * 10, fish.y - 6);
      }
    });
    this._tickStations(dms, dt);
    this._updateParticles(dms);

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
  _onDecorSelected() { this._grid.refreshHover(); }

  _onTileTap(tile) {
    recordInteraction();
    const { col, row } = tile;
    const station = this._stationAt(col, row);

    // Remove mode: tap occupant to remove it (station, then decor, then coral)
    if (state.removeMode) {
      if (station) {
        this._tryRemoveStation(station);
      } else if (state.placedDecor.some(d => d.col === col && d.row === row)) {
        this._tryRemoveDecor(col, row);
      } else {
        this._tryRemoveCoral(col, row);
      }
      return;
    }

    const { selectedType, selectedId } = state;

    // Nothing selected: tapping a station opens its panel; a coral opens its panel
    if (!selectedType || !selectedId) {
      if (station) { this._openStationUpgrade(station); return; }
      const entry = state.placedCoral.find(c => c.col === col && c.row === row);
      if (entry) this._openCoralUpgrade(entry);
      return;
    }

    if (selectedType === 'coral') {
      this._tryPlaceCoral(col, row, selectedId);
    } else if (selectedType === 'fish') {
      this._trySpawnFish(col, row, selectedId);
    } else if (selectedType === 'decor') {
      this._tryPlaceDecor(col, row, selectedId);
    }
  }

  _tryPlaceCoral(col, row, speciesId) {
    if (state.grid[row][col] !== null) return;
    const spec = CORAL_SPECIES[speciesId];
    if (!spec || spec.unlockLevel > state.level) return;
    // Stackable decor occupies ground space; only tall coral can rise above it
    const decorHere = state.placedDecor.some(d => d.col === col && d.row === row);
    if (decorHere && !spec.tall) return;
    const spent = spec.polypCost ? spendForCoralPolyp(speciesId)
                : spec.pearlCost ? spendForCoralPearl(speciesId)
                :                   spendForCoral(speciesId);
    if (!spent) return;

    const uid = state.nextUid();
    state.grid[row][col] = speciesId;
    state.placedCoral.push({ uid, col, row, speciesId, level: 1, pendingBE: 0 });
    state.coralCount++;
    state.coralTierCounts[spec.tier]++;
    state.coralTypesSeen.add(speciesId);
    this._recomputeBeMax();

    this._grid.placeCoral(spec, col, row, uid, 1);
    this._assignFishHomes();   // new coral offers fresh homes to roamers

    unlockEntry(`coral:${speciesId}`);
    unlockEntry('resource:harmony');

    // Bubbles events
    if (state.coralCount === 1) this._bubbles.trigger('firstCoral');

    recordQuestEvent('place_coral', 1);
    recordEventProgress('place_coral', 1);
    checkSnapshotQuests();
    checkEventSnapshots();
    checkLevelUp();
    saveGame();
  }

  /** BE wallet cap = base + each vault's storage × its level. */
  _recomputeBeMax() {
    let storage = 0;
    for (const c of state.placedCoral) {
      const st = CORAL_SPECIES[c.speciesId]?.storage;
      if (st) storage += st * Math.max(1, c.level ?? 1);
    }
    state.beMax = BE_MAX + storage;
  }

  /** Account button stationed beside Bubbles' dock (bottom-left of the reef). */
  _buildDockAccountBtn() {
    const FONT = 'system-ui, -apple-system, sans-serif';
    const W = 92, H = 26;
    const c = new Container();
    const bg = new Graphics();
    const draw = (hover) => {
      bg.clear();
      bg.roundRect(0, 0, W, H, 8).fill({ color: hover ? 0x2a3a5a : 0x10243a, alpha: 0.95 });
      bg.roundRect(0, 0, W, H, 8).stroke({ color: 0x7fb0e0, width: 1.5, alpha: 0.9 });
    };
    draw(false);
    const label = new Text({
      text: '👤 Account',
      style: { fontSize: 12, fill: 0xd8efff, fontFamily: FONT, fontWeight: '600' },
    });
    label.anchor.set(0.5);
    label.x = W / 2; label.y = H / 2;
    c.addChild(bg, label);
    // Near the rocky outcrop's "Bubbles' dock" at the bottom-left
    c.x = GRID_X + 232;
    c.y = (IS_PORTRAIT ? GRID_Y + GRID_H - 30 : GRID_Y + GRID_H + 14);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointerover', () => draw(true));
    c.on('pointerout',  () => draw(false));
    c.on('pointerdown', (e) => { e.stopPropagation(); this._accountModal.show(); });
    return c;
  }

  /** Mobile on-screen zoom controls (＋ / － / recenter) for the reef camera. */
  _buildZoomControls() {
    const FONT = 'system-ui, -apple-system, sans-serif';
    const S = 38, GAP = 8;
    const wrap = new Container();

    const makeBtn = (glyph, onTap, idx) => {
      const b  = new Container();
      const bg = new Graphics();
      const draw = (hover) => {
        bg.clear();
        bg.roundRect(0, 0, S, S, 10).fill({ color: hover ? 0x2a3a5a : 0x10243a, alpha: 0.9 });
        bg.roundRect(0, 0, S, S, 10).stroke({ color: 0x7fb0e0, width: 1.5, alpha: 0.9 });
      };
      draw(false);
      const t = new Text({
        text: glyph,
        style: { fontSize: 20, fill: 0xd8efff, fontFamily: FONT, fontWeight: '700' },
      });
      t.anchor.set(0.5);
      t.x = S / 2; t.y = S / 2 + 1;
      b.addChild(bg, t);
      b.y = idx * (S + GAP);
      b.eventMode = 'static';
      b.cursor = 'pointer';
      b.hitArea = { contains: (x, y) => x >= 0 && x <= S && y >= 0 && y <= S };
      b.on('pointerover', () => draw(true));
      b.on('pointerout',  () => draw(false));
      b.on('pointerdown', (e) => { e.stopPropagation(); onTap(); });
      return b;
    };

    wrap.addChild(makeBtn('+', () => this._camera?.zoomIn(),  0));
    wrap.addChild(makeBtn('−', () => this._camera?.zoomOut(), 1));   // −
    wrap.addChild(makeBtn('⌂', () => this._camera?.reset(),   2));   // ⌂ recenter
    // Bottom-right corner of the grid viewport
    wrap.x = GRID_X + GRID_W - S - 6;
    wrap.y = GRID_Y + GRID_H - (S * 3 + GAP * 2) - 6;
    return wrap;
  }

  /**
   * A coral's "···" badge was tapped. The badge IS the upgrade button, so it
   * opens the upgrade menu in every mode EXCEPT remove (where the tap removes)
   * — this makes the menu open consistently whether or not a placement tool is
   * selected. The one exception: stacking small decor onto tall coral, which
   * is delegated to the normal tile handler so that feature still works.
   */
  _onCoralBadgeTap(uid) {
    const entry = state.placedCoral.find(c => c.uid === uid);
    if (!entry) return;
    const { col, row } = entry;
    if (state.removeMode) { this._onTileTap({ col, row }); return; }
    if (state.selectedType === 'decor') {
      const dspec = DECOR_SPECIES[state.selectedId];
      const cspec = CORAL_SPECIES[entry.speciesId];
      if (dspec?.stackable && cspec?.tall) { this._onTileTap({ col, row }); return; }
    }
    recordInteraction();
    this._openCoralUpgrade(entry);
  }

  _openCoralUpgrade(entry) {
    this._upgradeModal.show(entry, (e) => {
      if (!canUpgrade(e)) return null;
      const newLevel = applyUpgrade(e);
      if (!newLevel) return null;
      this._grid.upgradeCoral(e.uid, newLevel);
      this._recomputeBeMax();   // vault upgrades raise the BE cap
      this._assignFishHomes();  // higher level → more fish can call it home
      const spec = CORAL_SPECIES[e.speciesId];
      this._hud.showBonus(`${spec?.name ?? 'Coral'} → Lv ${newLevel} 🪸`);
      unlockEntry('event:coral_upgrade');
      recordInteraction();
      saveGame();
      return newLevel;
    });
  }

  _tryPlaceDecor(col, row, speciesId) {
    const spec = DECOR_SPECIES[speciesId];
    if (!spec || spec.unlockLevel > state.level) return;

    // Cleaning stations are 2×2 structures, not ordinary decor — route them out
    if (spec.cleaning) { this._tryPlaceStation(col, row, speciesId); return; }

    // One decor per tile, max
    if (state.placedDecor.some(d => d.col === col && d.row === row)) return;

    const cellId    = state.grid[row][col];
    const cellCoral = cellId ? CORAL_SPECIES[cellId] : null;

    if (spec.stackable) {
      // Stackable decor: tile must be empty OR contain TALL coral
      if (cellId !== null && !cellCoral?.tall) return;
    } else {
      // Non-stackable decor: tile must be empty
      if (cellId !== null) return;
    }

    if (!spendForDecor(speciesId)) return;

    const uid = state.nextUid();
    // Only non-stackable decor takes the primary grid slot
    if (!spec.stackable) state.grid[row][col] = speciesId;
    state.placedDecor.push({ uid, col, row, speciesId });
    state.decorTypesSeen.add(speciesId);

    this._grid.placeDecor(spec, col, row, uid);
    saveGame();
  }

  // ── Cleaning stations (2×2) ──────────────────────────────────────────────────

  /** The station occupying (col,row), or undefined. */
  _stationAt(col, row) {
    return state.placedStations.find(s =>
      col >= s.col && col < s.col + STATION_SPAN &&
      row >= s.row && row < s.row + STATION_SPAN);
  }

  _tryPlaceStation(col, row, speciesId) {
    const spec = DECOR_SPECIES[speciesId];
    if (!spec || spec.unlockLevel > state.level) return;

    // Needs a 2×2 block, in bounds and fully clear (no coral, decor, or station)
    if (col + STATION_SPAN > GRID_COLS || row + STATION_SPAN > GRID_ROWS) return;
    for (let r = row; r < row + STATION_SPAN; r++) {
      for (let c = col; c < col + STATION_SPAN; c++) {
        if (state.grid[r][c] !== null) return;
        if (state.placedDecor.some(d => d.col === c && d.row === r)) return;
      }
    }
    if (!spendPolyps(DECOR_SPECIES[speciesId]?.polypCost ?? 0)) return;

    const uid = state.nextUid();
    for (let r = row; r < row + STATION_SPAN; r++) {
      for (let c = col; c < col + STATION_SPAN; c++) {
        state.grid[r][c] = STATION_CELL;
      }
    }
    state.placedStations.push({ uid, col, row, level: 1 });
    this._grid.placeStation(col, row, uid, 1);
    unlockEntry('event:station_place');
    saveGame();
  }

  _tryRemoveStation(st) {
    const idx = state.placedStations.indexOf(st);
    if (idx === -1) return;
    // Release any clients and loitering cleaners back to free swimming
    (st._clients  ?? []).forEach(c => state.fish.find(f => f.uid === c.fishUid)?.endCleaning());
    (st._cleaners ?? []).forEach(u => state.fish.find(f => f.uid === u)?.endCleaning());
    for (let r = st.row; r < st.row + STATION_SPAN; r++) {
      for (let c = st.col; c < st.col + STATION_SPAN; c++) {
        if (state.grid[r][c] === STATION_CELL) state.grid[r][c] = null;
      }
    }
    state.placedStations.splice(idx, 1);
    this._grid.removeStation(st.uid);
    const refund = refundDecor('cleaningStation');
    if (refund > 0) this._hud.showBonus(`+${refund} 🫧`);
    saveGame();
  }

  /**
   * Station "···" badge tapped — opens the upgrade menu in every mode except
   * remove (where it removes the station), so the menu opens consistently.
   */
  _onStationBadgeTap(uid) {
    const st = state.placedStations.find(s => s.uid === uid);
    if (!st) return;
    if (state.removeMode) { this._tryRemoveStation(st); return; }
    recordInteraction();
    this._openStationUpgrade(st);
  }

  _openStationUpgrade(st) {
    this._stationModal.show(st, (e) => {
      const level = e.level ?? 1;
      const cost  = stationUpgradeCost(level);
      if (level >= STATION_MAX_LEVEL || state.polyps < cost) return null;
      state.polyps -= cost;
      e.level = level + 1;
      this._grid.upgradeStation(e.uid, e.level);
      this._hud.showBonus(`Station → Lv ${e.level} (capacity ${e.level}) 🪸`);
      unlockEntry('event:station_upgrade');
      recordInteraction();
      saveGame();
      return e.level;
    });
  }

  _trySpawnFish(col, row, speciesId) {
    const spec = FISH_SPECIES[speciesId];
    if (!spec || spec.unlockLevel > state.level) return;
    const spent = spec.pearlCost ? spendForFishPearl(speciesId) : spendForFish(speciesId);
    if (!spent) return;
    this._spawnFish(speciesId, spec, col, row);
  }

  /** How many fish a coral can host as their home — grows with each upgrade. */
  _coralCapacity(level) { return (level ?? 1) + 1; }   // Lv1→2, Lv5→6

  /**
   * Assign every fish a home coral, respecting per-coral capacity. Fish keep a
   * valid existing home; the rest are placed at the nearest coral with a free
   * slot. Fish with nowhere to go become free roamers (home = null). Call after
   * any change to fish or coral counts/levels.
   */
  _assignFishHomes() {
    const corals = state.placedCoral;
    const cap = new Map();
    for (const cc of corals) cap.set(cc.uid, this._coralCapacity(cc.level));

    // Keep still-valid homes, freeing their capacity slot.
    for (const f of state.fish) {
      if (f.homeUid == null) continue;
      const home = corals.find(c => c.uid === f.homeUid);
      if (home && cap.get(home.uid) > 0) {
        cap.set(home.uid, cap.get(home.uid) - 1);
      } else {
        f.homeUid = f.homeCol = f.homeRow = null;
      }
    }

    // Place homeless fish at the nearest coral that still has room.
    for (const f of state.fish) {
      if (f.homeUid != null) continue;
      let best = null, bestD = Infinity;
      for (const cc of corals) {
        if (cap.get(cc.uid) <= 0) continue;
        const ctr = tileCenter(cc.col, cc.row);
        const d = (ctr.x - f.x) ** 2 + (ctr.y - f.y) ** 2;
        if (d < bestD) { bestD = d; best = cc; }
      }
      if (best) {
        f.homeUid = best.uid; f.homeCol = best.col; f.homeRow = best.row;
        cap.set(best.uid, cap.get(best.uid) - 1);
      } else {
        f.homeUid = f.homeCol = f.homeRow = null;
      }
    }
  }

  _spawnFish(speciesId, spec, col, row) {
    const uid  = state.nextUid();
    const fish = new Fish(spec, col, row, uid);
    state.fish.push(fish);
    state.fishCount++;
    state.fishTierCounts[spec.tier]++;
    state.fishTypesSeen.add(speciesId);
    state.fishLayerCounts[spec.layer]++;

    unlockEntry(`fish:${speciesId}`);

    // Make fish tappable for removal in remove mode
    fish.container.interactive = true;
    fish.container.cursor = 'pointer';
    fish.container.hitArea = { contains: (x, y) => {
      const sz = spec.size * 1.5;
      return x >= -sz && x <= sz && y >= -sz && y <= sz;
    }};
    fish.container.on(IS_PORTRAIT ? 'pointerup' : 'pointerdown', (e) => {
      if (!state.removeMode || isTapSuppressed()) return;
      e.stopPropagation();
      this._removeFish(fish);
    });

    if (spec.layer === 'A') {
      this._fishContainerA.addChild(fish.container);
    } else {
      this._fishContainerB.addChild(fish.container);
    }

    if (state.fishCount === 1) this._bubbles.trigger('firstFish');

    this._assignFishHomes();

    recordQuestEvent('hatch_fish', 1);
    recordEventProgress('hatch_fish', 1);
    checkSnapshotQuests();
    checkEventSnapshots();
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
    this._recomputeBeMax();

    // Remove sprite
    this._grid.removeCoral(entry.uid);
    this._assignFishHomes();   // re-home any fish that lived here

    if (refund > 0) this._hud.showBonus(`+${refund} 🫧`);
    unlockEntry('event:remove');

    saveGame();
  }

  _tryRemoveDecor(col, row) {
    const idx = state.placedDecor.findIndex(d => d.col === col && d.row === row);
    if (idx === -1) return;
    const entry = state.placedDecor[idx];
    const spec  = DECOR_SPECIES[entry.speciesId];

    const refund = refundDecor(entry.speciesId);

    // Stackable decor never owned the grid cell — leave any tall coral above intact.
    if (spec && !spec.stackable) state.grid[row][col] = null;
    state.placedDecor.splice(idx, 1);
    this._grid.removeDecor(entry.uid);

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

    this._assignFishHomes();   // freed home slot may take in a roamer

    if (refund > 0) this._hud.showBonus(`+${refund} 🫧`);
    unlockEntry('event:remove');

    saveGame();
  }

  // ── Gavin emissions ────────────────────────────────────────────────────────

  _onGavinEmit({ type, x, y }) {
    const gfx = new Graphics();
    if (type === 'poop') {
      // Brown pellet that drifts down
      gfx.circle(0, 0, 2.6).fill(0x5a3a1a);
      gfx.circle(-0.6, -0.8, 1.0).fill({ color: 0x8a5a2a, alpha: 0.7 });
    } else {
      // Greenish fart cloud — a couple of overlapping puffs
      gfx.circle(0, 0, 5).fill({ color: 0x9ccc65, alpha: 0.55 });
      gfx.circle(2.5, -1, 3).fill({ color: 0xc5e1a5, alpha: 0.5 });
      gfx.circle(-2, 1.5, 2.5).fill({ color: 0x7cb342, alpha: 0.5 });
    }
    gfx.x = x;
    gfx.y = y;
    this._particleContainer.addChild(gfx);

    const isPoop = type === 'poop';
    this._particles.push({
      gfx,
      type,
      vx:   (Math.random() - 0.5) * 0.4,
      vy:   isPoop ? 0.6 + Math.random() * 0.4 : -(0.3 + Math.random() * 0.3),
      age:  0,
      life: isPoop ? 1800 : 1400,
    });
  }

  // ── Cleaning stations ───────────────────────────────────────────────────────

  /**
   * Drive the cleaning stations.
   *  - Cleaner species (wrasse + shrimp) are assigned to stations (up to the
   *    station's capacity) and loiter there.
   *  - Client fish are pulled in, swim to the station, and WAIT until a cleaner
   *    that lives there is free, then get cleaned for 30s and released.
   *  - state.cleaningActive (fish actively being cleaned) feeds the harmony
   *    bonus, so an unstaffed station produces nothing.
   */
  _tickStations(dms, dt) {
    const stations = state.placedStations;
    this._activeCleanUids = this._activeCleanUids ?? new Set();
    this._activeCleanUids.clear();

    // Rolling cleans-per-minute (drives the harmony advisor's capacity advice).
    // Pruned every tick so it decays even when nothing is cleaning.
    const now = Date.now();
    this._cleanLog = this._cleanLog ?? [];
    while (this._cleanLog.length && this._cleanLog[0] < now - 60000) this._cleanLog.shift();
    state.cleansPerMin = this._cleanLog.length;

    if (stations.length === 0) { state.cleaningActive = 0; return; }

    const isCleaner = (f) => !!FISH_SPECIES[f.speciesId]?.cleaner;
    const offDuty   = (f) => f._offDutyUntil && f._offDutyUntil > now;

    this._assignTimer = (this._assignTimer ?? 0) - dms;
    const canAssign = this._assignTimer <= 0;
    if (canAssign) this._assignTimer = CLEANING_ASSIGN_INTERVAL;

    // Cleaners already homed to a station, and clients already booked anywhere
    const homedCleaners = new Set(stations.flatMap(s => s._cleaners ?? []));
    const bookedClients = new Set(stations.flatMap(s => (s._clients ?? []).map(c => c.fishUid)));

    let active = 0;
    for (const st of stations) {
      st._cleaners = (st._cleaners ?? []).filter(u => state.fish.some(f => f.uid === u));
      st._clients  = st._clients ?? [];
      const capacity = Math.max(1, Math.min(STATION_MAX_LEVEL, st.level ?? 1));
      const span = STATION_SPAN * TILE_SIZE;
      const ctrX = GRID_X + st.col * TILE_SIZE + span / 2;
      const ctrY = GRID_Y + st.row * TILE_SIZE + span / 2;

      // Send a cleaner off duty: unbind its client, start its cooldown.
      const dismiss = (uid) => {
        const f = state.fish.find(ff => ff.uid === uid);
        if (f) { f.endCleaning(); f._offDutyUntil = now + CLEANER_OFFDUTY_MS; }
        homedCleaners.delete(uid);
        const ix = st._cleaners.indexOf(uid);
        if (ix >= 0) st._cleaners.splice(ix, 1);
        st._clients.forEach(cl => { if (cl.cleanerUid === uid) { cl.phase = 'wait'; cl.cleanerUid = null; } });
      };

      // 1. Staff the station: recruit idle, on-duty cleaners to loiter here
      if (canAssign && st._cleaners.length < capacity) {
        const c = state.fish.find(f => isCleaner(f) && f.isIdle() && !offDuty(f) && !homedCleaners.has(f.uid));
        if (c) {
          c.startCleaning(ctrX + (Math.random() - 0.5) * span * 0.45,
                          ctrY + (Math.random() - 0.5) * span * 0.45);
          c._dutyTicks = 0; c._dutyCustomers = 0;
          st._cleaners.push(c.uid); homedCleaners.add(c.uid);
        }
      }
      const presentUids = st._cleaners.filter(u => {
        const f = state.fish.find(ff => ff.uid === u);
        return f && f.isBeingCleaned();   // arrived & sitting at the station
      });

      // 2. Advance / expire client slots (clean time counts in ticks)
      for (let i = st._clients.length - 1; i >= 0; i--) {
        const cl = st._clients[i];
        const f  = state.fish.find(ff => ff.uid === cl.fishUid);
        cl.age = (cl.age ?? 0) + dms;
        if (!f) { st._clients.splice(i, 1); bookedClients.delete(cl.fishUid); continue; }
        if (cl.phase === 'clean') {
          cl.ticksLeft -= dt;
          if (cl.ticksLeft <= 0) {
            const cf = state.fish.find(ff => ff.uid === cl.cleanerUid);   // credit the cleaner
            if (cf) cf._dutyCustomers = (cf._dutyCustomers ?? 0) + 1;
            f._cleanedUntil = now + CLEAN_COOLDOWN_MS;                     // rest before seeking again
            this._cleanLog.push(now);                                      // count toward cleans/min
            f.endCleaning(); st._clients.splice(i, 1); bookedClients.delete(cl.fishUid);
          }
        } else if (cl.age > 30000 && !f.isBeingCleaned()) {
          f.endCleaning(); st._clients.splice(i, 1); bookedClients.delete(cl.fishUid);  // never arrived
        }
      }

      // 3. Accept a new client (swims over and waits) — only if staffed at all
      if (canAssign && st._cleaners.length > 0 && st._clients.length < capacity) {
        const cand = state.fish.find(f =>
          !isCleaner(f) && f.isIdle() && !bookedClients.has(f.uid) &&
          !(f._cleanedUntil && f._cleanedUntil > now));
        if (cand) {
          cand.startCleaning(ctrX + (Math.random() - 0.5) * span * 0.5,
                             ctrY + (Math.random() - 0.5) * span * 0.5);
          st._clients.push({ fishUid: cand.uid, phase: 'wait', ticksLeft: CLEAN_DURATION_TICKS, age: 0, cleanerUid: null });
          bookedClients.add(cand.uid);
        }
      }

      // 4. Service: bind a free present cleaner to each arrived, waiting client
      const busy = new Set(st._clients.filter(c => c.phase === 'clean').map(c => c.cleanerUid));
      const freeCleanerUids = presentUids.filter(u => !busy.has(u));
      let fi = 0;
      for (const cl of st._clients) {
        if (cl.phase === 'clean') continue;
        const f = state.fish.find(ff => ff.uid === cl.fishUid);
        if (f && f.isBeingCleaned() && fi < freeCleanerUids.length) {
          cl.phase = 'clean';
          cl.ticksLeft = CLEAN_DURATION_TICKS;       // the 100-tick clean starts now
          cl.cleanerUid = freeCleanerUids[fi++];
        }
      }

      // 5. Tenure: accrue duty ticks; at 1000 ticks OR 5 customers, 1/3 to leave
      for (const u of presentUids) {
        const f = state.fish.find(ff => ff.uid === u);
        if (!f) continue;
        f._dutyTicks = (f._dutyTicks ?? 0) + dt;
        if (f._dutyTicks >= CLEANER_TENURE_TICKS || (f._dutyCustomers ?? 0) >= CLEANER_TENURE_CUSTOMERS) {
          f._dutyTicks = 0; f._dutyCustomers = 0;
          if (Math.random() < CLEANER_LEAVE_CHANCE) dismiss(u);
        }
      }

      // 6. Tally active cleanings for harmony + sparkles
      for (const cl of st._clients) {
        if (cl.phase === 'clean') { active++; this._activeCleanUids.add(cl.fishUid); }
      }
    }

    state.cleaningActive = active;
  }

  /** A small rising twinkle, reused from the particle pool. */
  _spawnSparkle(x, y) {
    const gfx = new Graphics();
    gfx.circle(0, 0, 1.6).fill(0xffffff);
    gfx.circle(0, 0, 3.2).fill({ color: 0xfff3b0, alpha: 0.35 });
    gfx.x = x;
    gfx.y = y;
    this._particleContainer.addChild(gfx);
    this._particles.push({
      gfx,
      type: 'sparkle',
      vx: (Math.random() - 0.5) * 0.2,
      vy: -(0.2 + Math.random() * 0.3),
      age: 0,
      life: 700,
    });
  }

  _updateParticles(dms) {
    if (this._particles.length === 0) return;
    const ds = dms / 16;
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.age += dms;
      p.gfx.x += p.vx * ds;
      p.gfx.y += p.vy * ds;
      // Farts expand and fade; poops just fall and fade
      if (p.type === 'fart') {
        const grow = 1 + p.age / p.life * 0.6;
        p.gfx.scale.set(grow);
      }
      p.gfx.alpha = 1 - p.age / p.life;
      if (p.age >= p.life) {
        this._particleContainer.removeChild(p.gfx);
        p.gfx.destroy();
        this._particles.splice(i, 1);
      }
    }
  }

  // ── Clam / ad ──────────────────────────────────────────────────────────────

  _onClamTap() {
    if (!canWatch()) return;
    recordInteraction();

    const rewards = collectAdReward();

    // Apply BE and pearl rewards immediately
    state.be     = Math.min(state.be + rewards.be, state.beMax ?? BE_MAX);
    state.pearls += rewards.pearls;
    unlockEntry('event:clam');
    if (rewards.pearls > 0) unlockEntry('resource:pearls');
    this._hud.showBonus(`+${rewards.be} 🫧  +${rewards.pearls} 💎`);

    // Spawn fish reward at a random reef position
    const spec = FISH_SPECIES[rewards.fishId];
    if (spec) {
      const col = 1 + Math.floor(Math.random() * 8);
      const row = 1 + Math.floor(Math.random() * 8);
      this._spawnFish(rewards.fishId, spec, col, row);
    }

    despawnClam();
    saveGame();

    // Show reward modal (informational — rewards already applied above)
    this._rewardModal.show(rewards, () => {});
  }

  // ── Save / restore ─────────────────────────────────────────────────────────

  _restoreFromSave(data) {
    // Restore resources (clamped to beMax once vaults are rebuilt below)
    state.be             = data.be ?? state.be;
    state.harmony        = data.harmony ?? state.harmony;
    state.level          = data.level   ?? state.level;
    state.pearls         = data.pearls  ?? state.pearls;
    state.polyps         = data.polyps  ?? 0;
    state.clamWatchCount = data.clamWatchCount ?? 0;
    state.clamWatchDate  = data.clamWatchDate  ?? '';
    state.quest   = data.quest   ?? null;
    state.event   = data.event   ?? null;
    state.account = data.account ?? null;
    state.profile = data.profile ?? null;
    state.harmonySmoothed = state.harmony;

    state.coralTypesSeen = new Set(data.coralTypesSeen ?? []);
    state.fishTypesSeen  = new Set(data.fishTypesSeen  ?? []);
    state.decorTypesSeen = new Set(data.decorTypesSeen ?? []);

    // Rebuild coral sprites
    let maxUid = 0;
    (data.placedCoral ?? []).forEach(({ uid, col, row, speciesId, level, pendingBE }) => {
      const spec = CORAL_SPECIES[speciesId];
      if (!spec || state.grid[row]?.[col] !== null) return;
      const lvl = coralLevel({ level });
      state.grid[row][col] = speciesId;
      state.placedCoral.push({ uid, col, row, speciesId, level: lvl, pendingBE: pendingBE ?? 0 });
      state.coralCount++;
      state.coralTierCounts[spec.tier]++;
      this._grid.placeCoral(spec, col, row, uid, lvl);
      if (uid > maxUid) maxUid = uid;
    });
    this._recomputeBeMax();
    state.be = Math.min(state.be, state.beMax);

    // Rebuild cleaning stations (claim their 2×2 footprints before decor)
    const placeStationAt = (col, row, uid, level) => {
      if (col + STATION_SPAN > GRID_COLS || row + STATION_SPAN > GRID_ROWS) return false;
      for (let r = row; r < row + STATION_SPAN; r++)
        for (let c = col; c < col + STATION_SPAN; c++)
          if (state.grid[r]?.[c] !== null) return false;
      const lvl = Math.max(1, Math.min(STATION_MAX_LEVEL, level ?? 1));
      for (let r = row; r < row + STATION_SPAN; r++)
        for (let c = col; c < col + STATION_SPAN; c++)
          state.grid[r][c] = STATION_CELL;
      state.placedStations.push({ uid, col, row, level: lvl });
      this._grid.placeStation(col, row, uid, lvl);
      if (uid > maxUid) maxUid = uid;
      return true;
    };
    (data.placedStations ?? []).forEach(({ uid, col, row, level }) =>
      placeStationAt(col, row, uid, level));

    // Rebuild decor sprites (migrate any legacy 1-tile cleaning decor → station)
    (data.placedDecor ?? []).forEach(({ uid, col, row, speciesId }) => {
      const spec = DECOR_SPECIES[speciesId];
      if (!spec) return;
      if (spec.cleaning) { placeStationAt(col, row, uid, 1); return; }  // legacy migration
      const cellId = state.grid[row]?.[col];
      if (spec.stackable) {
        // Allow on top of tall coral; reject if cell holds anything non-tall
        const cellCoral = cellId ? CORAL_SPECIES[cellId] : null;
        if (cellId !== null && !cellCoral?.tall) return;
      } else {
        if (cellId !== null) return;
        state.grid[row][col] = speciesId;
      }
      state.placedDecor.push({ uid, col, row, speciesId });
      this._grid.placeDecor(spec, col, row, uid);
      if (uid > maxUid) maxUid = uid;
    });

    // Respawn fish at their saved positions (legacy saves only have species,
    // so those fall back to a random spot).
    const fishEntries = data.fish
      ?? (data.fishTypes ?? []).map(id => ({ id, x: null, y: null }));
    fishEntries.forEach(({ id: speciesId, x, y }) => {
      const spec = FISH_SPECIES[speciesId];
      if (!spec) return;
      const uid  = state.nextUid();
      const col  = 2 + Math.floor(Math.random() * 6);
      const row  = 2 + Math.floor(Math.random() * 6);
      const fish = new Fish(spec, col, row, uid);
      if (typeof x === 'number' && typeof y === 'number') {
        fish.x = fish.targetX = x;
        fish.y = fish.targetY = y;
        fish.container.x = x;
        fish.container.y = y;
      }
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
      fish.container.on(IS_PORTRAIT ? 'pointerup' : 'pointerdown', (e) => {
        if (!state.removeMode || isTapSuppressed()) return;
        e.stopPropagation();
        this._removeFish(fish);
      });

      if (spec.layer === 'A') this._fishContainerA.addChild(fish.container);
      else                    this._fishContainerB.addChild(fish.container);
    });

    // Give every restored fish a home coral (respecting per-coral capacity)
    this._assignFishHomes();

    // Ensure UID counter doesn't collide with restored UIDs
    state._nextUid = Math.max(state._nextUid, maxUid + 1);

    // Backfill journal unlocks from restored save data
    unlockEntry(`biome:${state.biome}`);
    if (state.harmony > 0 || state.coralCount > 0) unlockEntry('resource:harmony');
    if (state.pearls > 0) unlockEntry('resource:pearls');
    state.coralTypesSeen.forEach(id => unlockEntry(`coral:${id}`));
    state.fishTypesSeen.forEach(id => unlockEntry(`fish:${id}`));
    if (state.quest?.status === 'active' || state.quest?.status === 'complete' || state.quest?.status === 'claimed') {
      unlockEntry('event:quest_accept');
    }
    if (state.quest?.status === 'complete' || state.quest?.status === 'claimed') {
      unlockEntry('event:quest_complete');
    }

    this._menu.updateLevel();

    // Compute passive income from the other biome's saved entities
    this._refreshPassiveIncome();

    // Re-evaluate snapshot quests now that coral/fish counts are restored
    checkSnapshotQuests();
    checkEventSnapshots();

    // Activate seasonal ambience for any in-progress event
    this._ambience?.refresh();

    // Spawn quest clam if today's quest is not yet claimed
    this._refreshQuestClam();
  }

  // ── Quest clam ─────────────────────────────────────────────────────────────

  _refreshQuestClam() {
    const status = getQuestStatus();

    // No clam needed if claimed or no quest
    if (!status || status === 'claimed') {
      this._removeQuestClam();
      return;
    }

    if (!this._questClamEntity) {
      // Spawn in the lower-left area so it doesn't overlap the ad clam
      const x = GRID_X + 60 + Math.random() * (GRID_W * 0.35);
      const y = GRID_Y + GRID_H * 0.60 + Math.random() * (GRID_H * 0.25);
      this._questClamEntity = new QuestClam(x, y, () => this._onQuestClamTap());
      this._questClamContainer.addChild(this._questClamEntity.container);
    }

    this._questClamEntity.setStatus(status);
  }

  _removeQuestClam() {
    if (!this._questClamEntity) return;
    this._questClamContainer.removeChild(this._questClamEntity.container);
    this._questClamEntity.container.destroy({ children: true });
    this._questClamEntity = null;
  }

  _onQuestClamTap() {
    this._questModal.show();
  }

  // ── Exclusive species grant (event pass tier reward) ───────────────────────

  _grantExclusiveSpecies(speciesId) {
    const fishSpec  = FISH_SPECIES[speciesId];
    const coralSpec = CORAL_SPECIES[speciesId];

    if (fishSpec) {
      const col = 1 + Math.floor(Math.random() * (GRID_COLS - 2));
      const row = 1 + Math.floor(Math.random() * (GRID_ROWS - 2));
      this._spawnFish(speciesId, fishSpec, col, row);
      this._hud.showBonus(`${fishSpec.name} unlocked! 🎉`);
    } else if (coralSpec) {
      // Find a free tile
      let placed = false;
      for (let attempt = 0; attempt < 40 && !placed; attempt++) {
        const col = Math.floor(Math.random() * GRID_COLS);
        const row = Math.floor(Math.random() * GRID_ROWS);
        if (state.grid[row][col] !== null) continue;
        const uid = state.nextUid();
        state.grid[row][col] = speciesId;
        state.placedCoral.push({ uid, col, row, speciesId, level: 1, pendingBE: 0 });
        state.coralCount++;
        state.coralTierCounts[coralSpec.tier]++;
        state.coralTypesSeen.add(speciesId);
        this._recomputeBeMax();
        this._grid.placeCoral(coralSpec, col, row, uid, 1);
        unlockEntry(`coral:${speciesId}`);
        checkSnapshotQuests();
        checkEventSnapshots();
        checkLevelUp();
        placed = true;
      }
      this._hud.showBonus(`${coralSpec.name} unlocked! 🎉`);
      saveGame();
    }
  }

  /** Compute BE/tick from all inactive biomes' saved coral and cache it in state. */
  _refreshPassiveIncome() {
    const inactive = getInactiveBiomesPlacedCoral();
    state.passiveBEPerTick = inactive.reduce((sum, { speciesId }) => {
      const spec = CORAL_SPECIES[speciesId];
      return sum + (spec ? (BE_PER_TICK[spec.tier] ?? 0) : 0);
    }, 0);
  }

  // ── Biome travel ───────────────────────────────────────────────────────────

  _travelToBiome(biome) {
    if (biome === state.biome) return;
    if (biome === 'seagrass'     && state.level < SEAGRASS_UNLOCK_LEVEL)      return;
    if (biome === 'deepTwilight' && state.level < DEEP_TWILIGHT_UNLOCK_LEVEL) return;

    // Save current biome state before leaving
    saveGame();

    // Remove all coral / decor / station sprites
    this._grid.clearAllCoral();
    this._grid.clearAllDecor();
    this._grid.clearAllStations();

    // Remove all fish sprites
    state.fish.forEach(f => {
      f.container.parent?.removeChild(f.container);
      f.container.destroy({ children: true });
    });

    // Reset biome-specific state
    state.grid         = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));
    state.placedCoral  = [];
    state.placedDecor  = [];
    state.placedStations = [];
    state.cleaningActive = 0;
    state.fish         = [];
    state.coralCount   = 0;
    state.fishCount    = 0;
    state.coralTierCounts = { common: 0, uncommon: 0, rare: 0, superRare: 0, epic: 0, legendary: 0, mythic: 0 };
    state.fishTierCounts  = { common: 0, uncommon: 0, rare: 0, superRare: 0, epic: 0, legendary: 0, mythic: 0 };
    state.fishLayerCounts = { A: 0, B: 0 };
    state.coralTypesSeen  = new Set();
    state.fishTypesSeen   = new Set();
    state.decorTypesSeen  = new Set();
    state.selectedType    = null;
    state.selectedId      = null;
    state.removeMode      = false;

    // Switch active biome
    state.biome = biome;
    setCurrentBiome(biome);
    unlockEntry(`biome:${biome}`);

    // Switch water color + background theme
    this.app.renderer.background.color = BIOMES[biome]?.bgColor ?? 0x1878c8;
    this._bg.setTheme(biome);

    // Load and restore the new biome's saved state
    const saved = loadGame();
    if (saved) this._restoreFromSave(saved);

    // Rebuild placement menu for new biome
    this._menu.rebuild();
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
