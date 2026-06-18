import {
  EXTRACT_TIME,
  pointInRect,
  rollLoot,
  formatTime,
  dist,
  setMapBounds,
} from './map-core.js';
import { loadMap } from './map-loader.js';
import { Input, Player, Scav, Bullet, LootPoint, PlayerCorpse, SmokeZone, GroundItem, drawMap } from './entities.js';
import { RAID_MODES } from './profile.js';
import { drawMinimap } from './minimap.js';
import { GameFx } from './fx.js';
import { getMuzzleOffset } from './weapons.js';
import { getMapTheme } from './map-atmosphere.js';
import { canSeePoint } from './visibility.js';
import { loadSettings, CONTROL_BINDINGS } from './settings.js';
import { lootTotalValue } from './inventory-core.js';
import { RaidInventoryUI, itemIcon, slotItemHint } from './inventory-ui.js';

const INTERACT_RADIUS = 50;
const SEARCH_TIME = 1.8;

export class Game {
  constructor(canvas, ui, confetti = null, audio = null, fx = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui;
    this.confetti = confetti;
    this.audio = audio;
    this.fx = fx || new GameFx();
    this.input = new Input(canvas);
    this.state = 'menu';
    this.scale = 1;
    this.camX = 0;
    this.camY = 0;
    this.camRenderX = 0;
    this.camRenderY = 0;
    this.statusTimer = 0;
    this.lastTime = 0;
    this.animTime = 0;
    this.raidTimeLeft = 300;
    this.bullets = [];
    this.lootPoints = [];
    this.scavs = [];
    this.player = null;
    this.activeMap = null;
    this.extracting = false;
    this.endPayload = null;
    this.wasReloading = false;
    this.lastExtractTick = -1;
    this.nearestInteract = null;
    this.emptyClickCooldown = 0;
    this.raidMode = 'standard';
    this.noiseEvents = [];
    this.smokeZones = [];
    this.playerCorpse = null;
    this.grenadeCooldown = 0;
    this.searchSoundTimer = 0;
    this.wasInExtract = false;
    this.scavAlerted = new Set();
    this.playerMoving = false;
    this.groundItems = [];
    this.settings = loadSettings();
    this._hudCache = '';
    this.settingsOpen = false;
    this.inventoryUi = new RaidInventoryUI(this);
  }

  async startRaid(mode = 'standard', loadout = {}, mapId = 'factory') {
    this.audio?.unlock('raid');
    this.audio?.startMusic('raid');
    this.fx.clear();
    this.raidMode = mode;
    const modeConfig = RAID_MODES[mode] || RAID_MODES.standard;
    this.activeMap = await loadMap(mapId);
    setMapBounds(this.activeMap.mapW, this.activeMap.mapH);
    this.state = 'raid';
    this.raidTimeLeft = modeConfig.duration;
    this.bullets = [];
    const walls = this.activeMap.walls;
    this.player = new Player(this.activeMap.spawnPlayer.x, this.activeMap.spawnPlayer.y, walls, 'pm');
    this.player.initRaidInventory(loadout);
    this.lootPoints = this.activeMap.lootPoints.map((p) => new LootPoint(p.x, p.y, p.tier));
    this.scavs = this.activeMap.scavSpawns.map((s) => new Scav(s.x, s.y, walls));
    if (mode === 'boss' && this.activeMap.bossSpawn) {
      const boss = new Scav(this.activeMap.bossSpawn.x, this.activeMap.bossSpawn.y, walls, { isBoss: true });
      boss.loot = [
        { id: 'gpu', name: 'Видеокарта', value: 15, uid: 'boss-gpu' },
        { id: 'chain', name: 'Золотая цепь', value: 10, uid: 'boss-chain' },
        { id: 'ak', name: 'АК-74', value: 20, weapon: 'ak', uid: 'boss-ak' },
      ];
      this.scavs.push(boss);
    }
    this.smokeZones = [];
    this.groundItems = [];
    this.playerCorpse = null;
    this.noiseEvents = [];
    this.scavAlerted = new Set();
    this.wasInExtract = false;
    this.searchSoundTimer = 0;
    this.extracting = false;
    this.endPayload = null;
    this.ui.showHud();
    this.ui.hideOverlay();
    this.ui.hideEnd();
    document.getElementById('lobby-screen')?.classList.add('hidden');
    document.getElementById('auth-screen')?.classList.add('hidden');
    this._hudCache = '';
    this.inventoryUi?.toggle(false);
    this.resize();
  }

