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
import {
  getWeapon,
  calcSpread,
  calcSniperSpread,
  getFireRate,
  getMuzzleOffset,
  PLAYER_FIRE_RATE_MULT,
  PLAYER_BULLET_SPEED_MULT,
  RAID_LOOT_VALUE_MULT,
  BULLET_SIZE_MULT,
} from './weapons.js';
import {
  emptyBackpack,
  emptyHotbar,
  cloneEquipped,
  cloneBackpack,
  cloneHotbar,
  BACKPACK_SIZE,
  HOTBAR_SIZE,
  addToBackpack,
  removeFromBackpack,
  addToLoadout,
  normalizeLoadout,
  findEmptyLoadoutSlot,
  swapLoadoutSlots,
  cloneItem,
  stackItems,
} from './inventory-core.js';
import {
  getMapTheme,
  drawMapDecor,
  drawThematicWalls,
  drawMapAmbienceOverlay,
} from './map-atmosphere.js';
import { isBlindedBySmoke } from './scav-ai.js';

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
    this.r = (opts.size || 2) * BULLET_SIZE_MULT;
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
    const tail = 9 + this.r * 1.8;
    const tx = this.x - Math.cos(this.angle) * tail;
    const ty = this.y - Math.sin(this.angle) * tail;

    ctx.strokeStyle = this.tracerColor;
    ctx.lineWidth = (this.isPellet ? 0.65 : 0.9) * BULLET_SIZE_MULT;
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

const WALK_SPEED = 63;
const SPRINT_SPEED = 180;
const STAMINA_DRAIN_RATE = 1 / 5;
const STAMINA_REGEN_DELAY = 2;
const STAMINA_REGEN_RATE = 1 / 4;

export function drawHeldWeapon(ctx, weaponId) {
  const id = weaponId;
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
  } else if (id === 'pp') {
    ctx.fillStyle = '#2a2820';
    ctx.fillRect(6, -3, 16, 6);
    ctx.fillStyle = '#4a4438';
    ctx.fillRect(20, -2, 10, 4);
    ctx.fillStyle = '#6a6050';
    ctx.fillRect(2, -2, 8, 4);
  } else if (id === 'shotgun') {
    ctx.fillStyle = '#2c2418';
    ctx.fillRect(2, -5, 20, 10);
    ctx.fillStyle = '#4a4035';
    ctx.fillRect(20, -3, 12, 6);
    ctx.fillStyle = '#6b5d4d';
    ctx.fillRect(0, -3, 8, 6);
  } else if (id === 'sniper') {
    ctx.fillStyle = '#1e1a14';
    ctx.fillRect(0, -3, 34, 6);
    ctx.fillStyle = '#3a3228';
    ctx.fillRect(32, -2, 10, 4);
    ctx.fillStyle = '#5a5040';
    ctx.fillRect(-4, -2, 10, 4);
    ctx.fillStyle = '#2a2820';
    ctx.fillRect(10, -7, 6, 4);
    ctx.fillStyle = '#4a4438';
    ctx.fillRect(12, -9, 2, 6);
  } else if (id) {
    ctx.fillStyle = '#2c2418';
    ctx.fillRect(8, -4, 18, 8);
  }
}

export class Player extends Entity {
  constructor(x, y, walls = []) {
    super(x, y, 16, walls);
    this.clearWeaponState();
    this.reserve = 36;
    this.fireCooldown = 0;
    this.reloadTime = 0;
    this.reloadDuration = 0;
    this.hotbar = emptyHotbar();
    this.backpack = emptyBackpack();
    this.equipped = { weapon: null, armor: null };
    this.maxInv = HOTBAR_SIZE;
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
    this.coneRange = 0;
    this.stoppedTime = 0;
    this.activeHeal = null;
    this.stamina = 1;
    this.staminaRegenDelay = 0;
  }

  initRaidInventory(loadout = {}) {
    const ld = normalizeLoadout(loadout);
    this.hotbar = cloneHotbar(ld.hotbar);
    this.backpack = cloneBackpack(ld.backpack);
    this.equipped = cloneEquipped(ld.equipped);
    this.weaponAmmo = {};
    this.selectedSlot = 0;
    this.armor = 0;
    this.maxArmor = 0;
    this.clearWeaponState();

    if (this.equipped.weapon) {
      this.equipWeapon(this.equipped.weapon.weapon);
    } else {
      const fromHotbar = this.hotbar.findIndex((i) => i?.weapon);
      if (fromHotbar >= 0) this.equipWeaponFromSlot('hotbar', fromHotbar);
      else {
        const fromBp = this.backpack.findIndex((i) => i?.weapon);
        if (fromBp >= 0) this.equipWeaponFromSlot('backpack', fromBp);
      }
    }

    if (this.equipped.armor) {
      this.armor = this.equipped.armor.armor || 0;
      this.maxArmor = this.armor;
    } else {
      const fromHotbar = this.hotbar.findIndex((i) => i?.armor);
      if (fromHotbar >= 0) this.equipArmorFromSlot('hotbar', fromHotbar);
      else {
        const fromBp = this.backpack.findIndex((i) => i?.armor);
        if (fromBp >= 0) this.equipArmorFromSlot('backpack', fromBp);
      }
    }
  }

