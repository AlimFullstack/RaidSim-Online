import {
  MAP_W,
  MAP_H,
  RAID_DURATION,
  EXTRACT_TIME,
  SPAWN_PLAYER,
  LOOT_POINTS,
  SCAV_SPAWNS,
  EXTRACT_ZONE,
  pointInRect,
  rollLoot,
  formatTime,
  dist,
} from './map.js';
import { Input, Player, Scav, Bullet, LootPoint, drawMap } from './entities.js';
import { RAID_MODES } from './profile.js';

const INTERACT_RADIUS = 50;
const SEARCH_TIME = 1.8;

export class Game {
  constructor(canvas, ui, confetti = null, audio = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui;
    this.confetti = confetti;
    this.audio = audio;
    this.input = new Input(canvas);
    this.state = 'menu';
    this.scale = 1;
    this.camX = 0;
    this.camY = 0;
    this.statusMsg = '';
    this.statusTimer = 0;
    this.lastTime = 0;
    this.animTime = 0;
    this.raidTimeLeft = RAID_DURATION;
    this.bullets = [];
    this.lootPoints = [];
    this.scavs = [];
    this.player = null;
    this.extracting = false;
    this.endPayload = null;
    this.wasReloading = false;
    this.lastExtractTick = -1;
    this.nearestInteract = null;
    this.emptyClickCooldown = 0;
    this.raidMode = 'standard';
  }

  startRaid(mode = 'standard', loadout = {}) {
    this.audio?.init();
    this.raidMode = mode;
    const modeConfig = RAID_MODES[mode] || RAID_MODES.standard;
    this.state = 'raid';
    this.raidTimeLeft = modeConfig.duration;
    this.bullets = [];
    this.player = new Player(SPAWN_PLAYER.x, SPAWN_PLAYER.y);
    if (loadout.extraMedkits) this.player.medkits += loadout.extraMedkits;
    if (loadout.extraAmmo) this.player.reserve += loadout.extraAmmo;
    if (loadout.startArmor) this.player.armor += loadout.startArmor;
    this.lootPoints = LOOT_POINTS.map((p) => new LootPoint(p.x, p.y, p.tier));
    this.scavs = SCAV_SPAWNS.map((s) => new Scav(s.x, s.y));
    this.extracting = false;
    this.statusMsg = '';
    this.endPayload = null;
    this.wasReloading = false;
    this.lastExtractTick = -1;
    this.nearestInteract = null;
    this.emptyClickCooldown = 0;
    this.ui.showHud();
    this.ui.hideOverlay();
    this.ui.hideEnd();
    document.getElementById('lobby-screen')?.classList.add('hidden');
    document.getElementById('auth-screen')?.classList.add('hidden');
    this.resize();
  }

  setStatus(msg, duration = 2) {
    this.statusMsg = msg;
    this.statusTimer = duration;
    this.ui.setStatus(msg);
  }

  update(dt) {
    if (this.state !== 'raid') return;

    this.raidTimeLeft -= dt;
    if (this.raidTimeLeft <= 0) {
      this.endRaid('mia', 'Время вышло — MIA', 'Ты не успел на экстракт. Весь лут потерян.');
      return;
    }

    if (this.statusTimer > 0) {
      this.statusTimer -= dt;
      if (this.statusTimer <= 0) this.ui.setStatus('');
    }

    const p = this.player;
    this.emptyClickCooldown -= dt;

    if (!p.dead) {
      if (this.input.tapped('KeyF')) {
        if (p.useMedkit()) this.setStatus('Использована аптечка');
      }

      const reloading = p.reloadTime > 0;
      if (this.wasReloading && !reloading && p.ammo > 0) {
        this.audio?.play('reload');
      }
      this.wasReloading = reloading;

      const bullet = p.update(this.input, dt);
      if (bullet) {
        this.bullets.push(bullet);
        this.audio?.play('shoot');
      } else if (
        this.input.mouse.down &&
        p.ammo <= 0 &&
        p.reloadTime <= 0 &&
        p.fireCooldown <= 0 &&
        this.emptyClickCooldown <= 0
      ) {
        this.audio?.play('empty');
        this.emptyClickCooldown = 0.35;
      }

      this.handleInteract(dt);
      this.handleExtract(dt);
    }

    for (const scav of this.scavs) {
      const b = scav.update(dt, p, this.bullets);
      if (b) {
        this.bullets.push(b);
        this.audio?.play('shootEnemy');
      }
    }

    this.updateBullets(dt);

    if (p.dead) {
      this.endRaid('dead', 'ТЫ ПОГИБ', 'PMC уничтожен. Лут остался на карте.');
    }

    this.updateCamera();
    this.ui.updateHud(this);
    this.input.endFrame();
  }

