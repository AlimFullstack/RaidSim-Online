import {
  MAP_W,
  MAP_H,
  METER,
  COLORS,
  NIGHT_COLORS,
  circleRectCollision,
  resolveCircleRect,
  pointInRect,
  dist,
  clamp,
  generateScavLoot,
  getMapBounds,
} from './map-core.js';
import { getWeapon, calcSpread } from './weapons.js';

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, worldX: 0, worldY: 0 };
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'KeyR', 'KeyE', 'KeyF', 'KeyG', 'KeyV', 'KeyQ', 'Escape'].includes(e.code)) e.preventDefault();
      if (e.code.startsWith('Digit')) e.preventDefault();
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

  updateWorld(camX, camY, scale, sens = 1) {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const dx = (this.mouse.x - cx) * sens;
    const dy = (this.mouse.y - cy) * sens;
    this.mouse.worldX = camX + cx / scale + dx / scale;
    this.mouse.worldY = camY + cy / scale + dy / scale;
  }
}

export class Bullet {
  constructor(x, y, angle, owner, damage = 18, walls = [], maxRange = 9999, originX = x, originY = y) {
    this.x = x;
    this.y = y;
    this.ox = originX;
    this.oy = originY;
    this.vx = Math.cos(angle) * 620;
    this.vy = Math.sin(angle) * 620;
    this.owner = owner;
    this.damage = damage;
    this.dead = false;
    this.life = 1.2;
    this.r = 4;
    this.walls = walls;
    this.maxRange = maxRange;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    if (dist(this.ox, this.oy, this.x, this.y) > this.maxRange) this.dead = true;
    const bounds = getMapBounds();
    if (this.x < 0 || this.y < 0 || this.x > bounds.w || this.y > bounds.h) this.dead = true;
    for (const w of this.walls) {
      if (circleRectCollision(this.x, this.y, this.r, w)) {
        this.dead = true;
        this.hitWall = true;
        this.hitX = this.x;
        this.hitY = this.y;
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
    const t = Date.now() / 300;
    const glow = this.tier === 'valuable' ? COLORS.lootRare : COLORS.loot;

    ctx.globalAlpha = 0.2 + Math.sin(t) * 0.1;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = glow;
    ctx.globalAlpha = 0.5 + Math.sin(t) * 0.2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = glow;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (this.tier === 'valuable') {
      ctx.fillStyle = '#ffe08a';
      ctx.font = '10px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText('★', this.x, this.y - this.r - 6);
    }

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
  constructor(x, y, r, walls = []) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.walls = walls;
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
    const bounds = getMapBounds();
    let nxPos = clamp(this.x + nx, this.r, bounds.w - this.r);
    let nyPos = clamp(this.y + ny, this.r, bounds.h - this.r);
    for (const w of this.walls) {
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
      for (const w of this.walls) {
        if (pointInRect(px, py, w)) return false;
      }
    }
    return true;
  }
}

export class Player extends Entity {
  constructor(x, y, walls = [], weaponId = 'pm') {
    super(x, y, 16, walls);
    this.equipWeapon(weaponId);
    this.reserve = 24;
    this.fireCooldown = 0;
    this.reloadTime = 0;
    this.inventory = [];
    this.maxInv = 6;
    this.selectedSlot = 0;
    this.medkits = 1;
    this.grenades = 0;
    this.smokes = 0;
    this.extractProgress = 0;
    this.kills = 0;
    this.maxArmor = 0;
    this.isSprinting = false;
    this.isMoving = false;
    this.isFiring = false;
    this.noiseLevel = 0;
    this.recoilHeat = 0;
    this.currentSpread = 0;
  }

  equipWeapon(id) {
    const w = getWeapon(id);
    this.weaponId = w.id;
    this.weaponName = w.name;
    this.magSize = w.magSize;
    this.ammo = w.magSize;
    this.weaponDamage = w.damage;
    this.fireRate = w.fireRate;
    this.spread = w.spread;
    this.moveSpread = w.moveSpread;
    this.sprintSpread = w.sprintSpread;
    this.pellets = w.pellets;
    this.weaponRange = w.range;
    this.weaponDef = w;
  }

  getSpreadAngle() {
    return calcSpread(this.weaponDef || getWeapon(this.weaponId), {
      moving: this.isMoving,
      sprinting: this.isSprinting && this.isMoving,
      recoilHeat: this.recoilHeat,
    });
  }

  /** @returns {Bullet[]|null} */
  update(input, dt) {
    if (this.dead) return null;

    let dx = 0;
    let dy = 0;
    if (input.pressed('KeyW') || input.pressed('ArrowUp')) dy -= 1;
    if (input.pressed('KeyS') || input.pressed('ArrowDown')) dy += 1;
    if (input.pressed('KeyA') || input.pressed('ArrowLeft')) dx -= 1;
    if (input.pressed('KeyD') || input.pressed('ArrowRight')) dx += 1;

    this.isMoving = !!(dx || dy);
    this.isSprinting = (input.pressed('ShiftLeft') || input.pressed('ShiftRight')) && this.isMoving;
    this.isFiring = input.mouse.down && this.ammo > 0 && this.reloadTime <= 0;

    const baseSpeed = this.isSprinting ? 260 : 180;
    const shootSlow = this.isFiring || this.fireCooldown > this.fireRate * 0.4;
    this.speed = shootSlow ? baseSpeed * 0.5 : baseSpeed;

    this.move(dx, dy, dt);
    this.noiseLevel = this.isSprinting ? 1 : this.isMoving ? 0.4 : 0;

    this.recoilHeat = Math.max(0, this.recoilHeat - dt * 1.8);
    this.currentSpread = this.getSpreadAngle();

    this.angle = Math.atan2(input.mouse.worldY - this.y, input.mouse.worldX - this.x);

    for (let i = 0; i < this.maxInv; i++) {
      if (input.tapped(`Digit${i + 1}`)) this.selectedSlot = i;
    }

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
      this.fireCooldown = this.fireRate;
      this.noiseLevel = 1;
      this.recoilHeat = Math.min(1, this.recoilHeat + 0.35);
      const spreadTotal = this.getSpreadAngle();
      const bullets = [];
      const ox = this.x + Math.cos(this.angle) * 20;
      const oy = this.y + Math.sin(this.angle) * 20;
      for (let i = 0; i < this.pellets; i++) {
        const spread = (Math.random() - 0.5) * spreadTotal * 2;
        bullets.push(
          new Bullet(ox, oy, this.angle + spread, 'player', this.weaponDamage, this.walls, this.weaponRange, ox, oy)
        );
      }
      return bullets;
    }
    return null;
  }

  dropSelected() {
    const item = this.inventory[this.selectedSlot];
    if (!item) return { ok: false, msg: 'Слот пуст' };
    this.inventory.splice(this.selectedSlot, 1);
    if (this.selectedSlot >= this.inventory.length) {
      this.selectedSlot = Math.max(0, this.inventory.length - 1);
    }
    return { ok: true, item, msg: `Выброшено: ${item.name}` };
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
      this.maxArmor = Math.max(this.maxArmor, this.armor);
      return { ok: true, msg: 'Надет бронежилет' };
    }
    if (item.weapon) {
      this.equipWeapon(item.weapon);
      return { ok: true, msg: `Экипировано: ${item.name}` };
    }
    if (item.grenade) {
      this.grenades += 1;
      return { ok: true, msg: 'Граната (G)' };
    }
    if (item.smoke) {
      this.smokes += 1;
      return { ok: true, msg: 'Дымовая (V)' };
    }
    if (this.inventory.length >= this.maxInv) {
      return { ok: false, msg: 'Рюкзак полон!' };
    }
    this.inventory.push(item);
    return { ok: true, msg: `Подобрано: ${item.name}` };
  }