  applySettings(settings) {
    this.settings = settings;
    this.audio?.applySettings(settings);
  }

  toggleSettings() {
    this.settingsOpen = !this.settingsOpen;
    const el = document.getElementById('settings-modal');
    if (el) el.classList.toggle('hidden', !this.settingsOpen);
    if (this.settingsOpen) this.ui.renderSettings?.(this.settings);
  }

  setStatus(msg, duration = 2, kind = '') {
    this.statusTimer = duration;
    this.ui.setStatus(msg, kind);
  }

  emitNoise(x, y, level) {
    const radius = 80 + level * 200;
    this.noiseEvents.push({ x, y, radius, life: 2 });
    this.fx.noiseRipple(x, y, radius * 0.5);
  }

  update(dt) {
    if (this.state !== 'raid') return;

    if (this.input.tapped('Escape')) {
      this.toggleSettings();
      this.input.endFrame();
      return;
    }
    if (this.settingsOpen) {
      this.input.endFrame();
      return;
    }

    if (this.input.tapped('Tab') || this.input.tapped('KeyI')) {
      this.inventoryUi.toggle();
    }

    const combat = !this.inventoryUi.open;

    this.raidTimeLeft -= dt;
    if (this.raidTimeLeft <= 0) {
      this.endRaid('mia', 'Время вышло — MIA', 'Ты не успел на экстракт.');
      return;
    }

    if (this.statusTimer > 0) {
      this.statusTimer -= dt;
      if (this.statusTimer <= 0) this.ui.setStatus('');
    }

    this.noiseEvents = this.noiseEvents.filter((n) => {
      n.life -= dt;
      return n.life > 0;
    });
    this.smokeZones = this.smokeZones.filter((s) => {
      s.update(dt);
      return s.life > 0;
    });
    this.grenadeCooldown -= dt;
    this.searchSoundTimer -= dt;

    const p = this.player;
    this.emptyClickCooldown -= dt;
    this.playerMoving = false;

    if (!p.dead) {
      if (this.input.tapped('KeyF')) {
        const heal = p.useSelectedSlot();
        if (heal.ok) {
          this.audio?.play('medkit');
          this.fx.healGlow(p.x, p.y);
          this.fx.floatText(p.x, p.y - 20, heal.msg, '#2ecc71');
          this.setStatus(heal.msg, 1.5, 'heal');
          this._hudCache = '';
          if (this.inventoryUi.open) this.inventoryUi.render();
        } else if (heal.msg) {
          this.setStatus(heal.msg, 1.2, 'fail');
        }
      }
      if (this.input.tapped('KeyG') && this.grenadeCooldown <= 0) {
        const g = p.useSelectedGrenade();
        if (g.ok) {
          this.grenadeCooldown = 1;
          this.emitNoise(p.x, p.y, 1);
          this.audio?.play('grenade');
          this.fx.explosion(p.x + Math.cos(p.angle) * 40, p.y + Math.sin(p.angle) * 40, 100);
          for (const scav of this.scavs) {
            if (scav.dead) continue;
            if (dist(p.x, p.y, scav.x, scav.y) < 100) scav.takeDamage(45);
          }
          this.setStatus('Граната!', 1.5, 'combat');
          this._hudCache = '';
          if (this.inventoryUi.open) this.inventoryUi.render();
        } else if (g.msg) {
          this.setStatus(g.msg, 1.2, 'fail');
        }
      }
      if (this.input.tapped('KeyV')) {
        const s = p.useSelectedSmoke();
        if (s.ok) {
          this.smokeZones.push(new SmokeZone(p.x, p.y));
          this.audio?.play('smoke');
          this.fx.smokePuff(p.x, p.y);
          this.setStatus(s.msg, 1.5, 'combat');
          this._hudCache = '';
          if (this.inventoryUi.open) this.inventoryUi.render();
        } else if (s.msg) {
          this.setStatus(s.msg, 1.2, 'fail');
        }
      }
      if (this.input.tapped('KeyQ')) {
        const drop = p.dropSelected();
        if (drop.ok && drop.item) {
          const dx = Math.cos(p.angle) * 28;
          const dy = Math.sin(p.angle) * 28;
          this.groundItems.push(new GroundItem(p.x + dx, p.y + dy, drop.item));
          this.audio?.play('loot');
          this.fx.floatText(p.x, p.y - 20, drop.msg, '#a8b89a');
          this._hudCache = '';
          if (this.inventoryUi.open) this.inventoryUi.render();
        } else if (!drop.ok) {
          this.setStatus(drop.msg, 1.5, 'fail');
        }
      }

      const reloading = p.reloadTime > 0;
      if (this.input.tapped('KeyR') && p.ammo < p.magSize && p.reserve > 0 && p.reloadTime <= 0) {
        this.audio?.play('reload');
        this.fx.floatText(p.x, p.y - 24, 'Перезарядка…', '#f5e6a8');
      }
      if (this.wasReloading && !reloading && p.ammo > 0) this.audio?.play('reloadDone');
      this.wasReloading = reloading;

      const movedBefore = { x: p.x, y: p.y };
      const shot = p.update(this.input, dt, combat);
      if (p.x !== movedBefore.x || p.y !== movedBefore.y) {
        this.playerMoving = true;
        if (p.isSprinting) this.fx.footDust(p.x, p.y);
      }
      if (this.playerMoving) this.audio?.tickFootsteps(dt, p.isSprinting);

      if (shot) {
        const bullets = shot.bullets || (Array.isArray(shot) ? shot : [shot]);
        this.bullets.push(...bullets);
        this.audio?.play('shoot', { weapon: p.weaponId });
        const muzzle = getMuzzleOffset(p.weaponId);
        const mx = p.x + Math.cos(p.angle) * muzzle.x;
        const my = p.y + Math.sin(p.angle) * muzzle.x;
        const flashColor = shot.muzzleColor || '#ffe08a';
        const flashSize = p.weaponId === 'shotgun' ? 1.4 : p.weaponId === 'ak' ? 1.1 : 0.9;
        this.fx.muzzleFlash(mx, my, p.angle, flashColor, flashSize);
        if (shot.recoilKick) this.fx.kickCamera(shot.recoilKick, p.angle);
        if (shot.shellEject) this.fx.shellCasing(p.x, p.y, p.angle);
        if (p.noiseLevel > 0.5) this.emitNoise(p.x, p.y, p.noiseLevel);
      } else if (
        combat &&
        this.input.mouse.justDown &&
        p.canShoot() &&
        p.fireBlockedReason &&
        this.emptyClickCooldown <= 0
      ) {
        this.setStatus(p.fireBlockedReason, 1.2, 'fail');
        this.emptyClickCooldown = 0.4;
      } else if (
        combat &&
        this.input.mouse.down &&
        !p.canShoot() &&
        p.reloadTime <= 0 &&
        this.emptyClickCooldown <= 0
      ) {
        this.setStatus(p.getSlotActionHint(), 1.2, 'fail');
        this.emptyClickCooldown = 0.45;
      } else if (this.input.mouse.down && p.ammo <= 0 && p.canShoot() && p.reloadTime <= 0 && p.fireCooldown <= 0 && this.emptyClickCooldown <= 0) {
        this.audio?.play('empty');
        this.emptyClickCooldown = 0.35;
        this.fx.muzzleFlash(p.x + Math.cos(p.angle) * 18, p.y + Math.sin(p.angle) * 18, p.angle, '#888');
      } else if (p.noiseLevel > 0 && p.noiseLevel < 0.5) {
        this.emitNoise(p.x, p.y, 0.3);
      }

      this.handleInteract(dt);
      this.handleExtract(dt);
    }

    for (const scav of this.scavs) {
      const wasAttack = scav.state === 'attack';
      const b = scav.update(dt, p, this.bullets, this.noiseEvents);
      if (!wasAttack && scav.state === 'attack' && !this.scavAlerted.has(scav)) {
        this.scavAlerted.add(scav);
        this.audio?.play('alert');
        this.fx.floatText(scav.x, scav.y - 28, '!', '#ff6b6b');
      }
      if (b) {
        this.bullets.push(b);
        this.audio?.play('shootEnemy');
        this.fx.muzzleFlash(
          scav.x + Math.cos(scav.angle) * 18,
          scav.y + Math.sin(scav.angle) * 18,
          scav.angle,
          '#ff8888'
        );
      }
    }

    this.updateBullets(dt);

    if (p.dead && !this.playerCorpse) {
      this.playerCorpse = new PlayerCorpse(p.x, p.y, p.getCarriedLoot());
      this.audio?.play('death');
      this.fx.bloodBurst(p.x, p.y);
      this.endRaid('dead', 'ТЫ ПОГИБ', 'PMC уничтожен. Лут остался на карте.');
    }

    this.fx.update(dt);

    this.updateCamera();
    this.ui.updateHud(this);
    if (this.inventoryUi.open) this.inventoryUi.render();
    this.input.endFrame();
  }

