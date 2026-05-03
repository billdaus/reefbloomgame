import { Container, ColorMatrixFilter } from 'pixi.js';
import { state } from '../state.js';
import { CORAL_SPECIES, FISH_SPECIES, DECOR_SPECIES, GRID_ROWS, GRID_COLS, SEAGRASS_UNLOCK_LEVEL, DEEP_TWILIGHT_UNLOCK_LEVEL, BE_PER_TICK, BIOMES, PANEL_X, PANEL_Y, PANEL_W, SCREEN_W, SCREEN_H, BE_MAX, GRID_X, GRID_Y, GRID_W, GRID_H } from '../constants.js';
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
  spendForDecor, refundDecor,
  recordInteraction, refundCoral, refundFish,
} from '../systems/BEEconomy.js';
import { initQuests, recordQuestEvent, checkSnapshotQuests, getQuestStatus } from '../systems/QuestSystem.js';
import { initEventSystem, recordEventProgress, checkEventSnapshots, recordQuestClaimed } from '../systems/EventSystem.js';
import { initJournal, unlockEntry } from '../systems/JournalSystem.js';
import { updateHarmonyFilter } from '../systems/HarmonySystem.js';
import { initLevelSystem, checkLevelUp } from '../systems/LevelSystem.js';
import { initClamSystem, tickClamSystem, canWatch, collectAdReward, despawnClam } from '../systems/ClamSystem.js';
import { Clam } from '../entities/Clam.js';
import { QuestClam } from '../entities/QuestClam.js';
import { ClamRewardModal }    from '../ui/ClamRewardModal.js';
import { PearlShopModal }     from '../ui/PearlShopModal.js';
import { DailyQuestModal }    from '../ui/DailyQuestModal.js';
import JournalModal           from '../ui/JournalModal.js';
import { AccountModal }       from '../ui/AccountModal.js';
import { EventModal }         from '../ui/EventModal.js';
import { tileCenter } from '../utils/grid.js';
import { saveGame, loadGame, setCurrentBiome, getInactiveBiomesPlacedCoral } from '../save.js';

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

    // ── Clam ─────────────────────────────────────────────────────────────────
    this._clamContainer = new Container();
    this._clamEntity    = null;

    // ── Quest clam ────────────────────────────────────────────────────────────
    this._questClamContainer = new Container();
    this._questClamEntity    = null;

    // ── Layers ───────────────────────────────────────────────────────────────
    this._bg         = new BackgroundLayer();
    this._grid       = new GridLayer((tile) => this._onTileTap(tile));
    this._foreground = new ForegroundLayer();

    // ── Bubbles drone ────────────────────────────────────────────────────────
    this._bubbles = new Bubbles();

    // ── Seasonal ambience (petals / motes / sparkles) ─────────────────────────
    this._ambience = new SeasonalAmbience();

    // ── Depth-correct render order ───────────────────────────────────────────
    // 1. Background
    this.worldContainer.addChild(this._bg.container);
    // 2. Grid floor + lines + input
    this.worldContainer.addChild(this._grid.container);
    // 2b. Decor — static aesthetic props on the floor, below coral and fish
    this.worldContainer.addChild(this._grid.decorContainer);
    // 3. Short/flat coral — fish Layer A swims over these
    this.worldContainer.addChild(this._grid.shortCoralContainer);
    // 3b. Clam + quest clam sit on the reef floor (above short coral, below fish)
    this.worldContainer.addChild(this._clamContainer);
    this.worldContainer.addChild(this._questClamContainer);
    // 4. Fish Layer A (clownfish, chromis, butterflyfish, seahorse)
    this.worldContainer.addChild(this._fishContainerA);
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
    // 9. Tile hover highlight (always topmost in world)
    this.worldContainer.addChild(this._grid.hoverContainer);

    // ── UI (no saturation filter) ────────────────────────────────────────────
    this._uiContainer   = new Container();
    this._rewardModal   = new ClamRewardModal();
    this._shopModal     = new PearlShopModal();
    this._journalModal  = new JournalModal();
    this._accountModal  = new AccountModal();
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
    );
    this._menu = new PlacementMenu(
      (id) => this._onCoralSelected(id),
      (id) => this._onFishSelected(id),
      (id) => this._onDecorSelected(id),
    );

    this._uiContainer.addChild(this._menu.container);
    this._uiContainer.addChild(this._hud.container);
    this._uiContainer.addChild(this._rewardModal.container);
    this._uiContainer.addChild(this._shopModal.container);
    this._uiContainer.addChild(this._questModal.container);
    this._uiContainer.addChild(this._journalModal.container);
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
      if (newBE >= BE_MAX) unlockEntry('event:be_max');
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

    // ── Restore save ─────────────────────────────────────────────────────────
    const saved = loadGame();
    if (saved) this._restoreFromSave(saved);

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
  _onDecorSelected() { this._grid.refreshHover(); }

  _onTileTap(tile) {
    recordInteraction();
    const { col, row } = tile;

    // Remove mode: tap occupant to remove it (coral or decor)
    if (state.removeMode) {
      if (state.placedDecor.some(d => d.col === col && d.row === row)) {
        this._tryRemoveDecor(col, row);
      } else {
        this._tryRemoveCoral(col, row);
      }
      return;
    }

    const { selectedType, selectedId } = state;
    if (!selectedType || !selectedId) return;

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
    const spent = spec.pearlCost ? spendForCoralPearl(speciesId) : spendForCoral(speciesId);
    if (!spent) return;

    const uid = state.nextUid();
    state.grid[row][col] = speciesId;
    state.placedCoral.push({ uid, col, row, speciesId });
    state.coralCount++;
    state.coralTierCounts[spec.tier]++;
    state.coralTypesSeen.add(speciesId);

    this._grid.placeCoral(spec, col, row, uid);

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

  _tryPlaceDecor(col, row, speciesId) {
    if (state.grid[row][col] !== null) return;
    const spec = DECOR_SPECIES[speciesId];
    if (!spec || spec.unlockLevel > state.level) return;
    if (!spendForDecor(speciesId)) return;

    const uid = state.nextUid();
    state.grid[row][col] = speciesId;
    state.placedDecor.push({ uid, col, row, speciesId });
    state.decorTypesSeen.add(speciesId);

    this._grid.placeDecor(spec, col, row, uid);
    saveGame();
  }

  _trySpawnFish(col, row, speciesId) {
    const spec = FISH_SPECIES[speciesId];
    if (!spec || spec.unlockLevel > state.level) return;
    const spent = spec.pearlCost ? spendForFishPearl(speciesId) : spendForFish(speciesId);
    if (!spent) return;
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

    unlockEntry(`fish:${speciesId}`);

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

    // Remove sprite
    this._grid.removeCoral(entry.uid);

    if (refund > 0) this._hud.showBonus(`+${refund} 🫧`);
    unlockEntry('event:remove');

    saveGame();
  }

  _tryRemoveDecor(col, row) {
    const idx = state.placedDecor.findIndex(d => d.col === col && d.row === row);
    if (idx === -1) return;
    const entry = state.placedDecor[idx];

    const refund = refundDecor(entry.speciesId);

    state.grid[row][col] = null;
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

    if (refund > 0) this._hud.showBonus(`+${refund} 🫧`);
    unlockEntry('event:remove');

    saveGame();
  }

  // ── Clam / ad ──────────────────────────────────────────────────────────────

  _onClamTap() {
    if (!canWatch()) return;
    recordInteraction();

    const rewards = collectAdReward();

    // Apply BE and pearl rewards immediately
    state.be     = Math.min(state.be + rewards.be, BE_MAX);
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
    // Restore resources
    state.be             = Math.min(data.be ?? state.be, BE_MAX);
    state.harmony        = data.harmony ?? state.harmony;
    state.level          = data.level   ?? state.level;
    state.pearls         = data.pearls  ?? state.pearls;
    state.clamWatchCount = data.clamWatchCount ?? 0;
    state.clamWatchDate  = data.clamWatchDate  ?? '';
    state.quest   = data.quest   ?? null;
    state.event   = data.event   ?? null;
    state.account = data.account ?? null;
    state.harmonySmoothed = state.harmony;

    state.coralTypesSeen = new Set(data.coralTypesSeen ?? []);
    state.fishTypesSeen  = new Set(data.fishTypesSeen  ?? []);
    state.decorTypesSeen = new Set(data.decorTypesSeen ?? []);

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

    // Rebuild decor sprites
    (data.placedDecor ?? []).forEach(({ uid, col, row, speciesId }) => {
      const spec = DECOR_SPECIES[speciesId];
      if (!spec || state.grid[row]?.[col] !== null) return;
      state.grid[row][col] = speciesId;
      state.placedDecor.push({ uid, col, row, speciesId });
      this._grid.placeDecor(spec, col, row, uid);
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
        state.placedCoral.push({ uid, col, row, speciesId });
        state.coralCount++;
        state.coralTierCounts[coralSpec.tier]++;
        state.coralTypesSeen.add(speciesId);
        this._grid.placeCoral(coralSpec, col, row, uid);
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

    // Remove all coral sprites
    this._grid.clearAllCoral();
    this._grid.clearAllDecor();

    // Remove all fish sprites
    state.fish.forEach(f => {
      f.container.parent?.removeChild(f.container);
      f.container.destroy({ children: true });
    });

    // Reset biome-specific state
    state.grid         = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));
    state.placedCoral  = [];
    state.placedDecor  = [];
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