  draw(ctx) {
    this.drawSpreadCone(ctx);

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

  drawSpreadCone(ctx) {
    const spread = this.currentSpread;
    if (spread < 0.02) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.fillStyle = 'rgba(138, 154, 122, 0.1)';
    ctx.strokeStyle = 'rgba(138, 154, 122, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 90, -spread, spread);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

export class Scav extends Entity {
  constructor(x, y, walls = [], opts = {}) {
    super(x, y, opts.isBoss ? 20 : 15, walls);
    this.state = 'patrol';
    this.targetX = x;
    this.targetY = y;
    this.wait = 0;
    this.fireCooldown = 0;
    this.speed = opts.isBoss ? 90 : 120;
    this.vision = opts.isBoss ? 320 : 260;
    this.name = opts.isBoss ? 'Босс' : 'Scav';
    this.isBoss = !!opts.isBoss;
    this.hp = opts.isBoss ? 200 : 100;
    this.maxHp = this.hp;
    this.loot = [];
    this.looted = false;
    this.searchProgress = 0;
    this.alertPos = null;
  }

  onDeath() {
    this.loot = generateScavLoot();
    this.looted = false;
    this.searchProgress = 0;
  }

  pickPatrol() {
    const bounds = getMapBounds();
    const margin = 80;
    this.targetX = clamp(this.x + (Math.random() - 0.5) * METER * 2, margin, bounds.w - margin);
    this.targetY = clamp(this.y + (Math.random() - 0.5) * METER * 2, margin, bounds.h - margin);
    this.wait = 1 + Math.random() * 2;
  }

  update(dt, player, bullets, noiseEvents = []) {
    if (this.dead) return null;

    for (const n of noiseEvents) {
      if (dist(this.x, this.y, n.x, n.y) < n.radius) {
        this.alertPos = { x: n.x, y: n.y };
        this.state = 'investigate';
      }
    }

    const d = dist(this.x, this.y, player.x, player.y);
    const seesPlayer = d < this.vision && this.hasLineOfSight(player.x, player.y);

    if (seesPlayer && !player.dead) {
      this.state = 'attack';
      this.alertPos = null;
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
          this.isBoss ? 20 : 14,
          this.walls
        );
      }
    } else if (this.state === 'investigate' && this.alertPos) {
      const pdx = this.alertPos.x - this.x;
      const pdy = this.alertPos.y - this.y;
      if (Math.hypot(pdx, pdy) > 20) this.move(pdx, pdy, dt * 0.8);
      else {
        this.state = 'patrol';
        this.alertPos = null;
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
    if (this.dead) {
      this.drawCorpse(ctx);
      return;
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 13, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.isBoss ? COLORS.boss || '#8e24aa' : COLORS.scav;
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

  drawCorpse(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 5, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3a3030';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#5a4a4a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x - 8, this.y - 8);
    ctx.lineTo(this.x + 8, this.y + 8);
    ctx.moveTo(this.x + 8, this.y - 8);
    ctx.lineTo(this.x - 8, this.y + 8);
    ctx.stroke();

    if (!this.looted) {
      const t = Date.now() / 300;
      ctx.globalAlpha = 0.25 + Math.sin(t) * 0.15;
      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (this.searchProgress > 0) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.searchProgress);
        ctx.stroke();
      }
    }
  }
}

export class PlayerCorpse {
  constructor(x, y, loot = []) {
    this.x = x;
    this.y = y;
    this.loot = loot;
    this.looted = false;
    this.searchProgress = 0;
    this.r = 18;
  }

  draw(ctx) {
    ctx.fillStyle = '#2a3544';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    if (!this.looted) {
      ctx.fillStyle = '#7ec8ff';
      ctx.font = '9px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText('PMC', this.x, this.y - 22);
    }
  }
}

export class GroundItem {
  constructor(x, y, item) {
    this.x = x;
    this.y = y;
    this.item = item;
    this.r = 16;
    this.bob = Math.random() * Math.PI * 2;
  }

  draw(ctx) {
    const t = Date.now() / 400 + this.bob;
    const yOff = Math.sin(t) * 3;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 4, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.loot;
    ctx.beginPath();
    ctx.arc(this.x, this.y + yOff, this.r - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d4d8ce';
    ctx.font = '9px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText(this.item.name.slice(0, 10), this.x, this.y + yOff - this.r);
  }
}

export class SmokeZone {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 120;
    this.life = 8;
  }

  update(dt) {
    this.life -= dt;
  }

  draw(ctx) {
    ctx.fillStyle = 'rgba(120, 120, 120, 0.25)';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawMap(ctx, time = 0, mapConfig) {
  const colors = mapConfig?.theme === 'night' ? NIGHT_COLORS : COLORS;
  const walls = mapConfig?.walls || [];
  const extractZone = mapConfig?.extractZone;
  const mapW = mapConfig?.mapW || MAP_W;
  const mapH = mapConfig?.mapH || MAP_H;
  const gridW = mapConfig?.gridW || 40;

  const bg = ctx.createLinearGradient(0, 0, mapW, mapH);
  bg.addColorStop(0, '#141a12');
  bg.addColorStop(0.5, colors.floor);
  bg.addColorStop(1, '#12180f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, mapW, mapH);

  ctx.strokeStyle = colors.floorGrid;
  ctx.lineWidth = 1;
  const gridStep = mapW / gridW;
  for (let i = 0; i <= gridW; i++) {
    ctx.beginPath();
    ctx.moveTo(i * gridStep, 0);
    ctx.lineTo(i * gridStep, mapH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * gridStep);
    ctx.lineTo(mapW, i * gridStep);
    ctx.stroke();
  }

  for (const w of walls) {
    const top = ctx.createLinearGradient(w.x, w.y, w.x, w.y + w.h);
    top.addColorStop(0, colors.wallTop);
    top.addColorStop(0.3, colors.wall);
    top.addColorStop(1, '#2e2820');
    ctx.fillStyle = top;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = 'rgba(138, 154, 122, 0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
  }

  if (!extractZone) return;

  const pulse = 0.5 + Math.sin(time * 2.5) * 0.2;
  ctx.fillStyle = `rgba(46, 204, 113, ${0.15 + pulse * 0.15})`;
  ctx.fillRect(extractZone.x, extractZone.y, extractZone.w, extractZone.h);

  const glow = ctx.createRadialGradient(
    extractZone.x + extractZone.w / 2,
    extractZone.y + extractZone.h / 2,
    10,
    extractZone.x + extractZone.w / 2,
    extractZone.y + extractZone.h / 2,
    extractZone.w * 0.7
  );
  glow.addColorStop(0, `rgba(138, 154, 122, ${0.08 + pulse * 0.06})`);
  glow.addColorStop(1, 'rgba(46, 204, 113, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(extractZone.x, extractZone.y, extractZone.w, extractZone.h);

  ctx.strokeStyle = colors.extractBorder;
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.strokeRect(extractZone.x, extractZone.y, extractZone.w, extractZone.h);
  ctx.setLineDash([]);

  ctx.shadowColor = '#2ecc71';
  ctx.shadowBlur = 8 + pulse * 6;
  ctx.fillStyle = '#a8f0c8';
  ctx.font = 'bold 18px Oswald';
  ctx.textAlign = 'center';
  ctx.fillText('✦ ЭКСТРАКТ ✦', extractZone.x + extractZone.w / 2, extractZone.y + extractZone.h / 2 + 6);
  ctx.shadowBlur = 0;

  if (mapConfig?.theme === 'night') {
    ctx.fillStyle = 'rgba(0,0,20,0.45)';
    ctx.fillRect(0, 0, mapW, mapH);
  }
}