  canSee(wx, wy) {
    const p = this.player;
    if (!p || p.dead || !this.activeMap) return false;
    const theme = getMapTheme(this.activeMap.theme);
    return canSeePoint(p.x, p.y, wx, wy, p.angle, this.activeMap.walls, theme);
  }

  findNearestInteractable() {
    const p = this.player;
    let best = null;
    let bestDist = Infinity;

    if (this.playerCorpse && !this.playerCorpse.looted) {
      const d = dist(p.x, p.y, this.playerCorpse.x, this.playerCorpse.y);
      if (d < INTERACT_RADIUS && this.canSee(this.playerCorpse.x, this.playerCorpse.y)) {
        best = { type: 'pmc', target: this.playerCorpse, x: this.playerCorpse.x, y: this.playerCorpse.y, d };
      }
    }

    for (const scav of this.scavs) {
      if (!scav.dead || scav.looted) continue;
      const d = dist(p.x, p.y, scav.x, scav.y);
      if (d < INTERACT_RADIUS && d < (best?.d ?? Infinity) && this.canSee(scav.x, scav.y)) {
        best = { type: 'corpse', target: scav, x: scav.x, y: scav.y, d };
      }
    }

    for (const lp of this.lootPoints) {
      if (lp.searched) continue;
      const d = dist(p.x, p.y, lp.x, lp.y);
      if (d < INTERACT_RADIUS && d < (best?.d ?? Infinity) && this.canSee(lp.x, lp.y)) {
        best = { type: 'loot', target: lp, x: lp.x, y: lp.y, d };
      }
    }

    for (const gi of this.groundItems) {
      const d = dist(p.x, p.y, gi.x, gi.y);
      if (d < INTERACT_RADIUS && d < (best?.d ?? Infinity) && this.canSee(gi.x, gi.y)) {
        best = { type: 'ground', target: gi, x: gi.x, y: gi.y, d };
      }
    }

    return best;
  }