  getSlotArray(zone) {
    return zone === 'hotbar' ? this.hotbar : this.backpack;
  }

  get inventory() {
    return this.hotbar;
  }

  getSelectedItem() {
    return this.hotbar[this.selectedSlot] || null;
  }

  canShoot() {
    return !!this.equipped.weapon?.weapon;
  }

  getSlotActionHint() {
    const item = this.getSelectedItem();
    const n = this.selectedSlot + 1;
    const wName = this.equipped.weapon?.name || 'нет оружия';
    if (!item) return `Слот ${n} пуст · ${wName}`;
    if (!this.canShoot()) return `Слот ${n}: ${item.name} · ${wName}`;
    if (item.heal) return `Слот ${n}: ${item.name} · F лечиться · ${wName} · ЛКМ`;
    if (item.grenade) return `Слот ${n}: ${item.name} · G · ${wName} · ЛКМ`;
    if (item.smoke) return `Слот ${n}: ${item.name} · V · ${wName} · ЛКМ`;
    if (item.armor) return `Слот ${n}: ${item.name} · Tab — надень на персонажа`;
    if (item.ammo) return `Слот ${n}: ${item.name} · R забирает в запас`;
    if (item.weapon) return `Слот ${n}: ${item.name} · Tab — надень на персонажа`;
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
  }

  backpackFilledCount() {
    return this.hotbar.filter(Boolean).length + this.backpack.filter(Boolean).length;
  }

  getCarriedLoot() {
    const loot = [];
    for (const item of [...this.hotbar, ...this.backpack]) {
      if (item) loot.push(cloneItem(item));
    }
    if (this.equipped.weapon) loot.push(cloneItem(this.equipped.weapon));
    if (this.equipped.armor) loot.push(cloneItem(this.equipped.armor));
    return stackItems(loot);
  }

  getLootValue() {
    return this.getCarriedLoot().reduce((s, i) => s + (i.value || 0) * (i.count || 1), 0);
  }

  feedReserveFromBackpack() {
    for (const slots of [this.hotbar, this.backpack]) {
      for (let i = 0; i < slots.length; i++) {
        const item = slots[i];
        if (!item?.ammo) continue;
        while (item.count > 0) {
          this.reserve += item.ammo;
          const r = removeFromBackpack(slots, i, 1);
          if (!r.ok) break;
          if (!slots[i]?.ammo) break;
        }
      }
    }
  }

  pullAmmoFromBackpack(needed) {
    let got = 0;
    for (const slots of [this.hotbar, this.backpack]) {
      for (let i = 0; i < slots.length && got < needed; i++) {
        const item = slots[i];
        if (!item?.ammo) continue;
        const r = removeFromBackpack(slots, i, 1);
        if (!r.ok || !r.item) continue;
        got += r.item.ammo || 0;
      }
    }
    return got;
  }

  equipWeaponFromSlot(zone, slotIdx) {
    const slots = this.getSlotArray(zone);
    const item = slots[slotIdx];
    if (!item?.weapon) return { ok: false, msg: 'Не оружие' };
    this.saveWeaponAmmo();
    const removed = removeFromBackpack(slots, slotIdx, 1);
    if (!removed.ok || !removed.item) return { ok: false, msg: 'Не удалось взять' };
    if (this.equipped.weapon) {
      const dest = findEmptyLoadoutSlot({ hotbar: this.hotbar, backpack: this.backpack });
      if (!dest) {
        slots[slotIdx] = removed.item;
        return { ok: false, msg: 'Нет свободного слота для старого оружия' };
      }
      this.getSlotArray(dest.zone)[dest.index] = cloneItem(this.equipped.weapon);
    }
    this.equipped.weapon = removed.item;
    this.equipWeapon(removed.item.weapon);
    const cached = this.weaponAmmo[removed.item.weapon];
    if (cached) {
      this.ammo = cached.ammo;
      this.reserve = cached.reserve;
    }
    return { ok: true, msg: `Оружие: ${removed.item.name}` };
  }

  equipWeaponFromBackpack(slotIdx) {
    return this.equipWeaponFromSlot('backpack', slotIdx);
  }

  unequipWeaponToSlot(zone, slotIdx) {
    const weapon = this.equipped.weapon;
    if (!weapon) return { ok: false, msg: 'Нет оружия' };
    const slots = this.getSlotArray(zone);
    if (slots[slotIdx]) return { ok: false, msg: 'Слот занят' };
    this.saveWeaponAmmo();
    slots[slotIdx] = cloneItem(weapon);
    this.equipped.weapon = null;
    this.clearWeaponState();
    return { ok: true, msg: 'Оружие снято' };
  }

