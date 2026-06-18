export const METER = 200;
export const WORLD_SCALE = 3;
export const GRID_UNITS = 4 * WORLD_SCALE;
export const MAP_W = METER * GRID_UNITS;
export const MAP_H = METER * GRID_UNITS;

let _mapBounds = { w: MAP_W, h: MAP_H };

export function setMapBounds(w, h) {
  _mapBounds = { w, h };
}

export function getMapBounds() {
  return _mapBounds;
}

export const EXTRACT_TIME = 5;

export const COLORS = {
  floor: '#1a1f16',
  floorGrid: '#242b1f',
  wall: '#4a4035',
  wallTop: '#6b5d4d',
  cover: '#3d3428',
  extract: 'rgba(46, 204, 113, 0.25)',
  extractBorder: '#2ecc71',
  player: '#8a9a7a',
  scav: '#b33a3a',
  boss: '#8e24aa',
  bullet: '#c8d4bc',
  loot: '#5dade2',
  lootRare: '#7a9a6a',
};

export const NIGHT_COLORS = {
  ...COLORS,
  floor: '#0a0c14',
  floorGrid: '#12161f',
  wall: '#2a3040',
  wallTop: '#3d4558',
};

export const LOOT_TABLE = {
  normal: [
    { id: 'empty', name: 'Пусто', weight: 2, value: 0 },
    { id: 'coin', name: 'Монета', weight: 3, value: 1 },
    { id: 'ammo', name: 'Патроны', weight: 3, value: 0, ammo: 18 },
    { id: 'bandage', name: 'Бинт', weight: 2, value: 0, heal: 25 },
    { id: 'food', name: 'Еда', weight: 2, value: 1 },
    { id: 'bolt', name: 'Болт', weight: 2, value: 2 },
    { id: 'chain', name: 'Цепь', weight: 1, value: 5 },
    { id: 'grenade', name: 'Граната', weight: 1, value: 8, consumable: true, grenade: true },
    { id: 'smoke', name: 'Дымовая', weight: 1, value: 6, consumable: true, smoke: true },
  ],
  valuable: [
    { id: 'ammo2', name: 'Патроны x2', weight: 2, value: 0, ammo: 36 },
    { id: 'medkit', name: 'Аптечка', weight: 3, value: 0, heal: 50, consumable: true },
    { id: 'armor', name: 'Бронежилет', weight: 2, value: 8, armor: 25 },
    { id: 'shotgun', name: 'Дробовик', weight: 2, value: 12, weapon: 'shotgun' },
    { id: 'ak', name: 'АК-74', weight: 1, value: 20, weapon: 'ak' },
    { id: 'pp', name: 'ПП-91', weight: 2, value: 28, weapon: 'pp' },
    { id: 'chain', name: 'Золотая цепь', weight: 2, value: 10 },
    { id: 'gpu', name: 'Видеокарта', weight: 1, value: 15 },
    { id: 'key', name: 'Ключ', weight: 1, value: 6 },
  ],
};

/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */

/** @param {number} px @param {number} py @param {Rect} r */
export function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

/** @param {number} cx @param {number} cy @param {number} cr @param {Rect} r */
export function circleRectCollision(cx, cy, cr, r) {
  const closestX = Math.max(r.x, Math.min(cx, r.x + r.w));
  const closestY = Math.max(r.y, Math.min(cy, r.y + r.h));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < cr * cr;
}

/** @param {number} cx @param {number} cy @param {number} cr @param {Rect} r */
export function resolveCircleRect(cx, cy, cr, r) {
  const closestX = Math.max(r.x, Math.min(cx, r.x + r.w));
  const closestY = Math.max(r.y, Math.min(cy, r.y + r.h));
  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= cr * cr || distSq === 0) return { x: cx, y: cy };
  const dist = Math.sqrt(distSq);
  const overlap = cr - dist;
  return { x: cx + (dx / dist) * overlap, y: cy + (dy / dist) * overlap };
}

/** @param {string} tier */
export function rollLoot(tier) {
  const table = LOOT_TABLE[tier];
  const total = table.reduce((s, i) => s + i.weight, 0);
  let roll = Math.random() * total;
  for (const item of table) {
    roll -= item.weight;
    if (roll <= 0) return { ...item, uid: `${item.id}-${Date.now()}-${Math.random()}` };
  }
  return { ...table[0], uid: `empty-${Date.now()}` };
}

export function generateScavLoot() {
  const count = 1 + Math.floor(Math.random() * 3);
  const items = [];
  for (let i = 0; i < count; i++) {
    let item = rollLoot('normal');
    let attempts = 0;
    while (item.id === 'empty' && attempts < 5) {
      item = rollLoot('normal');
      attempts++;
    }
    if (item.id !== 'empty') items.push(item);
  }
  if (items.length === 0) {
    items.push({ id: 'coin', name: 'Монета', weight: 1, value: 1, uid: `coin-${Date.now()}` });
  }
  return items;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