  handleInteract(dt) {
    const p = this.player;
    const near = this.findNearestInteractable();
    this.nearestInteract = near;

    for (const lp of this.lootPoints) {
      lp.searching = near?.type === 'loot' && near.target === lp && this.input.pressed('KeyE');
    }

    if (!near || !this.input.pressed('KeyE')) {
      if (near?.type === 'loot') near.target.progress = 0;
      if (near?.type === 'corpse') near.target.searchProgress = 0;
      if (near?.type === 'pmc') near.target.searchProgress = 0;
      if (near?.type === 'ground') near.target.pickupProgress = 0;
      return;
    }

    if (near.type === 'ground') {
      near.target.pickupProgress = (near.target.pickupProgress || 0) + dt / 0.6;
      if (near.target.pickupProgress < 1) return;
      const result = p.addLoot(near.target.item);
      if (result.ok) {
        this.groundItems = this.groundItems.filter((g) => g !== near.target);
        this.audio?.play('loot');
        this.fx.lootSparkle(near.x, near.y);
        this._hudCache = '';
        if (this.inventoryUi.open) this.inventoryUi.render();
        this.setStatus(result.msg, 2, 'loot');
      } else {
        this.audio?.play('fail');
        this.setStatus(result.msg, 2, 'fail');
      }
      return;
    }

    if (this.searchSoundTimer <= 0) {
      this.audio?.play('search');
      this.searchSoundTimer = 0.45;
    }

    const progKey = near.type === 'loot' ? 'progress' : 'searchProgress';
    near.target[progKey] = (near.target[progKey] || 0) + dt / SEARCH_TIME;
    if (near.target[progKey] < 1) return;

    if (near.type === 'loot') {
      near.target.searched = true;
      near.target.searching = false;
      near.target.progress = 0;
      const item = rollLoot(near.target.tier);
      const result = p.addLoot(item);
      if (result.ok && item.id !== 'empty') {
        this.audio?.play('loot');
        this.fx.lootSparkle(near.x, near.y);
        this.fx.floatText(near.x, near.y - 20, result.msg, '#5dade2');
        if (item.weapon) this.audio?.play('equip');
      } else if (!result.ok) {
        this.audio?.play('fail');
      }
      this.setStatus(result.msg, 2.5, result.ok ? 'loot' : 'fail');
      this._hudCache = '';
      if (this.inventoryUi.open) this.inventoryUi.render();
      return;
    }

    if (near.type === 'corpse' || near.type === 'pmc') {
      const corpse = near.target;
      corpse.looted = true;
      corpse.searchProgress = 0;
      const msgs = [];
      for (const item of corpse.loot) {
        const result = p.addLoot(item);
        if (result.ok) {
          msgs.push(result.msg);
          if (item.weapon) this.audio?.play('equip');
        }
      }
      this.audio?.play('loot');
      this.fx.lootSparkle(near.x, near.y);
      const label = near.type === 'pmc' ? 'PMC' : 'Scav';
      this.setStatus(msgs.length ? `Обыск ${label}: ${msgs.join(', ')}` : 'Пусто', 3, 'loot');
      this._hudCache = '';
      if (this.inventoryUi.open) this.inventoryUi.render();
    }
  }

