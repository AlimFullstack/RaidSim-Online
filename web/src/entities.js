import {
  MAP_W,
  MAP_H,
  METER,
  WALLS,
  EXTRACT_ZONE,
  COLORS,
  circleRectCollision,
  resolveCircleRect,
  pointInRect,
  dist,
  clamp,
} from './map.js';

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, worldX: 0, worldY: 0 };
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'KeyR', 'KeyE', 'KeyF'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
    });
    canvas.addEventListener('mousedown', () => {
      this.mouse.down = true;
    });
    window.addEventListener('mouseup', () => {
      this.mouse.down = false;
    });
  }

  pressed(code) {
    return this.keys.has(code);
  }

  tapped(code) {
    return this.justPressed.has(code);
  }

  endFrame() {
    this.justPressed.clear();
  }

  updateWorld(camX, camY, scale) {
    this.mouse.worldX = camX + this.mouse.x / scale;
    this.mouse.worldY = camY + this.mouse.y / scale;
  }
}

export class Bullet {
  constructor(x, y, angle, owner, damage = 18) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * 620;
    this.vy = Math.sin(angle) * 620;
    this.owner = owner;
    this.damage = damage;
    this.dead = false;
    this.life = 1.2;
    this.r = 4;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    if (this.x < 0 || this.y < 0 || this.x > MAP_W || this.y > MAP_H) this.dead = true;
    for (const w of WALLS) {
      if (circleRectCollision(this.x, this.y, this.r, w)) {
        this.dead = true;
        break;
      }
    }
  }

  draw(ctx) {
    ctx.fillStyle = COLORS.bullet;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export class LootPoint {
  constructor(x, y, tier) {
    this.x = x;
    this.y = y;
    this.tier = tier;
    this.searched = false;
    this.searching = false;
    this.progress = 0;
    this.r = 22;
  }

  draw(ctx) {
    if (this.searched) return;
    ctx.fillStyle = this.tier === 'valuable' ? COLORS.lootRare : COLORS.loot;
    ctx.globalAlpha = 0.35 + Math.sin(Date.now() / 300) * 0.15;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = this.tier === 'valuable' ? COLORS.lootRare : COLORS.loot;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (this.searching) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.progress);
      ctx.stroke();
    }
  }
}

export class Entity {
  constructor(x, y, r) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.hp = 100;
    this.maxHp = 100;
    this.angle = 0;
    this.speed = 180;
    this.dead = false;
    this.armor = 0;
  }

  move(dx, dy, dt) {
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    const nx = (dx / len) * this.speed * dt;
    const ny = (dy / len) * this.speed * dt;
    this.tryMove(nx, 0);
    this.tryMove(0, ny);
  }

  tryMove(nx, ny) {
    let nxPos = clamp(this.x + nx, this.r, MAP_W - this.r);
    let nyPos = clamp(this.y + ny, this.r, MAP_H - this.r);
    for (const w of WALLS) {
      if (circleRectCollision(nxPos, this.y, this.r, w)) {
        const resolved = resolveCircleRect(nxPos, this.y, this.r, w);
        nxPos = resolved.x;
      }
      if (circleRectCollision(this.x, nyPos, this.r, w)) {
        const resolved = resolveCircleRect(this.x, nyPos, this.r, w);
        nyPos = resolved.y;
      }
    }
    this.x = nxPos;
    this.y = nyPos;
  }

  takeDamage(amount) {
    let dmg = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.5);
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }

  hasLineOfSight(tx, ty) {
    const steps = 20;
    for (let i = 1; i <= steps; i++) {
      const px = this.x + ((tx - this.x) * i) / steps;
      const py = this.y + ((ty - this.y) * i) / steps;
      for (const w of WALLS) {
        if (pointInRect(px, py, w)) return false;
      }
    }
    return true;
  }
}

export class Player extends Entity {
  constructor(x, y) {
    super(x, y, 16);
    this.magSize = 12;
    this.ammo = 12;
    this.reserve = 24;
    this.fireCooldown = 0;
    this.reloadTime = 0;
    this.inventory = [];
    this.maxInv = 6;
    this.medkits = 1;
    this.extractProgress = 0;
    this.kills = 0;
  }

  update(input, dt) {
    if (this.dead) return;

    let dx = 0;
    let dy = 0;
    if (input.pressed('KeyW') || input.pressed('ArrowUp')) dy -= 1;
    if (input.pressed('KeyS') || input.pressed('ArrowDown')) dy += 1;
    if (input.pressed('KeyA') || input.pressed('ArrowLeft')) dx -= 1;
    if (input.pressed('KeyD') || input.pressed('ArrowRight')) dx += 1;
    this.move(dx, dy, dt);

    this.angle = Math.atan2(input.mouse.worldY - this.y, input.mouse.worldX - this.x);

    if (this.reloadTime > 0) {
      this.reloadTime -= dt;
      if (this.reloadTime <= 0 && this.reserve > 0) {
        const need = this.magSize - this.ammo;
        const load = Math.min(need, this.reserve);
        this.ammo += load;
        this.reserve -= load;
      }
      return null;
    }

    this.fireCooldown -= dt;
    if (input.tapped('KeyR') && this.ammo < this.magSize && this.reserve > 0) {
      this.reloadTime = 1.4;
      return null;
    }

    if (input.mouse.down && this.fireCooldown <= 0 && this.ammo > 0) {
      this.ammo -= 1;
      this.fireCooldown = 0.18;
      return new Bullet(this.x + Math.cos(this.angle) * 20, this.y + Math.sin(this.angle) * 20, this.angle, 'player');
    }
    return null;
  }