  unequipWeaponToBackpack(slotIdx) {
    return this.unequipWeaponToSlot('backpack', slotIdx);
  }

  equipArmorFromSlot(zone, slotIdx) {
    const slots = this.getSlotArray(zone);
    const item = slots[slotIdx];
    if (!item?.armor) return { ok: false, msg: 'Не броня' };
    const removed = removeFromBackpack(slots, slotIdx, 1);
    if (!removed.ok || !removed.item) return { ok: false, msg: 'Не удалось надеть' };
    if (this.equipped.armor) {
      const dest = findEmptyLoadoutSlot({ hotbar: this.hotbar, backpack: this.backpack });
      if (!dest) {
        slots[slotIdx] = removed.item;
        return { ok: false, msg: 'Нет свободного слота для старой брони' };
      }
      this.getSlotArray(dest.zone)[dest.index] = cloneItem(this.equipped.armor);
      this.armor = Math.max(0, this.armor - (this.equipped.armor.armor || 0));
    }
    this.equipped.armor = removed.item;
    this.armor += removed.item.armor || 0;
    this.maxArmor = Math.max(this.maxArmor, this.armor);
    return { ok: true, msg: `Броня +${removed.item.armor}` };
  }

  equipArmorFromBackpack(slotIdx) {
    return this.equipArmorFromSlot('backpack', slotIdx);
  }

  unequipArmorToSlot(zone, slotIdx) {
    const armor = this.equipped.armor;
    if (!armor) return { ok: false, msg: 'Нет брони' };
    const slots = this.getSlotArray(zone);
    if (slots[slotIdx]) return { ok: false, msg: 'Слот занят' };
    slots[slotIdx] = cloneItem(armor);
    this.armor = Math.max(0, this.armor - (armor.armor || 0));
    this.maxArmor = this.armor;
    this.equipped.armor = null;
    return { ok: true, msg: 'Броня снята' };
  }

  unequipArmorToBackpack(slotIdx) {
    return this.unequipArmorToSlot('backpack', slotIdx);
  }

  swapInventorySlots(fromZone, fromIdx, toZone, toIdx) {
    return swapLoadoutSlots(
      { hotbar: this.hotbar, backpack: this.backpack, equipped: this.equipped },
      fromZone,
      fromIdx,
      toZone,
      toIdx
    );
  }

  dropEquipped(type) {
    const item = this.equipped[type];
    if (!item) return { ok: false, msg: 'Слот пуст' };
    if (type === 'weapon') {
      this.saveWeaponAmmo();
      this.equipped.weapon = null;
      this.clearWeaponState();
    } else {
      this.armor = Math.max(0, this.armor - (item.armor || 0));
      this.maxArmor = this.armor;
      this.equipped.armor = null;
    }
    return { ok: true, item: cloneItem(item), msg: `Выброшено: ${item.name}` };
  }

  dropFromSlot(zone, slotIdx) {
    const slots = this.getSlotArray(zone);
    const removed = removeFromBackpack(slots, slotIdx, 1);
    if (!removed.ok || !removed.item) return { ok: false, msg: 'Слот пуст' };
    return { ok: true, item: removed.item, msg: `Выброшено: ${removed.item.name}` };
  }

  useSelectedHeal() {
    const item = this.getSelectedItem();
    if (!item?.heal) return { ok: false, msg: 'Выбери слот с аптечкой или бинтом' };
    if (this.hp >= this.maxHp) return { ok: false, msg: 'HP полное' };
    if (this.activeHeal) return { ok: false, msg: 'Уже лечишься' };
    const amount = item.heal;
    const duration = item.healDuration || 1;
    removeFromBackpack(this.hotbar, this.selectedSlot, 1);
    this.activeHeal = { total: amount, duration, elapsed: 0, baseHp: this.hp };
    const secLabel = duration === 1 ? '1 сек' : `${duration} сек`;
    return { ok: true, msg: `+${amount} HP (${secLabel})`, amount, duration };
  }

  tickHeal(dt) {
    if (!this.activeHeal) return;
    const h = this.activeHeal;
    h.elapsed += dt;
    const t = Math.min(1, h.elapsed / h.duration);
    this.hp = Math.min(this.maxHp, h.baseHp + h.total * t);
    if (t >= 1) this.activeHeal = null;
  }

  tickStamina(dt, wantSprint) {
    const canSprint = wantSprint && this.stamina > 0.001;
    if (canSprint) {
      this.stamina = Math.max(0, this.stamina - dt * STAMINA_DRAIN_RATE);
      this.staminaRegenDelay = STAMINA_REGEN_DELAY;
      this.isSprinting = true;
    } else {
      if (this.isSprinting) this.staminaRegenDelay = STAMINA_REGEN_DELAY;
      this.isSprinting = false;
      if (this.staminaRegenDelay > 0) {
        this.staminaRegenDelay = Math.max(0, this.staminaRegenDelay - dt);
      } else if (this.stamina < 1) {
        this.stamina = Math.min(1, this.stamina + dt * STAMINA_REGEN_RATE);
      }
    }
  }