  handleExtract(dt) {
    const p = this.player;
    const zone = this.activeMap?.extractZone;
    if (!zone) return;
    const inside = pointInRect(p.x, p.y, zone);

    if (inside) {
      if (!this.wasInExtract) {
        this.audio?.play('extractZone');
        this.wasInExtract = true;
      }
      p.extractProgress += dt;
      this.extracting = true;
      const tick = Math.floor(p.extractProgress);
      if (tick > this.lastExtractTick) {
        this.lastExtractTick = tick;
        this.audio?.play('extract');
        this.fx.extractPulse(p.x, p.y);
      }
      if (p.extractProgress >= EXTRACT_TIME) {
        const value = p.getLootValue();
        this.endRaid('extracted', 'РЕЙД УСПЕШЕН', `Убийств: ${p.kills}. Лут: ${value}₽`, true);
      }
    } else {
      p.extractProgress = 0;
      this.extracting = false;
      this.lastExtractTick = -1;
      this.wasInExtract = false;
    }
  }

  updateBullets(dt) {
    const p = this.player;
    for (const b of this.bullets) {
      if (b.dead) continue;
      b.update(dt);
      if (b.dead) {
        if (b.hitWall) {
          this.audio?.play('wallHit');
          this.fx.wallHit(b.hitX, b.hitY);
        }
        continue;
      }

      if (b.owner === 'player') {
        for (const scav of this.scavs) {
          if (scav.dead) continue;
          if (dist(b.x, b.y, scav.x, scav.y) < scav.r + b.r) {
            scav.takeDamage(b.damage);
            b.dead = true;
            this.fx.hitSparks(b.x, b.y);
            this.audio?.play('hit');
            if (scav.dead) {
              if (!scav.loot?.length) scav.onDeath();
              p.kills += 1;
              this.audio?.play('kill');
              this.fx.bloodBurst(scav.x, scav.y);
              this.setStatus(scav.isBoss ? 'Босс убит!' : 'Scav убит — E обыск', 2, 'combat');
            }
            break;
          }
        }
      } else if (b.owner === 'scav' && !p.dead) {
        let inSmoke = false;
        for (const s of this.smokeZones) {
          if (dist(b.x, b.y, s.x, s.y) < s.r) inSmoke = true;
        }
        if (!inSmoke && dist(b.x, b.y, p.x, p.y) < p.r + b.r) {
          const armorBefore = p.armor;
          p.takeDamage(b.damage);
          b.dead = true;
          this.fx.hitSparks(b.x, b.y);
          if (armorBefore > p.armor) this.audio?.play('hitArmor');
          else this.audio?.play('hit');
          this.fx.damageScreen(b.damage);
          this.fx.floatText(p.x, p.y - 18, `-${b.damage}`, '#ff6b6b');
        }
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
  }

  endRaid(type, title, desc, survived = false) {
    this.state = 'ended';
    this.inventoryUi?.toggle(false);
    const p = this.player;
    const loot = survived ? p.getCarriedLoot() : [];
    const lootValue = lootTotalValue(loot);
    const lootCount = loot.length;
    this.endPayload = {
      type,
      title,
      desc,
      loot,
      lootValue,
      kills: p.kills,
      mode: this.raidMode,
      mapId: this.activeMap?.id,
      saveHint:
        type === 'extracted'
          ? `После «В лобби» ${lootCount} предм. попадут в схрон, +${lootValue}₽ на счёт`
          : type === 'dead'
            ? 'Рюкзак потерян. Лут остаётся только у убитых Scav (E) и на точках поиска'
            : 'Рюкзак не сохранён — нужен успешный экстракт',
    };
    this.ui.showEnd(this.endPayload);
    this.ui.hideHud();
    this.audio?.playRaidEnd(type === 'extracted');
    const musicDelay = type === 'extracted' ? 2800 : 1600;
    setTimeout(() => this.audio?.startMusic('lobby'), musicDelay);
    if (type === 'extracted' && this.confetti) this.confetti.burst(150);
  }

  getEndPayload() {
    return this.endPayload;
  }

  updateCamera() {
    if (!this.player || !this.activeMap) return;
    const mapW = this.activeMap.mapW;
    const mapH = this.activeMap.mapH;
    const viewW = this.canvas.width / this.scale;
    const viewH = this.canvas.height / this.scale;
    this.camX = Math.max(0, Math.min(mapW - viewW, this.player.x - viewW / 2));
    this.camY = Math.max(0, Math.min(mapH - viewH, this.player.y - viewH / 2));
    this.camRenderX = Math.max(0, Math.min(mapW - viewW, this.camX + (this.fx.camKickX || 0)));
    this.camRenderY = Math.max(0, Math.min(mapH - viewH, this.camY + (this.fx.camKickY || 0)));
    this.input.updateWorld(this.camX, this.camY, this.scale, this.canvas);
  }

  resize() {
    const maxW = Math.min(window.innerWidth, 1280);
    const maxH = Math.min(window.innerHeight - 60, 900);
    const w = Math.max(640, Math.floor(maxW));
    const h = Math.max(480, Math.floor(maxH));
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.scale = this.state === 'raid' ? 1.35 : 1;
    if (this.player) this.updateCamera();
  }

  drawInteractHint(ctx) {
    const near = this.nearestInteract;
    if (!near || this.state !== 'raid' || !this.canSee(near.x, near.y)) return;
    const labels = { corpse: 'E — обыск Scav', loot: 'E — поиск лута', pmc: 'E — обыск тела', ground: 'E — подобрать' };
    const label = labels[near.type];
    ctx.font = '12px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    const tw = ctx.measureText(label).width + 16;
    ctx.fillRect(near.x - tw / 2, near.y - 42, tw, 20);
    ctx.fillStyle = '#7ec8ff';
    ctx.fillText(label, near.x, near.y - 28);
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d0f0c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.state === 'menu') return;

    ctx.setTransform(this.scale, 0, 0, this.scale, -this.camRenderX * this.scale, -this.camRenderY * this.scale);
    drawMap(ctx, this.animTime, this.activeMap);
    for (const s of this.smokeZones) {
      if (this.canSee(s.x, s.y)) s.draw(ctx);
    }
    for (const lp of this.lootPoints) {
      if (this.canSee(lp.x, lp.y)) lp.draw(ctx);
    }
    for (const scav of this.scavs) {
      if (this.canSee(scav.x, scav.y)) scav.draw(ctx);
    }
    if (this.playerCorpse && this.canSee(this.playerCorpse.x, this.playerCorpse.y)) {
      this.playerCorpse.draw(ctx);
    }
    for (const gi of this.groundItems) {
      if (this.canSee(gi.x, gi.y)) gi.draw(ctx);
    }
    for (const b of this.bullets) {
      if (this.canSee(b.x, b.y)) b.draw(ctx);
    }
    this.fx.drawWorld(ctx);
    this.fx.drawRaidFog(ctx, this);
    if (this.player && !this.player.dead) this.player.draw(ctx);
    this.drawInteractHint(ctx);

    if (this.extracting && this.player) {
      ctx.fillStyle = 'rgba(46, 204, 113, 0.85)';
      ctx.font = '14px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText(`ЭКСТРАКТ ${Math.ceil(EXTRACT_TIME - this.player.extractProgress)}с`, this.player.x, this.player.y - 28);
    }

    drawMinimap(ctx, this);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.fx.drawScreen(ctx, this.canvas.width, this.canvas.height, {
      raid: this.state === 'raid',
      time: this.animTime,
      fogTint: this.activeMap ? getMapTheme(this.activeMap.theme).fogTint : null,
    });
    this.drawCrosshair(ctx);
  }

  drawCrosshair(ctx) {
    if (this.state !== 'raid' || this.settingsOpen || !this.player || this.player.dead) return;
    const mx = this.input.mouse.screenX ?? this.input.mouse.x;
    const my = this.input.mouse.screenY ?? this.input.mouse.y;
    ctx.strokeStyle = 'rgba(200, 220, 180, 0.95)';
    ctx.lineWidth = 1.5;
    const s = 7;
    ctx.beginPath();
    ctx.moveTo(mx - s, my);
    ctx.lineTo(mx + s, my);
    ctx.moveTo(mx, my - s);
    ctx.lineTo(mx, my + s);
    ctx.stroke();
    ctx.fillStyle = 'rgba(200, 220, 180, 0.85)';
    ctx.beginPath();
    ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  loop(ts) {
    const dt = Math.min(0.033, (ts - this.lastTime) / 1000 || 0);
    this.lastTime = ts;
    this.animTime += dt;
    this.update(dt);
    this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }
}

export function createUI() {
  const hud = document.getElementById('hud');
  const overlay = document.getElementById('overlay');
  const endScreen = document.getElementById('end-screen');
  const muteBtn = document.getElementById('btn-mute');

  function invCacheKey(p) {
    return `${p.backpackFilledCount()}|${p.selectedSlot}|${p.canShoot() ? p.weaponId : '-'}|${p.backpack.map((i) => i?.uid || i?.id || '-').join(',')}`;
  }

  return {
    showHud() { hud.classList.remove('hidden'); },
    hideHud() { hud.classList.add('hidden'); },
    hideOverlay() { overlay.classList.add('hidden'); },
    hideEnd() { endScreen.classList.add('hidden'); },
    updateMuteButton(muted) {
      if (muteBtn) muteBtn.textContent = muted ? '🔇' : '🔊';
    },
    renderSettings(settings) {
      const master = document.getElementById('vol-master');
      const sfx = document.getElementById('vol-sfx');
      const music = document.getElementById('vol-music');
      const sens = document.getElementById('mouse-sens');
      if (master) master.value = String(Math.round(settings.masterVol * 100));
      if (sfx) sfx.value = String(Math.round(settings.sfxVol * 100));
      if (music) music.value = String(Math.round(settings.musicVol * 100));
      if (sens) sens.value = String(Math.round(settings.mouseSens * 100));
      const list = document.getElementById('controls-list');
      if (list && !list.dataset.filled) {
        list.innerHTML = CONTROL_BINDINGS.map(
          (b) => `<div class="ctrl-row"><span class="ctrl-keys">${b.keys}</span><span class="ctrl-action">${b.action}</span></div>`
        ).join('');
        list.dataset.filled = '1';
      }
    },
    showEnd(payload) {
      endScreen.classList.remove('hidden');
      const card = endScreen.querySelector('.overlay-card');
      card.classList.remove('win', 'lose', 'mia');
      card.classList.add(payload.type === 'extracted' ? 'win' : payload.type === 'mia' ? 'mia' : 'lose');
      document.getElementById('end-tag').textContent = payload.type === 'extracted' ? '✦ SURVIVED ✦' : payload.type === 'mia' ? 'MIA' : 'KIA';
      document.getElementById('end-title').textContent = payload.title;
      document.getElementById('end-desc').textContent = payload.desc;
      const saveEl = document.getElementById('end-save');
      if (saveEl) saveEl.textContent = payload.saveHint || '';
      const lootEl = document.getElementById('end-loot');
      lootEl.innerHTML = payload.loot.length
        ? payload.loot
            .map((i) => `<span class="loot-chip">${itemIcon(i)} ${i.name} <b>${i.value || 0}₽</b></span>`)
            .join('')
        : '<span class="loot-chip empty">В рюкзаке ничего — ищи E на карте</span>';
      const backBtn = document.getElementById('btn-retry');
      if (backBtn) backBtn.textContent = 'В ЛОББИ';
    },
    setStatus(msg, kind = '') {
      const el = document.getElementById('status-msg');
      el.textContent = msg;
      el.classList.remove('status-loot', 'status-combat', 'status-heal', 'status-fail', 'pop');
      if (kind) el.classList.add(`status-${kind}`);
      if (msg) {
        void el.offsetWidth;
        el.classList.add('pop');
      }
    },
    updateHud(game) {
      const p = game.player;
      if (!p) return;
      document.getElementById('timer').textContent = formatTime(Math.max(0, game.raidTimeLeft));
      document.getElementById('timer').classList.toggle('urgent', game.raidTimeLeft < 60);
      document.getElementById('hp-text').textContent = Math.ceil(p.hp);
      document.getElementById('hp-bar').style.width = `${(p.hp / p.maxHp) * 100}%`;
      document.getElementById('extract-bar').style.width = `${(p.extractProgress / EXTRACT_TIME) * 100}%`;
      document.getElementById('ammo').textContent = p.canShoot() ? `${p.ammo} / ${p.reserve}` : '—';
      document.getElementById('weapon-name').textContent = p.canShoot() ? p.weaponName || '—' : '—';
      const weaponHint = document.getElementById('weapon-hint');
      if (weaponHint) {
        if (p.canShoot() && p.weaponId === 'pm') {
          weaponHint.textContent = 'Полуавто · стой для выстрела';
        } else if (p.canShoot() && p.semiAuto) {
          weaponHint.textContent = 'Полуавто · клик';
        } else if (p.canShoot()) {
          weaponHint.textContent = 'Авто · R перезарядка';
        } else {
          weaponHint.textContent = 'Выбери слот с оружием';
        }
      }
      const hintEl = document.getElementById('active-slot-hint');
      if (hintEl) hintEl.textContent = p.getSlotActionHint();
      document.getElementById('inv-count').textContent = `${p.backpackFilledCount()}/${p.maxInv}`;
      const armorEl = document.getElementById('armor-bar');
      const armorText = document.getElementById('armor-text');
      if (armorEl) armorEl.style.width = `${p.maxArmor > 0 ? (p.armor / p.maxArmor) * 100 : 0}%`;
      if (armorText) armorText.textContent = Math.ceil(p.armor);

      const key = invCacheKey(p);
      if (key !== game._hudCache) {
        game._hudCache = key;
        const slots = document.getElementById('inv-slots');
        slots.innerHTML = '';
        for (let i = 0; i < p.maxInv; i++) {
          const item = p.backpack[i];
          const div = document.createElement('div');
          div.className = 'slot' + (item ? ' filled' : '') + (i === p.selectedSlot ? ' selected' : '');
          div.dataset.idx = String(i);
          const countBadge = item?.count > 1 ? ` ×${item.count}` : '';
          div.innerHTML = item
            ? `<span class="slot-num">${i + 1}</span><span class="slot-ico">${itemIcon(item)}</span><span class="slot-name">${item.name.slice(0, 6)}${countBadge}</span>`
            : `<span class="slot-num">${i + 1}</span><span class="slot-ico">·</span><span class="slot-name">—</span>`;
          div.title = item ? slotItemHint(item) : 'Пустой слот';
          div.addEventListener('click', () => {
            p.selectSlot(i);
            game._hudCache = '';
          });
          slots.appendChild(div);
        }
      }
    },
  };
}
