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
import { getWeapon, calcSpread, getMuzzleOffset } from './weapons.js';
import {
  getMapTheme,
  drawMapDecor,
  drawThematicWalls,
  drawMapAmbienceOverlay,
} from './map-atmosphere.js';

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, justDown: false, worldX: 0, worldY: 0 };
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'KeyR', 'KeyE', 'KeyF', 'KeyG', 'KeyV', 'KeyQ', 'Escape', 'Tab', 'KeyI'].includes(e.code)) e.preventDefault();
      if (e.code.startsWith('Digit')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
      this.mouse.displayScaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      this.mouse.displayScaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      this.mouse.screenX = this.mouse.x * this.mouse.displayScaleX;
      this.mouse.screenY = this.mouse.y * this.mouse.displayScaleY;
    });
    canvas.addEventListener('mousedown', () => {
      this.mouse.justDown = true;
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
    this.mouse.justDown = false;
  }

  updateWorld(camX, camY, scale, canvas) {
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      this.mouse.displayScaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      this.mouse.displayScaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    }
    const sx = this.mouse.displayScaleX ?? 1;
    const sy = this.mouse.displayScaleY ?? 1;
    const mx = this.mouse.x * sx;
    const my = this.mouse.y * sy;
    this.mouse.screenX = mx;
    this.mouse.screenY = my;
    this.mouse.worldX = camX + mx / scale;
    this.mouse.worldY = camY + my / scale;
  }
}