  useSelectedArmor() {
    const item = this.getSelectedItem();
    if (!item?.armor) return { ok: false, msg: 'Выбери слот с бронёй' };
    return this.equipArmorFromSlot('hotbar', this.selectedSlot);
  }

  useSelectedSlot() {
    const item = this.getSelectedItem();
    if (!item) return { ok: false, msg: 'Пустой слот' };
    if (item.heal) return this.useSelectedHeal();
    if (item.armor) return this.useSelectedArmor();
    if (item.weapon) return { ok: false, msg: 'Tab — надень оружие на персонажа' };
    if (item.ammo) return { ok: false, msg: 'R — забрать патроны в запас' };
    if (item.grenade) return { ok: false, msg: 'Граната — G' };
    if (item.smoke) return { ok: false, msg: 'Дымовая — V' };
    return { ok: false, msg: 'Лут — вези на экстракт' };
  }

  useSelectedGrenade() {
    const item = this.getSelectedItem();
    if (!item?.grenade) return { ok: false, msg: 'Выбери слот с гранатой' };
    removeFromBackpack(this.hotbar, this.selectedSlot, 1);
    return { ok: true, msg: 'Граната!' };
  }

  useSelectedSmoke() {
    const item = this.getSelectedItem();
    if (!item?.smoke) return { ok: false, msg: 'Выбери слот с дымовой' };
    removeFromBackpack(this.hotbar, this.selectedSlot, 1);
    return { ok: true, msg: 'Дымовая завеса' };
  }

  clearWeaponState() {
    this.weaponId = null;
    this.weaponName = '—';
    this.magSize = 0;
    this.ammo = 0;
    this.weaponDamage = 0;
    this.fireRate = 0;
    this.spread = 0;
    this.moveSpread = 0;
    this.sprintSpread = 0;
    this.pellets = 1;
    this.weaponRange = 0;
    this.weaponDef = null;
    this.semiAuto = false;
    this.standToFire = false;
  }