  findNearestInteractable() {
    const p = this.player;
    let best = null;
    let bestDist = Infinity;

    for (const scav of this.scavs) {
      if (!scav.dead || scav.looted) continue;
      const d = dist(p.x, p.y, scav.x, scav.y);
      if (d < INTERACT_RADIUS && d < bestDist) {
        best = { type: 'corpse', target: scav, x: scav.x, y: scav.y, d };
        bestDist = d;
      }
    }

    for (const lp of this.lootPoints) {
      if (lp.searched) continue;
      const d = dist(p.x, p.y, lp.x, lp.y);
      if (d < INTERACT_RADIUS && d < bestDist) {
        best = { type: 'loot', target: lp, x: lp.x, y: lp.y, d };
        bestDist = d;
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
      return;
    }

    if (near.type === 'loot') {
      near.target.progress += dt / SEARCH_TIME;
      if (near.target.progress < 1) return;

      near.target.searched = true;
      near.target.searching = false;
      near.target.progress = 0;
      const item = rollLoot(near.target.tier);
      const result = p.addLoot(item);
      if (result.ok && item.id !== 'empty') this.audio?.play('loot');
      this.setStatus(result.msg, 2.5);
      return;
    }

    if (near.type === 'corpse') {
      const scav = near.target;
      scav.searchProgress += dt / SEARCH_TIME;
      if (scav.searchProgress < 1) return;

      scav.looted = true;
      scav.searchProgress = 0;
      const msgs = [];
      for (const item of scav.loot) {
        const result = p.addLoot(item);
        if (result.ok) msgs.push(result.msg);
      }
      this.audio?.play('loot');
      this.setStatus(msgs.length ? `Обыск Scav: ${msgs.join(', ')}` : 'У Scav ничего не было', 3);
    }
  }

  handleExtract(dt) {
    const p = this.player;
    const inside = pointInRect(p.x, p.y, EXTRACT_ZONE);

    if (inside) {
      p.extractProgress += dt;
      this.extracting = true;
      const tick = Math.floor(p.extractProgress);
      if (tick > this.lastExtractTick) {
        this.lastExtractTick = tick;
        this.audio?.play('extract');
      }
      if (p.extractProgress >= EXTRACT_TIME) {
        const value = p.inventory.reduce((s, i) => s + (i.value || 0), 0);
        this.endRaid(
          'extracted',
          'РЕЙД УСПЕШЕН',
          `Ты вышел живым. Убийств: ${p.kills}. Стоимость лута: ${value}₽`,
          true
        );
      }
    } else {
      p.extractProgress = 0;
      this.extracting = false;
      this.lastExtractTick = -1;
    }
  }

  updateBullets(dt) {
    const p = this.player;
    for (const b of this.bullets) {
      if (b.dead) continue;
      b.update(dt);
      if (b.dead) continue;

      if (b.owner === 'player') {
        for (const scav of this.scavs) {
          if (scav.dead) continue;
          if (dist(b.x, b.y, scav.x, scav.y) < scav.r + b.r) {
            scav.takeDamage(b.damage);
            b.dead = true;
            this.audio?.play('hit');
            if (scav.dead) {
              scav.onDeath();
              p.kills += 1;
              this.audio?.play('kill');
              this.setStatus('Scav убит — E чтобы обыскать');
            }
            break;
          }
        }
      } else if (b.owner === 'scav' && !p.dead) {
        if (dist(b.x, b.y, p.x, p.y) < p.r + b.r) {
          p.takeDamage(b.damage);
          b.dead = true;
          this.audio?.play('hit');
        }
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
  }

  endRaid(type, title, desc, survived = false) {
    this.state = 'ended';
    const p = this.player;
    this.endPayload = {
      type,
      title,
      desc,
      loot: survived ? [...p.inventory] : [],
      kills: p.kills,
      mode: this.raidMode,
    };
    this.ui.showEnd(this.endPayload);
    this.ui.hideHud();
    this.audio?.playRaidEnd(type === 'extracted');
    if (type === 'extracted' && this.confetti) {
      this.confetti.burst(150);
    }
  }

  getEndPayload() {
    return this.endPayload;
  }

  updateCamera() {
    if (!this.player) return;
    const viewW = this.canvas.width / this.scale;
    const viewH = this.canvas.height / this.scale;
    this.camX = Math.max(0, Math.min(MAP_W - viewW, this.player.x - viewW / 2));
    this.camY = Math.max(0, Math.min(MAP_H - viewH, this.player.y - viewH / 2));
    this.input.updateWorld(this.camX, this.camY, this.scale);
  }

  resize() {
    const maxW = window.innerWidth;
    const maxH = window.innerHeight - 20;
    this.scale = Math.min(maxW / MAP_W, maxH / MAP_H, 1.2);
    this.canvas.width = Math.floor(MAP_W * this.scale);
    this.canvas.height = Math.floor(MAP_H * this.scale);
    if (this.player) this.updateCamera();
  }

  drawInteractHint(ctx) {
    const near = this.nearestInteract;
    if (!near || this.state !== 'raid') return;

    const label = near.type === 'corpse' ? 'E — обыск Scav' : 'E — поиск лута';
    ctx.font = '12px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    const tw = ctx.measureText(label).width + 16;
    ctx.fillRect(near.x - tw / 2, near.y - 42, tw, 20);
    ctx.fillStyle = near.type === 'corpse' ? '#ff8a80' : '#7ec8ff';
    ctx.fillText(label, near.x, near.y - 28);
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d0f0c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.state === 'menu') return;

    ctx.setTransform(this.scale, 0, 0, this.scale, -this.camX * this.scale, -this.camY * this.scale);
    drawMap(ctx, this.animTime);

    for (const lp of this.lootPoints) lp.draw(ctx);
    for (const scav of this.scavs) scav.draw(ctx);
    if (this.player && !this.player.dead) this.player.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    this.drawInteractHint(ctx);

    if (this.player && this.extracting) {
      ctx.fillStyle = 'rgba(46, 204, 113, 0.85)';
      ctx.font = '14px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText(
        `ЭКСТРАКТ ${Math.ceil(EXTRACT_TIME - this.player.extractProgress)}с`,
        this.player.x,
        this.player.y - 28
      );
    }
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

  return {
    showHud() {
      hud.classList.remove('hidden');
    },
    hideHud() {
      hud.classList.add('hidden');
    },
    hideOverlay() {
      overlay.classList.add('hidden');
    },
    showOverlay() {
      overlay.classList.remove('hidden');
    },
    hideEnd() {
      endScreen.classList.add('hidden');
    },
    updateMuteButton(muted) {
      if (muteBtn) muteBtn.textContent = muted ? '🔇' : '🔊';
      muteBtn?.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
    },
    showEnd(payload) {
      endScreen.classList.remove('hidden');
      const card = endScreen.querySelector('.overlay-card');
      card.classList.remove('win', 'lose', 'mia');
      card.classList.add(payload.type === 'extracted' ? 'win' : payload.type === 'mia' ? 'mia' : 'lose');

      const tag = document.getElementById('end-tag');
      const title = document.getElementById('end-title');
      const desc = document.getElementById('end-desc');
      const lootEl = document.getElementById('end-loot');

      tag.textContent = payload.type === 'extracted' ? '✦ SURVIVED ✦' : payload.type === 'mia' ? 'MIA' : 'KIA';
      title.textContent = payload.title;
      desc.textContent = payload.desc;

      if (payload.loot.length) {
        lootEl.innerHTML = payload.loot.map((i) => `<span class="loot-chip">${i.name} (${i.value || 0}₽)</span>`).join('');
      } else {
        lootEl.innerHTML = '<span class="loot-chip empty">Лут не сохранён</span>';
      }

      const backBtn = document.getElementById('btn-retry');
      if (backBtn) backBtn.textContent = 'В ЛОББИ';
    },
    setStatus(msg) {
      document.getElementById('status-msg').textContent = msg;
    },
    updateHud(game) {
      const p = game.player;
      if (!p) return;

      document.getElementById('timer').textContent = formatTime(Math.max(0, game.raidTimeLeft));
      const timerEl = document.getElementById('timer');
      timerEl.classList.toggle('urgent', game.raidTimeLeft < 60);
      document.getElementById('hp-text').textContent = Math.ceil(p.hp);
      document.getElementById('hp-bar').style.width = `${(p.hp / p.maxHp) * 100}%`;
      document.getElementById('extract-bar').style.width = `${(p.extractProgress / EXTRACT_TIME) * 100}%`;
      document.getElementById('ammo').textContent = `${p.ammo} / ${p.reserve}`;
      document.getElementById('inv-count').textContent = `${p.inventory.length}/${p.maxInv}`;

      const slots = document.getElementById('inv-slots');
      slots.innerHTML = '';
      for (let i = 0; i < p.maxInv; i++) {
        const item = p.inventory[i];
        const div = document.createElement('div');
        div.className = 'slot' + (item ? ' filled' : '');
        div.textContent = item ? item.name.slice(0, 8) : '—';
        if (item?.value) div.title = `${item.name} — ${item.value}₽`;
        slots.appendChild(div);
      }
    },
  };
}