export class Bullet {
  constructor(x, y, angle, owner, damage = 18, walls = [], maxRange = 9999, originX = x, originY = y, opts = {}) {
    this.x = x;
    this.y = y;
    this.ox = originX;
    this.oy = originY;
    const speed = opts.speed || 620;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.angle = angle;
    this.owner = owner;
    this.damage = damage;
    this.dead = false;
    this.life = 1.4;
    this.r = opts.size || 3;
    this.walls = walls;
    this.maxRange = maxRange;
    this.tracerColor = opts.tracerColor || COLORS.bullet;
    this.isPellet = !!opts.isPellet;
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
    const tail = 10 + this.r * 2;
    const tx = this.x - Math.cos(this.angle) * tail;
    const ty = this.y - Math.sin(this.angle) * tail;

    ctx.strokeStyle = this.tracerColor;
    ctx.lineWidth = this.isPellet ? 1.5 : 2.5;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
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
    const isRare = this.tier === 'valuable';
    const glow = isRare ? '#6a8a5a' : '#4a7a9a';

    ctx.globalAlpha = 0.15 + Math.sin(t) * 0.08;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = isRare ? 'rgba(90, 120, 80, 0.7)' : 'rgba(60, 90, 120, 0.65)';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isRare ? '#a8c8a0' : '#8ec8ff';
    ctx.globalAlpha = 0.7 + Math.sin(t) * 0.2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r - 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (isRare) {
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
    this.weaponAmmo = {};
    this.extractProgress = 0;
    this.kills = 0;
    this.maxArmor = 0;
    this.isSprinting = false;
    this.isMoving = false;
    this.isFiring = false;
    this.noiseLevel = 0;
    this.recoilHeat = 0;
    this.currentSpread = 0;
    this.fireBlockedReason = '';
  }

  initRaidInventory(weaponId, loadout = {}) {
    const w = getWeapon(weaponId);
    this.inventory = [{ id: weaponId, name: w.name, weapon: weaponId, starter: true }];
    this.inventory.push({ id: 'medkit', name: 'Аптечка', heal: 50, consumable: true });
    for (let i = 0; i < (loadout.extraMedkits || 0); i++) {
      this.inventory.push({ id: 'medkit', name: 'Аптечка', heal: 50, consumable: true });
    }
    this.weaponAmmo = {};
    this.selectedSlot = 0;
    this.selectSlot(0);
    if (loadout.extraAmmo) this.reserve += loadout.extraAmmo;
  }

  getSelectedItem() {
    return this.inventory[this.selectedSlot] || null;
  }

  canShoot() {
    return !!this.getSelectedItem()?.weapon;
  }

  getSlotActionHint() {
    const item = this.getSelectedItem();
    const n = this.selectedSlot + 1;
    if (!item) return `Слот ${n} пуст`;
    if (item.weapon) {
      const w = getWeapon(item.weapon);
      return w.standToFire
        ? `Слот ${n}: ${item.name} · стой · ЛКМ`
        : `Слот ${n}: ${item.name} · ЛКМ`;
    }
    if (item.heal) return `Слот ${n}: ${item.name} · F лечиться`;
    if (item.grenade) return `Слот ${n}: ${item.name} · G бросить`;
    if (item.smoke) return `Слот ${n}: ${item.name} · V дым`;
    if (item.armor) return `Слот ${n}: ${item.name} · F надеть`;
    if (item.value) return `Слот ${n}: ${item.name} · ${item.value}₽ · экстракт`;
    return `Слот ${n}: ${item.name}`;
  }

  saveWeaponAmmo() {
    if (!this.weaponId) return;
    this.weaponAmmo[this.weaponId] = { ammo: this.ammo, reserve: this.reserve };
  }

  selectSlot(idx) {
    if (idx < 0 || idx >= this.maxInv) return;
    this.selectedSlot = idx;
    const item = this.getSelectedItem();
    if (item?.weapon) {
      this.saveWeaponAmmo();
      this.equipWeapon(item.weapon);
      const cached = this.weaponAmmo[item.weapon];
      if (cached) {
        this.ammo = cached.ammo;
        this.reserve = cached.reserve;
      }
    }
  }

  useSelectedHeal() {
    const item = this.getSelectedItem();
    if (!item?.heal) return { ok: false, msg: 'Выбери слот с аптечкой или бинтом' };
    if (this.hp >= this.maxHp) return { ok: false, msg: 'HP полное' };
    const amount = item.heal;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.inventory.splice(this.selectedSlot, 1);
    if (this.selectedSlot >= this.inventory.length) {
      this.selectedSlot = Math.max(0, this.inventory.length - 1);
    }
    this.selectSlot(this.selectedSlot);
    return { ok: true, msg: `+${amount} HP`, amount };
  }

  useSelectedArmor() {
    const item = this.getSelectedItem();
    if (!item?.armor) return { ok: false, msg: 'Выбери слот с бронёй' };
    this.armor += item.armor;
    this.maxArmor = Math.max(this.maxArmor, this.armor);
    this.inventory.splice(this.selectedSlot, 1);
    if (this.selectedSlot >= this.inventory.length) {
      this.selectedSlot = Math.max(0, this.inventory.length - 1);
    }
    this.selectSlot(this.selectedSlot);
    return { ok: true, msg: `Броня +${item.armor}` };
  }

  useSelectedSlot() {
    const item = this.getSelectedItem();
    if (!item) return { ok: false, msg: 'Пустой слот' };
    if (item.heal) return this.useSelectedHeal();
    if (item.armor) return this.useSelectedArmor();
    if (item.weapon) return { ok: false, msg: 'Оружие — ЛКМ стрелять' };
    if (item.grenade) return { ok: false, msg: 'Граната — G' };
    if (item.smoke) return { ok: false, msg: 'Дымовая — V' };
    return { ok: false, msg: 'Лут — вези на экстракт' };
  }

  useSelectedGrenade() {
    const item = this.getSelectedItem();
    if (!item?.grenade) return { ok: false, msg: 'Выбери слот с гранатой' };
    this.inventory.splice(this.selectedSlot, 1);
    if (this.selectedSlot >= this.inventory.length) {
      this.selectedSlot = Math.max(0, this.inventory.length - 1);
    }
    this.selectSlot(this.selectedSlot);
    return { ok: true, msg: 'Граната!' };
  }

  useSelectedSmoke() {
    const item = this.getSelectedItem();
    if (!item?.smoke) return { ok: false, msg: 'Выбери слот с дымовой' };
    this.inventory.splice(this.selectedSlot, 1);
    if (this.selectedSlot >= this.inventory.length) {
      this.selectedSlot = Math.max(0, this.inventory.length - 1);
    }
    this.selectSlot(this.selectedSlot);
    return { ok: true, msg: 'Дымовая завеса' };
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
    this.semiAuto = !!w.semiAuto;
    this.standToFire = !!w.standToFire;
  }

  getSpreadAngle() {
    return calcSpread(this.weaponDef || getWeapon(this.weaponId), {
      moving: this.isMoving,
      sprinting: this.isSprinting && this.isMoving,
      recoilHeat: this.recoilHeat,
    });
  }

  useInventoryItem(idx) {
    this.selectSlot(idx);
    return this.useSelectedSlot();
  }

  /** @returns {Bullet[]|null} */
  update(input, dt, combat = true) {
    if (this.dead) return null;

    let dx = 0;
    let dy = 0;
    if (input.pressed('KeyW') || input.pressed('ArrowUp')) dy -= 1;
    if (input.pressed('KeyS') || input.pressed('ArrowDown')) dy += 1;
    if (input.pressed('KeyA') || input.pressed('ArrowLeft')) dx -= 1;
    if (input.pressed('KeyD') || input.pressed('ArrowRight')) dx += 1;

    this.isMoving = !!(dx || dy);
    this.isSprinting = (input.pressed('ShiftLeft') || input.pressed('ShiftRight')) && this.isMoving;
    this.isFiring = combat && this.canShoot() && input.mouse.down && this.ammo > 0 && this.reloadTime <= 0;

    const baseSpeed = this.isSprinting ? 260 : 180;
    const shootSlow = this.isFiring || this.fireCooldown > this.fireRate * 0.4;
    this.speed = shootSlow ? baseSpeed * 0.5 : baseSpeed;

    this.move(dx, dy, dt);
    this.noiseLevel = this.isSprinting ? 1 : this.isMoving ? 0.4 : 0;

    this.recoilHeat = Math.max(0, this.recoilHeat - dt * (this.semiAuto ? 2.4 : 1.6));
    this.currentSpread = this.getSpreadAngle();

    this.angle = Math.atan2(input.mouse.worldY - this.y, input.mouse.worldX - this.x);

    for (let i = 0; i < this.maxInv; i++) {
      if (input.tapped(`Digit${i + 1}`)) this.selectSlot(i);
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
    if (input.tapped('KeyR') && this.canShoot() && this.ammo < this.magSize && this.reserve > 0) {
      this.reloadTime = this.weaponDef?.reloadTime || 1.4;
      return null;
    }

    const w = this.weaponDef || getWeapon(this.weaponId);
    const trigger = w.semiAuto ? input.mouse.justDown : input.mouse.down;
    this.fireBlockedReason = '';

    if (combat && this.canShoot() && trigger && this.fireCooldown <= 0 && this.ammo > 0) {
      if (w.standToFire && this.isMoving) {
        this.fireBlockedReason = 'ПМ: остановись для выстрела';
        return null;
      }

      this.ammo -= 1;
      this.fireCooldown = w.fireRate;
      this.noiseLevel = 1;
      this.recoilHeat = Math.min(1, this.recoilHeat + (w.semiAuto ? 0.55 : 0.4));

      const spreadTotal = this.getSpreadAngle();
      const bullets = [];
      const muzzle = getMuzzleOffset(this.weaponId);
      const ox = this.x + Math.cos(this.angle) * muzzle.x;
      const oy = this.y + Math.sin(this.angle) * muzzle.x;
      const bulletOpts = {
        speed: w.bulletSpeed,
        size: w.bulletSize,
        tracerColor: w.tracerColor,
        isPellet: w.pellets > 1,
      };
      for (let i = 0; i < w.pellets; i++) {
        const spread = (Math.random() - 0.5) * spreadTotal * 2;
        bullets.push(
          new Bullet(
            ox,
            oy,
            this.angle + spread,
            'player',
            this.weaponDamage,
            this.walls,
            this.weaponRange,
            ox,
            oy,
            bulletOpts
          )
        );
      }
      return {
        bullets,
        recoilKick: w.recoilKick || 6,
        muzzleColor: w.muzzleColor,
        shellEject: w.semiAuto,
      };
    }
    return null;
  }

  dropSelected() {
    const item = this.inventory[this.selectedSlot];
    if (!item) return { ok: false, msg: 'Слот пуст' };
    if (item.starter) return { ok: false, msg: 'Нельзя выбросить основное оружие' };
    this.inventory.splice(this.selectedSlot, 1);
    if (this.selectedSlot >= this.inventory.length) {
      this.selectedSlot = Math.max(0, this.inventory.length - 1);
    }
    this.selectSlot(this.selectedSlot);
    return { ok: true, item, msg: `Выброшено: ${item.name}` };
  }

  addLoot(item) {
    if (item.id === 'empty') return { ok: true, msg: 'Ничего полезного.' };
    if (item.ammo) {
      this.reserve += item.ammo;
      return { ok: true, msg: `+${item.ammo} патронов в запас` };
    }
    if (this.inventory.length >= this.maxInv) {
      return { ok: false, msg: 'Рюкзак полон! Выброси слот (Q) или разверни рюкзак' };
    }
    this.inventory.push(item);
    const price = item.value ? ` · ${item.value}₽` : '';
    let hint = 'выбери слот';
    if (item.weapon) hint = '1–6 → ЛКМ';
    else if (item.heal) hint = '1–6 → F';
    else if (item.grenade) hint = '1–6 → G';
    else if (item.smoke) hint = '1–6 → V';
    else if (item.armor) hint = '1–6 → F';
    return { ok: true, msg: `В рюкзак: ${item.name}${price} (${hint})` };
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

    this.drawWeaponModel(ctx);

    ctx.restore();
  }

  drawWeaponModel(ctx) {
    const id = this.weaponId;
    if (id === 'pm') {
      ctx.fillStyle = '#1a1510';
      ctx.fillRect(6, -3, 14, 6);
      ctx.fillStyle = '#3d3428';
      ctx.fillRect(18, -2, 8, 4);
      ctx.fillStyle = '#5a4a38';
      ctx.fillRect(4, -1, 6, 2);
    } else if (id === 'ak') {
      ctx.fillStyle = '#2a2418';
      ctx.fillRect(4, -4, 22, 8);
      ctx.fillStyle = '#4a4030';
      ctx.fillRect(22, -2, 14, 4);
      ctx.fillStyle = '#6b5a40';
      ctx.fillRect(8, -6, 8, 3);
      ctx.fillStyle = '#8b7355';
      ctx.fillRect(-2, -2, 8, 4);
    } else if (id === 'shotgun') {
      ctx.fillStyle = '#2c2418';
      ctx.fillRect(2, -5, 20, 10);
      ctx.fillStyle = '#4a4035';
      ctx.fillRect(20, -3, 12, 6);
      ctx.fillStyle = '#6b5d4d';
      ctx.fillRect(0, -3, 8, 6);
    } else {
      ctx.fillStyle = '#2c2418';
      ctx.fillRect(8, -4, 18, 8);
    }
  }

  drawSpreadCone(ctx) {
    if (!this.canShoot()) return;
    const spread = this.currentSpread;
    if (spread < 0.005) return;

    const maxRange = this.weaponRange > 0 && this.weaponRange < 9000 ? this.weaponRange : 420;
    const range = Math.max(280, maxRange);

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    const leftX = range * Math.cos(-spread);
    const leftY = range * Math.sin(-spread);
    const rightX = range * Math.cos(spread);
    const rightY = range * Math.sin(spread);

    ctx.fillStyle = 'rgba(138, 154, 122, 0.12)';
    ctx.strokeStyle = 'rgba(138, 154, 122, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(leftX, leftY);
    ctx.arc(0, 0, range, -spread, spread);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(200, 220, 180, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(leftX, leftY);
    ctx.moveTo(0, 0);
    ctx.lineTo(rightX, rightY);
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
  const theme = getMapTheme(mapConfig?.theme);
  const walls = mapConfig?.walls || [];
  const extractZone = mapConfig?.extractZone;
  const mapW = mapConfig?.mapW || MAP_W;
  const mapH = mapConfig?.mapH || MAP_H;
  const gridW = mapConfig?.gridW || 40;
  const isNight = mapConfig?.theme === 'night';

  const bg = ctx.createLinearGradient(0, 0, mapW, mapH);
  bg.addColorStop(0, theme.floorAlt);
  bg.addColorStop(0.45, theme.floor);
  bg.addColorStop(1, theme.floorAlt);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, mapW, mapH);

  ctx.strokeStyle = theme.floorGrid;
  ctx.lineWidth = 1;
  const gridStep = mapW / gridW;
  for (let i = 0; i <= gridW; i++) {
    ctx.globalAlpha = i % 3 === 0 ? 0.55 : 0.28;
    ctx.beginPath();
    ctx.moveTo(i * gridStep, 0);
    ctx.lineTo(i * gridStep, mapH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * gridStep);
    ctx.lineTo(mapW, i * gridStep);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  drawMapDecor(ctx, mapConfig, time);
  drawThematicWalls(ctx, walls, theme);

  if (!extractZone) {
    drawMapAmbienceOverlay(ctx, mapConfig, time);
    return;
  }

  const pulse = 0.5 + Math.sin(time * 2.5) * 0.2;
  const extractFill = isNight ? `rgba(46, 120, 200, ${0.12 + pulse * 0.1})` : `rgba(180, 140, 40, ${0.14 + pulse * 0.12})`;
  ctx.fillStyle = extractFill;
  ctx.fillRect(extractZone.x, extractZone.y, extractZone.w, extractZone.h);

  const glow = ctx.createRadialGradient(
    extractZone.x + extractZone.w / 2,
    extractZone.y + extractZone.h / 2,
    8,
    extractZone.x + extractZone.w / 2,
    extractZone.y + extractZone.h / 2,
    extractZone.w * 0.85
  );
  glow.addColorStop(0, isNight ? `rgba(100, 180, 255, ${0.1 + pulse * 0.08})` : `rgba(220, 180, 60, ${0.12 + pulse * 0.08})`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(extractZone.x, extractZone.y, extractZone.w, extractZone.h);

  ctx.strokeStyle = isNight ? '#3a8ac8' : theme.hazard;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 7]);
  ctx.strokeRect(extractZone.x, extractZone.y, extractZone.w, extractZone.h);
  ctx.setLineDash([]);

  ctx.shadowColor = isNight ? '#4a9adc' : '#c9a227';
  ctx.shadowBlur = 6 + pulse * 8;
  ctx.fillStyle = isNight ? '#8ec8ff' : '#e8d080';
  ctx.font = 'bold 16px Oswald';
  ctx.textAlign = 'center';
  ctx.fillText(isNight ? '◈ ЭКСТРАКТ ◈' : '✦ ЭКСТРАКТ ✦', extractZone.x + extractZone.w / 2, extractZone.y + extractZone.h / 2 + 5);
  ctx.shadowBlur = 0;

  drawMapAmbienceOverlay(ctx, mapConfig, time);
}