  equipWeapon(id) {
    if (!id) {
      this.clearWeaponState();
      return;
    }
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

  getEffectiveFireRate() {
    const w = this.weaponDef || getWeapon(this.weaponId);
    if (!w) return 0;
    return getFireRate(w, { moving: this.isMoving, sprinting: this.isSprinting && this.isMoving })
      * PLAYER_FIRE_RATE_MULT;
  }

  getSpreadAngle() {
    if (!this.canShoot()) return 0;
    const w = this.weaponDef || getWeapon(this.weaponId);
    if (w.sniper) {
      return calcSniperSpread(w, {
        moving: this.isMoving,
        sprinting: this.isSprinting && this.isMoving,
        stoppedTime: this.stoppedTime,
        recoilHeat: this.recoilHeat,
      });
    }
    return calcSpread(w, {
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
  update(input, dt, combat = true, opts = {}) {
    const { autoReload = false } = opts;
    if (this.dead) return null;

    let dx = 0;
    let dy = 0;
    if (input.pressed('KeyW') || input.pressed('ArrowUp')) dy -= 1;
    if (input.pressed('KeyS') || input.pressed('ArrowDown')) dy += 1;
    if (input.pressed('KeyA') || input.pressed('ArrowLeft')) dx -= 1;
    if (input.pressed('KeyD') || input.pressed('ArrowRight')) dx += 1;

    this.isMoving = !!(dx || dy);
    if (this.isMoving) {
      this.stoppedTime = 0;
    } else {
      this.stoppedTime += dt;
    }
    const wantSprint =
      (input.pressed('ShiftLeft') || input.pressed('ShiftRight')) && this.isMoving && this.reloadTime <= 0;
    this.tickStamina(dt, wantSprint);
    this.isFiring =
      combat && this.canShoot() && input.mouse.down && this.ammo > 0 && this.reloadTime <= 0;

    const baseSpeed = this.isSprinting ? SPRINT_SPEED : WALK_SPEED;
    const shootSlow = this.isFiring || this.fireCooldown > this.getEffectiveFireRate() * 0.4;
    const reloading = this.reloadTime > 0;
    this.speed = reloading ? baseSpeed * 0.35 : shootSlow ? baseSpeed * 0.5 : baseSpeed;

    this.move(dx, dy, dt);
    this.noiseLevel = this.isSprinting ? 1 : 0;

    this.recoilHeat = Math.max(0, this.recoilHeat - dt * (this.semiAuto ? 2.4 : 1.6));
    this.tickHeal(dt);
    this.currentSpread = this.getSpreadAngle();

    this.angle = Math.atan2(input.mouse.worldY - this.y, input.mouse.worldX - this.x);

    for (let i = 0; i < this.maxInv; i++) {
      if (input.tapped(`Digit${i + 1}`)) this.selectSlot(i);
    }

    if (this.reloadTime > 0) {
      this.reloadTime -= dt;
      if (this.reloadTime <= 0) {
        if (this.reserve <= 0) this.reserve += this.pullAmmoFromBackpack(this.magSize);
        if (this.reserve > 0) {
          const need = this.magSize - this.ammo;
          const load = Math.min(need, this.reserve);
          this.ammo += load;
          this.reserve -= load;
        }
      }
      return null;
    }

    this.fireCooldown -= dt;
    if (input.tapped('KeyR') && this.canShoot()) {
      if (this.ammo < this.magSize) {
        if (this.reserve <= 0) {
          const pulled = this.pullAmmoFromBackpack(this.magSize - this.ammo);
          this.reserve += pulled;
        }
        if (this.reserve > 0 && this.reloadTime <= 0) {
          this.reloadDuration = this.weaponDef?.reloadTime || 1.4;
          this.reloadTime = this.reloadDuration;
        }
      }
    }

    if (
      autoReload &&
      combat &&
      this.canShoot() &&
      this.ammo <= 0 &&
      this.reloadTime <= 0 &&
      !input.tapped('KeyR')
    ) {
      if (this.reserve <= 0) this.reserve += this.pullAmmoFromBackpack(this.magSize);
      if (this.reserve > 0) {
        this.reloadDuration = this.weaponDef?.reloadTime || 1.4;
        this.reloadTime = this.reloadDuration;
      }
    }

    const w = this.weaponDef || getWeapon(this.weaponId);
    const trigger = input.mouse.down && !(w.standToFire && this.isMoving);
    this.fireBlockedReason = '';
    if (w.standToFire && this.isMoving) {
      this.fireBlockedReason = 'Стоя';
    }

    if (combat && this.canShoot() && trigger && this.fireCooldown <= 0 && this.ammo > 0) {
      this.ammo -= 1;
      this.fireCooldown = this.getEffectiveFireRate();
      this.noiseLevel = 1;
      this.recoilHeat = Math.min(1, this.recoilHeat + (w.semiAuto ? 0.55 : 0.4));

      const spreadTotal = this.getSpreadAngle();
      const bullets = [];
      const muzzle = getMuzzleOffset(this.weaponId);
      const ox = this.x + Math.cos(this.angle) * muzzle.x;
      const oy = this.y + Math.sin(this.angle) * muzzle.x;
      const bulletOpts = {
        speed: w.bulletSpeed * PLAYER_BULLET_SPEED_MULT,
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
            this.getShotRange(),
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
    return this.dropFromSlot('hotbar', this.selectedSlot);
  }

  addLoot(item) {
    if (item.id === 'empty') return { ok: true, msg: 'Ничего полезного.' };
    const enriched = { ...item };
    if (enriched.value > 0) enriched.value *= RAID_LOOT_VALUE_MULT;
    const r = addToLoadout(
      { hotbar: this.hotbar, backpack: this.backpack, equipped: this.equipped },
      enriched,
      enriched.count || 1
    );
    if (!r.ok) return { ok: false, msg: 'Рюкзак полон! Выброси (Q) или разверни рюкзак' };
    const price = enriched.value ? ` · ${enriched.value}₽` : '';
    let hint = 'Tab — рюкзак';
    if (enriched.weapon || enriched.armor) hint = 'Tab — надень на персонажа';
    else if (enriched.heal) hint = 'F';
    else if (enriched.grenade) hint = 'G';
    else if (enriched.smoke) hint = 'V';
    else if (enriched.ammo) hint = 'R — в запас';
    const where = r.zone === 'hotbar' ? 'панель' : 'рюкзак';
    return { ok: true, msg: `В ${where}: ${enriched.name}${price} (${hint})` };
  }

  draw(ctx) {
    this.drawSpreadCone(ctx);

    if (this.reloadTime > 0 && this.reloadDuration > 0) {
      const prog = 1 - this.reloadTime / this.reloadDuration;
      ctx.strokeStyle = 'rgba(46, 204, 113, 0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
      ctx.stroke();
    }

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
    drawHeldWeapon(ctx, this.weaponId);
  }

  getShotRange() {
    return this.coneRange > 0 ? this.coneRange : 120;
  }

  drawSpreadCone(ctx) {
    if (!this.canShoot()) return;
    const spread = this.currentSpread;
    if (spread <= 0) return;

    const range = this.getShotRange();
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.fillStyle = 'rgba(138, 154, 122, 0.05)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, range, -spread, spread);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(138, 154, 122, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, range, -spread, spread);
    ctx.stroke();
    ctx.restore();
  }
}

const SCAV_BULLET_SPREAD = 0.225;
const BOSS_BULLET_SPREAD = SCAV_BULLET_SPREAD * 0.9;
const NPC_BURST_ROUND_DELAY = getWeapon('ak').fireRate;
const NPC_BURST_PAUSE = 2.5;
const SCAV_COMBAT_MIN_DIST = 200;

export class Scav extends Entity {
  constructor(x, y, walls = [], opts = {}) {
    super(x, y, opts.isBoss ? 20 : 15, walls);
    this.isBoss = !!opts.isBoss;
    this.state = 'patrol';
    this.targetX = x;
    this.targetY = y;
    this.homeX = x;
    this.homeY = y;
    this.wait = 0;
    this.fireCooldown = 0;
    this.speed = this.isBoss ? 65 : 43;
    this.vision = 320;
    this.burstIndex = 0;
    this.burstPause = 0;
    this.burstSize = this.isBoss ? 0 : 3;
    this.burstPauseDuration = NPC_BURST_PAUSE;
    this.name = this.isBoss ? 'Босс' : 'Scav';
    this.bodyColor = this.isBoss ? (COLORS.boss || '#8e24aa') : COLORS.scav;
    this.hp = this.isBoss ? 500 : 125;
    this.maxHp = this.hp;
    this.magSize = this.isBoss ? 24 : 12;
    this.ammo = this.magSize;
    this.reloadTime = 0;
    this.reloadDuration = this.isBoss ? 2 : 1.8;
    this.fireLock = 0;
    this.isFiring = false;
    this.bulletDamage = this.isBoss ? 16 : 14;
    this.lostSightTimer = 0;
    this.searchTimer = 0;
    this.searchLook = { x, y };
    this.loot = [];
    this.looted = false;
    this.searchProgress = 0;
    this.alertPos = null;
    this.spawnedByBoss = !!opts.spawnedByBoss;
    this.chargeTimer = 0;
    this.isCharging = false;
    this.runSpeed = this.isBoss ? 88 : 73;
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

  canSeePlayer(player, smokeZones = []) {
    if (player.dead) return false;
    const d = dist(this.x, this.y, player.x, player.y);
    if (d >= this.vision) return false;
    if (!this.hasLineOfSight(player.x, player.y)) return false;
    if (isBlindedBySmoke(this.x, this.y, player.x, player.y, smokeZones)) return false;
    return true;
  }

  onDamagedBy(px, py, player = null, smokeZones = []) {
    const aimX = player?.x ?? px;
    const aimY = player?.y ?? py;
    this.angle = Math.atan2(aimY - this.y, aimX - this.x);
    this.burstPause = 0;
    if (player && this.canSeePlayer(player, smokeZones)) {
      this.state = 'attack';
      this.alertPos = null;
      this.lostSightTimer = 0;
      this.fireCooldown = Math.min(this.fireCooldown, 0.06);
    } else {
      this.state = 'investigate';
      this.alertPos = { x: aimX, y: aimY };
      this.lostSightTimer = 0;
    }
  }

  chargeToward(tx, ty, dt, rate = 1) {
    const pdx = tx - this.x;
    const pdy = ty - this.y;
    const len = Math.hypot(pdx, pdy);
    if (len < 10) return false;
    const prevSpeed = this.speed;
    this.speed = this.runSpeed;
    this.move(pdx, pdy, dt * rate);
    this.speed = prevSpeed;
    this.angle = Math.atan2(pdy, pdx);
    this.isCharging = true;
    return true;
  }

  attackMove(player, d, dt) {
    if (this.reloadTime > 0 || this.fireLock > 0) return;
    const rate = this.isBoss ? 1.15 : 0.95;
    if (d < SCAV_COMBAT_MIN_DIST) {
      const backX = this.x + (this.x - player.x);
      const backY = this.y + (this.y - player.y);
      this.chargeToward(backX, backY, dt, 0.55);
      return;
    }
    if (d > SCAV_COMBAT_MIN_DIST + 20) {
      const ringX = player.x + ((this.x - player.x) / d) * SCAV_COMBAT_MIN_DIST;
      const ringY = player.y + ((this.y - player.y) / d) * SCAV_COMBAT_MIN_DIST;
      this.chargeToward(ringX, ringY, dt, rate);
    }
  }

  pickBurstSize() {
    return this.isBoss ? 3 + Math.floor(Math.random() * 4) : 3;
  }

  pickBurstPause() {
    return NPC_BURST_PAUSE;
  }

  tryShoot(player, d, dt) {
    if (this.reloadTime > 0 || this.fireLock > 0) return null;
    if (this.burstPause > 0) return null;
    if (this.ammo <= 0) {
      this.reloadTime = this.reloadDuration;
      this.burstIndex = 0;
      return null;
    }
    if (this.fireCooldown > 0) return null;
    if (d >= this.vision) return null;

    if (this.burstIndex === 0) this.burstSize = this.pickBurstSize();

    this.isFiring = true;
    this.fireLock = 0.06;
    this.ammo -= 1;
    this.burstIndex += 1;
    if (this.burstIndex >= this.burstSize) {
      this.burstIndex = 0;
      this.burstPause = this.pickBurstPause();
      this.fireCooldown = 0;
    } else {
      this.fireCooldown = NPC_BURST_ROUND_DELAY;
    }
    const spread = (Math.random() - 0.5) * (this.isBoss ? BOSS_BULLET_SPREAD : SCAV_BULLET_SPREAD);
    return new Bullet(
      this.x + Math.cos(this.angle) * 18,
      this.y + Math.sin(this.angle) * 18,
      this.angle + spread,
      'scav',
      this.bulletDamage,
      this.walls
    );
  }

  update(dt, player, bullets, noiseEvents = [], smokeZones = []) {
    if (this.dead) return null;
    this.isCharging = false;

    if (this.reloadTime > 0) {
      this.reloadTime -= dt;
      if (this.reloadTime <= 0) this.ammo = this.magSize;
      this.isFiring = false;
      this.burstIndex = 0;
      this.burstPause = 0;
      return null;
    }
    if (this.fireLock > 0) this.fireLock -= dt;
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.burstPause > 0) this.burstPause -= dt;
    if (this.fireLock <= 0) this.isFiring = false;

    const d = dist(this.x, this.y, player.x, player.y);
    const seesPlayer = this.canSeePlayer(player, smokeZones);

    if (seesPlayer) {
      if (this.state !== 'attack') this.fireCooldown = Math.min(this.fireCooldown, 0.1);
      this.state = 'attack';
      this.alertPos = null;
      this.lostSightTimer = 0;
    } else if (this.state === 'attack') {
      this.state = 'investigate';
      this.alertPos = { x: player.x, y: player.y };
      this.lostSightTimer = 0;
    }

    if (this.state === 'attack' && seesPlayer) {
      this.attackMove(player, d, dt);
      this.angle = Math.atan2(player.y - this.y, player.x - this.x);
      return this.tryShoot(player, d, dt);
    }

    if (this.state === 'patrol' && noiseEvents.length) {
      for (const n of noiseEvents) {
        if (dist(this.x, this.y, n.x, n.y) <= n.radius) {
          this.state = 'investigate';
          this.alertPos = { x: n.x, y: n.y };
          break;
        }
      }
    }

    if (this.state === 'investigate' && this.alertPos) {
      const pdx = this.alertPos.x - this.x;
      const pdy = this.alertPos.y - this.y;
      if (Math.hypot(pdx, pdy) > 24) {
        this.chargeToward(this.alertPos.x, this.alertPos.y, dt, 0.85);
      } else {
        this.state = 'search';
        this.searchTimer = 3 + Math.random() * 2;
        this.searchLook = { x: this.x, y: this.y };
      }
      return null;
    }

    if (this.state === 'search') {
      this.searchTimer -= dt;
      const sdx = this.searchLook.x - this.x;
      const sdy = this.searchLook.y - this.y;
      if (Math.hypot(sdx, sdy) > 12) {
        this.chargeToward(this.searchLook.x, this.searchLook.y, dt, 0.6);
      } else if (Math.random() < dt * 0.35) {
        this.searchLook = {
          x: this.x + (Math.random() - 0.5) * 80,
          y: this.y + (Math.random() - 0.5) * 80,
        };
      }
      if (this.searchTimer <= 0) {
        this.state = 'return';
        this.alertPos = null;
      }
      return null;
    }

    if (this.state === 'return') {
      const pdx = this.homeX - this.x;
      const pdy = this.homeY - this.y;
      if (Math.hypot(pdx, pdy) > 20) {
        this.chargeToward(this.homeX, this.homeY, dt, 0.6);
      } else {
        this.state = 'patrol';
        this.wait = 0.4 + Math.random() * 0.6;
      }
      return null;
    }

    this.state = 'patrol';
    this.wait -= dt;
    const pdx = this.targetX - this.x;
    const pdy = this.targetY - this.y;
    if (this.wait <= 0 || Math.hypot(pdx, pdy) <= 14) {
      if (this.wait <= 0) this.pickPatrol();
      else this.wait = 0.2;
    }
    const ndx = this.targetX - this.x;
    const ndy = this.targetY - this.y;
    if (Math.hypot(ndx, ndy) > 10) {
      const prevSpeed = this.speed;
      this.speed = this.isBoss ? 55 : 48;
      this.move(ndx, ndy, dt * 0.65);
      this.speed = prevSpeed;
      this.angle = Math.atan2(ndy, ndx);
      this.isCharging = false;
    }
    return null;
  }

  draw(ctx) {
    if (this.dead) {
      this.drawCorpse(ctx);
      return;
    }

    if (this.reloadTime > 0 && this.reloadDuration > 0) {
      const prog = 1 - this.reloadTime / this.reloadDuration;
      ctx.strokeStyle = this.bodyColor;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
      ctx.stroke();
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = this.bodyColor;
      ctx.font = '10px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText(`↻ ${Math.ceil(prog * 100)}%`, this.x, this.y - this.r - 14);
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 13, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.bodyColor;
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4a2020';
    ctx.fillRect(7, -3, 16, 6);

    ctx.restore();

    if (this.isCharging) {
      ctx.strokeStyle = this.isBoss ? 'rgba(190, 110, 255, 0.5)' : 'rgba(255, 80, 60, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 9, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (!this.dead && (this.state === 'attack' || this.state === 'search')) {
      ctx.fillStyle = this.state === 'search' ? '#f5e6a8' : '#ff6b6b';
      ctx.font = '11px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText(this.state === 'search' ? '?' : '!', this.x, this.y - 22);
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
  constructor(x, y, loot = [], opts = {}) {
    this.x = x;
    this.y = y;
    this.loot = loot;
    this.looted = false;
    this.searchProgress = 0;
    this.r = 18;
    this.ownerUid = opts.ownerUid || null;
    this.label = opts.label || 'PMC';
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
      ctx.fillText(this.label.slice(0, 8), this.x, this.y - 22);
    }
  }
}

export class RemotePlayer {
  constructor(uid, name, x, y, walls = []) {
    this.uid = uid;
    this.name = name;
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
    this.angle = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.dead = false;
    this.r = 16;
    this.walls = walls;
    this.weaponId = null;
  }

  applyState(s) {
    if (s.x != null) this.targetX = s.x;
    if (s.y != null) this.targetY = s.y;
    if (s.angle != null) this.angle = s.angle;
    if (s.hp != null) this.hp = s.hp;
    if (s.maxHp != null) this.maxHp = s.maxHp;
    if (s.dead) this.dead = true;
    if (s.name) this.name = s.name;
    if (s.weaponId != null) this.weaponId = s.weaponId;
  }

  update(dt) {
    const t = Math.min(1, dt * 12);
    this.x += (this.targetX - this.x) * t;
    this.y += (this.targetY - this.y) * t;
  }

  draw(ctx) {
    if (this.dead) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#c45c5c';
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, Math.PI * 2);
    ctx.fill();

    if (this.weaponId) drawHeldWeapon(ctx, this.weaponId);

    ctx.restore();

    const hpPct = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(this.x - 16, this.y - 28, 32, 4);
    ctx.fillStyle = hpPct > 0.35 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(this.x - 16, this.y - 28, 32 * hpPct, 4);

    ctx.fillStyle = '#e8dcc8';
    ctx.font = '8px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText(this.name.slice(0, 10), this.x, this.y - 32);
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

export class ThrownGrenade {
  constructor(x, y, targetX, targetY, walls, opts = {}) {
    this.x = x;
    this.y = y;
    this.walls = walls;
    this.kind = opts.kind || 'frag';
    this.dead = false;
    this.r = 6;

    const dx = targetX - x;
    const dy = targetY - y;
    const raw = Math.hypot(dx, dy) || 1;
    const minD = opts.minDist ?? 80;
    const maxD = opts.maxDist ?? 280;
    const d = Math.max(minD, Math.min(maxD, raw));
    const angle = Math.atan2(dy, dx);
    this.tx = x + Math.cos(angle) * d;
    this.ty = y + Math.sin(angle) * d;
    this.startX = x;
    this.startY = y;
    this.flightTime = opts.flightTime ?? 0.62;
    this.elapsed = 0;
    this.arcHeight = opts.arcHeight ?? 48;
  }

  update(dt) {
    if (this.dead) return;
    this.elapsed += dt;
    const t = Math.min(1, this.elapsed / this.flightTime);
    const nx = this.startX + (this.tx - this.startX) * t;
    const ny = this.startY + (this.ty - this.startY) * t - Math.sin(t * Math.PI) * this.arcHeight;
    this.x = nx;
    this.y = ny;

    for (const w of this.walls) {
      if (circleRectCollision(this.x, this.y, this.r, w)) {
        this.dead = true;
        return;
      }
    }
    if (t >= 1) this.dead = true;
  }

  draw(ctx) {
    if (this.dead) return;
    ctx.fillStyle = this.kind === 'smoke' ? '#6a7a6a' : '#4a5a42';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a9a7a';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export class SmokeZone {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 200;
    this.life = 12;
    this.maxLife = 12;
  }

  update(dt) {
    this.life -= dt;
  }

  draw(ctx) {
    const alpha = 0.45 * Math.min(1, this.life / 2);
    for (let i = 0; i < 3; i++) {
      const off = i * 18;
      const gr = this.r - off * 0.35;
      ctx.fillStyle = `rgba(100, 105, 100, ${alpha * (0.85 - i * 0.2)})`;
      ctx.beginPath();
      ctx.arc(this.x + off * 0.3, this.y - off * 0.2, gr, 0, Math.PI * 2);
      ctx.fill();
    }
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