  finishReload() {
    if (this.reloadTime <= 0) return;
  }

  useMedkit() {
    if (this.medkits <= 0 || this.hp >= this.maxHp) return false;
    this.medkits -= 1;
    this.hp = Math.min(this.maxHp, this.hp + 50);
    return true;
  }

  addLoot(item) {
    if (item.id === 'empty') return { ok: true, msg: 'Ничего полезного.' };
    if (item.ammo) {
      this.reserve += item.ammo;
      return { ok: true, msg: `+${item.ammo} патронов` };
    }
    if (item.heal && item.consumable) {
      this.medkits += 1;
      return { ok: true, msg: 'Аптечка в инвентарь' };
    }
    if (item.heal && !item.consumable) {
      this.hp = Math.min(this.maxHp, this.hp + item.heal);
      return { ok: true, msg: `Бинт: +${item.heal} HP` };
    }
    if (item.armor) {
      this.armor += item.armor;
      return { ok: true, msg: 'Надет бронежилет' };
    }
    if (this.inventory.length >= this.maxInv) {
      return { ok: false, msg: 'Рюкзак полон!' };
    }
    this.inventory.push(item);
    return { ok: true, msg: `Подобрано: ${item.name}` };
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2c2418';
    ctx.fillRect(8, -4, 18, 8);

    ctx.restore();
  }
}

export class Scav extends Entity {
  constructor(x, y) {
    super(x, y, 15);
    this.state = 'patrol';
    this.targetX = x;
    this.targetY = y;
    this.wait = 0;
    this.fireCooldown = 0;
    this.speed = 120;
    this.vision = 260;
    this.name = 'Scav';
  }

  pickPatrol() {
    this.targetX = clamp(this.x + (Math.random() - 0.5) * METER * 1.5, 40, MAP_W - 40);
    this.targetY = clamp(this.y + (Math.random() - 0.5) * METER * 1.5, 40, MAP_H - 40);
    this.wait = 1 + Math.random() * 2;
  }

  update(dt, player, bullets) {
    if (this.dead) return null;

    const d = dist(this.x, this.y, player.x, player.y);
    const seesPlayer = d < this.vision && this.hasLineOfSight(player.x, player.y);

    if (seesPlayer && !player.dead) {
      this.state = 'attack';
      this.angle = Math.atan2(player.y - this.y, player.x - this.x);
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      if (d > 140) this.move(dx, dy, dt * 0.7);
      else if (d < 90) this.move(-dx, -dy, dt * 0.5);

      this.fireCooldown -= dt;
      if (this.fireCooldown <= 0 && d < 320) {
        this.fireCooldown = 0.55 + Math.random() * 0.4;
        const spread = (Math.random() - 0.5) * 0.15;
        return new Bullet(
          this.x + Math.cos(this.angle) * 18,
          this.y + Math.sin(this.angle) * 18,
          this.angle + spread,
          'scav',
          14
        );
      }
    } else {
      this.state = 'patrol';
      this.wait -= dt;
      if (this.wait <= 0) this.pickPatrol();
      const pdx = this.targetX - this.x;
      const pdy = this.targetY - this.y;
      if (Math.hypot(pdx, pdy) > 12) this.move(pdx, pdy, dt * 0.6);
      else this.angle = Math.random() * Math.PI * 2;
    }
    return null;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 13, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.scav;
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4a2020';
    ctx.fillRect(7, -3, 16, 6);

    ctx.restore();

    if (!this.dead && this.state === 'attack') {
      ctx.fillStyle = '#ff6b6b';
      ctx.font = '11px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText('!', this.x, this.y - 22);
    }
  }
}

export function drawMap(ctx) {
  ctx.fillStyle = COLORS.floor;
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  ctx.strokeStyle = COLORS.floorGrid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * METER, 0);
    ctx.lineTo(i * METER, MAP_H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * METER);
    ctx.lineTo(MAP_W, i * METER);
    ctx.stroke();
  }

  for (const w of WALLS) {
    ctx.fillStyle = COLORS.wall;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = COLORS.wallTop;
    ctx.fillRect(w.x, w.y, w.w, Math.min(10, w.h * 0.15));
  }

  ctx.fillStyle = COLORS.extract;
  ctx.fillRect(EXTRACT_ZONE.x, EXTRACT_ZONE.y, EXTRACT_ZONE.w, EXTRACT_ZONE.h);
  ctx.strokeStyle = COLORS.extractBorder;
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.strokeRect(EXTRACT_ZONE.x, EXTRACT_ZONE.y, EXTRACT_ZONE.w, EXTRACT_ZONE.h);
  ctx.setLineDash([]);

  ctx.fillStyle = COLORS.extractBorder;
  ctx.font = 'bold 18px Oswald';
  ctx.textAlign = 'center';
  ctx.fillText('ЭКСТРАКТ', EXTRACT_ZONE.x + EXTRACT_ZONE.w / 2, EXTRACT_ZONE.y + EXTRACT_ZONE.h / 2 + 6);
}
