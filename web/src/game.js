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

export class Game {
  constructor(canvas, ui, confetti = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui;
    this.confetti = confetti;
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
  }

  startRaid() {
    this.state = 'raid';
    this.raidTimeLeft = RAID_DURATION;
    this.bullets = [];
    this.player = new Player(SPAWN_PLAYER.x, SPAWN_PLAYER.y);
    this.lootPoints = LOOT_POINTS.map((p) => new LootPoint(p.x, p.y, p.tier));
    this.scavs = SCAV_SPAWNS.map((s) => new Scav(s.x, s.y));
    this.extracting = false;
    this.statusMsg = '';
    this.endPayload = null;
    this.ui.showHud();
    this.ui.hideOverlay();
    this.ui.hideEnd();
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
    if (!p.dead) {
      if (this.input.tapped('KeyF')) {
        if (p.useMedkit()) this.setStatus('Использована аптечка');
      }

      const bullet = p.update(this.input, dt);
      if (bullet) this.bullets.push(bullet);

      this.handleLoot(dt);
      this.handleExtract(dt);
    }

    for (const scav of this.scavs) {
      const b = scav.update(dt, p, this.bullets);
      if (b) this.bullets.push(b);
    }

    this.updateBullets(dt);

    if (p.dead) {
      this.endRaid('dead', 'ТЫ ПОГИБ', 'PMC уничтожен. Лут остался на карте.');
    }

    this.updateCamera();
    this.ui.updateHud(this);
    this.input.endFrame();
  }

  handleLoot(dt) {
    const p = this.player;
    let near = null;
    let nearDist = Infinity;

    for (const lp of this.lootPoints) {
      if (lp.searched) continue;
      const d = dist(p.x, p.y, lp.x, lp.y);
      if (d < 50 && d < nearDist) {
        near = lp;
        nearDist = d;
      }
    }

    for (const lp of this.lootPoints) {
      lp.searching = lp === near && this.input.pressed('KeyE');
    }

    if (!near || !this.input.pressed('KeyE')) return;

    near.progress += dt / 1.8;
    if (near.progress < 1) return;

    near.searched = true;
    near.searching = false;
    const item = rollLoot(near.tier);
    const result = p.addLoot(item);
    this.setStatus(result.msg, 2.5);
  }

  handleExtract(dt) {
    const p = this.player;
    const inside = pointInRect(p.x, p.y, EXTRACT_ZONE);

    if (inside) {
      p.extractProgress += dt;
      this.extracting = true;
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
            if (scav.dead) {
              p.kills += 1;
              this.setStatus('Scav убит');
            }
            break;
          }
        }
      } else if (b.owner === 'scav' && !p.dead) {
        if (dist(b.x, b.y, p.x, p.y) < p.r + b.r) {
          p.takeDamage(b.damage);
          b.dead = true;
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
    };
    this.ui.showEnd(this.endPayload);
    this.ui.hideHud();
    if (type === 'extracted' && this.confetti) {
      this.confetti.burst(150);
    }
  }

  updateCamera() {
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
    this.updateCamera();
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
    for (const scav of this.scavs) if (!scav.dead) scav.draw(ctx);
    if (this.player && !this.player.dead) this.player.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);

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
